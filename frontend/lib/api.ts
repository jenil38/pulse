/** PULSE — typed API client. */
import { authToken } from "./auth";
import { DEMO_SYSTEM_ID, activeSystemId } from "./workspace";
import type {
  ComponentDraft,
  ComponentTypeInfo,
  DependencyDraft,
  SavedScenario,
  SystemDetail,
  // `types.ts` already calls a system's internal lanes SystemSummary; this one
  // is a whole system in the workspace.
  SystemSummary as WorkspaceSystem,
} from "./workspace";
import type {
  Asset,
  Comparison,
  FailureType,
  FailureTypeInfo,
  AssetHistory,
  HealthHistory,
  HealthMetric,
  HealthOverview,
  IncidentFrequency,
  Incident,
  IncidentDetail,
  Lineage,
  Resilience,
  ResilienceHistory,
  Scenario,
  Simulation,
  SystemSummary,
  Topology,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * A failure the UI can reason about.
 *
 * `kind` lets surfaces distinguish "the server is down" from "you are signed
 * out" from "that asset does not exist", so error states can say something
 * useful instead of a generic apology. Raw stack traces are never surfaced.
 */
export type ApiErrorKind = "network" | "auth" | "notfound" | "validation" | "server";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;

  constructor(kind: ApiErrorKind, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }

  /** Short, human sentence for an error state. */
  get title(): string {
    switch (this.kind) {
      case "network":
        return "Cannot reach the PULSE API";
      case "auth":
        return "Your session has expired";
      case "notfound":
        return "Not found";
      case "validation":
        return "That request was not valid";
      default:
        return "Something went wrong";
    }
  }
}

function classify(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "notfound";
  if (status === 422 || status === 400 || status === 409) return "validation";
  return "server";
}

/**
 * Analysis routes read whichever system the workspace is pointed at.
 *
 * Stamping it here rather than at every call site is what let the topology,
 * health, simulation and incident screens become multi-system without being
 * rewritten. Auth and workspace routes are exempt: the first has no system,
 * and the second names its own in the path.
 */
function scoped(path: string): string {
  if (path.startsWith("/auth") || path.startsWith("/workspace")) return path;
  // A caller that named a system already means it — the landing page pins the
  // demo this way so a signed-in visitor's own system never rewrites the story.
  if (path.includes("system=")) return path;
  const id = activeSystemId();
  if (id === DEMO_SYSTEM_ID) return path;
  return `${path}${path.includes("?") ? "&" : "?"}system=${encodeURIComponent(id)}`;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authToken();
  let res: Response;

  try {
    res = await fetch(`${BASE}/api${scoped(path)}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    // fetch only rejects for transport-level problems.
    throw new ApiError("network", 0, "The API did not respond. Is the backend running?");
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(classify(res.status), res.status, detail);
  }

  // 204 from a delete carries no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
  description: string;
}

export interface LoginResponse {
  token: string;
  expires_at: number;
  demo: boolean;
  user: {
    email: string;
    name: string;
    role: string;
    initials: string;
    description: string;
  };
}

export const api = {
  // --- auth (demo) ------------------------------------------------------
  demoAccounts: () => req<DemoAccount[]>("/auth/demo-accounts"),
  login: (email: string, password: string) =>
    req<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    req<LoginResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  me: () => req<LoginResponse["user"]>("/auth/me"),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // --- workspace: the systems a user owns -------------------------------
  mySystems: () => req<WorkspaceSystem[]>("/workspace/systems"),
  demoSystem: () => req<WorkspaceSystem>("/workspace/demo"),
  system: (id: string) => req<SystemDetail>(`/workspace/systems/${id}`),
  componentTypes: () => req<ComponentTypeInfo[]>("/workspace/component-types"),
  createSystem: (body: {
    name: string;
    description?: string;
    components: ComponentDraft[];
    dependencies: DependencyDraft[];
  }) =>
    req<SystemDetail>("/workspace/systems", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  saveSystemGraph: (
    id: string,
    body: { components: ComponentDraft[]; dependencies: DependencyDraft[] }
  ) =>
    req<SystemDetail>(`/workspace/systems/${id}/graph`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  renameSystem: (id: string, body: { name?: string; description?: string }) =>
    req<SystemDetail>(`/workspace/systems/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSystem: (id: string) =>
    req<void>(`/workspace/systems/${id}`, { method: "DELETE" }),
  validateSystem: (body: {
    components: ComponentDraft[];
    dependencies: DependencyDraft[];
  }) =>
    req<{ ok: boolean; error?: string; component_count?: number; dependency_count?: number }>(
      "/workspace/systems/validate",
      { method: "POST", body: JSON.stringify(body) }
    ),

  savedScenarios: (id: string) =>
    req<SavedScenario[]>(`/workspace/systems/${id}/scenarios`),
  saveScenario: (
    id: string,
    body: {
      name: string;
      origin: string;
      failure_type: FailureType;
      duration_minutes?: number;
      parameter?: string | null;
    }
  ) =>
    req<SavedScenario>(`/workspace/systems/${id}/scenarios`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteScenario: (id: string, scenarioId: string) =>
    req<void>(`/workspace/systems/${id}/scenarios/${scenarioId}`, { method: "DELETE" }),

  // --- topology ---------------------------------------------------------
  topology: () => req<Topology>("/systems/topology"),
  /** The demo topology regardless of which system the workspace is on. */
  demoTopology: () => req<Topology>(`/systems/topology?system=${DEMO_SYSTEM_ID}`),
  demoSimulate: (body: {
    origin: string;
    failure_type: FailureType;
    duration_minutes?: number;
  }) =>
    req<Simulation>(`/simulations?system=${DEMO_SYSTEM_ID}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  systems: () => req<SystemSummary[]>("/systems"),
  assets: () => req<Asset[]>("/assets"),
  asset: (id: string) => req<Lineage>(`/assets/${id}`),
  downstream: (id: string) => req<Asset[]>(`/assets/${id}/downstream`),

  // --- health & resilience ---------------------------------------------
  healthOverview: () => req<HealthOverview>("/health/overview"),
  healthMetrics: () => req<HealthMetric[]>("/health/metrics"),
  resilience: () => req<Resilience>("/resilience"),

  // --- history / trends (SIMULATED, deterministic) ----------------------
  healthHistory: (points = 48) =>
    req<HealthHistory>(`/health/history?points=${points}`),
  resilienceHistory: (days = 30) =>
    req<ResilienceHistory>(`/health/resilience-history?days=${days}`),
  incidentFrequency: (days = 30) =>
    req<IncidentFrequency>(`/incidents/stats/frequency?days=${days}`),
  assetHistory: (id: string, points = 48) =>
    req<AssetHistory>(`/assets/${id}/history?points=${points}`),

  failureTypes: () => req<FailureTypeInfo[]>("/failure-types"),

  // --- simulations ------------------------------------------------------
  simulate: (body: {
    origin: string;
    failure_type: FailureType;
    duration_minutes?: number;
    parameter?: string | null;
  }) => req<Simulation>("/simulations", { method: "POST", body: JSON.stringify(body) }),
  simulation: (id: string) => req<Simulation>(`/simulations/${id}`),

  // --- scenarios --------------------------------------------------------
  scenarios: () => req<Scenario[]>("/scenarios"),
  runScenario: (id: string) =>
    req<Simulation>(`/scenarios/${id}/run`, { method: "POST" }),
  compare: (body: {
    a_origin: string;
    a_failure_type: FailureType;
    a_label?: string;
    b_origin: string;
    b_failure_type: FailureType;
    b_label?: string;
  }) => req<Comparison>("/scenarios/compare", { method: "POST", body: JSON.stringify(body) }),

  // --- incidents --------------------------------------------------------
  incidents: () => req<Incident[]>("/incidents"),
  incident: (id: string) => req<IncidentDetail>(`/incidents/${id}`),
  /** Keep a simulation as an incident on the active system. */
  recordIncident: (body: {
    origin: string;
    failure_type: FailureType;
    duration_minutes?: number;
  }) => req<Incident>("/incidents", { method: "POST", body: JSON.stringify(body) }),
  acknowledgeIncident: (id: string) =>
    req<Incident>(`/incidents/${id}/acknowledge`, { method: "POST" }),
  resolveIncident: (id: string) =>
    req<Incident>(`/incidents/${id}/resolve`, { method: "POST" }),
};
