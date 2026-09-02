/** PULSE — typed API client. */
import { authToken } from "./auth";
import type {
  Asset,
  Comparison,
  FailureType,
  FailureTypeInfo,
  HealthMetric,
  HealthOverview,
  Incident,
  IncidentDetail,
  Lineage,
  Resilience,
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authToken();
  let res: Response;

  try {
    res = await fetch(`${BASE}/api${path}`, {
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
  me: () => req<LoginResponse["user"]>("/auth/me"),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // --- topology ---------------------------------------------------------
  topology: () => req<Topology>("/systems/topology"),
  systems: () => req<SystemSummary[]>("/systems"),
  assets: () => req<Asset[]>("/assets"),
  asset: (id: string) => req<Lineage>(`/assets/${id}`),
  downstream: (id: string) => req<Asset[]>(`/assets/${id}/downstream`),

  // --- health & resilience ---------------------------------------------
  healthOverview: () => req<HealthOverview>("/health/overview"),
  healthMetrics: () => req<HealthMetric[]>("/health/metrics"),
  resilience: () => req<Resilience>("/resilience"),

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
  acknowledgeIncident: (id: string) =>
    req<Incident>(`/incidents/${id}/acknowledge`, { method: "POST" }),
  resolveIncident: (id: string) =>
    req<Incident>(`/incidents/${id}/resolve`, { method: "POST" }),
};
