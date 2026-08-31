/** PULSE — typed API client. */
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  topology: () => req<Topology>("/systems/topology"),
  systems: () => req<SystemSummary[]>("/systems"),
  assets: () => req<Asset[]>("/assets"),
  asset: (id: string) => req<Lineage>(`/assets/${id}`),
  downstream: (id: string) => req<Asset[]>(`/assets/${id}/downstream`),

  healthOverview: () => req<HealthOverview>("/health/overview"),
  healthMetrics: () => req<HealthMetric[]>("/health/metrics"),
  resilience: () => req<Resilience>("/resilience"),

  failureTypes: () => req<FailureTypeInfo[]>("/failure-types"),

  simulate: (body: {
    origin: string;
    failure_type: FailureType;
    duration_minutes?: number;
    parameter?: string | null;
  }) => req<Simulation>("/simulations", { method: "POST", body: JSON.stringify(body) }),
  simulation: (id: string) => req<Simulation>(`/simulations/${id}`),

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

  incidents: () => req<Incident[]>("/incidents"),
  incident: (id: string) => req<IncidentDetail>(`/incidents/${id}`),
  acknowledgeIncident: (id: string) =>
    req<Incident>(`/incidents/${id}/acknowledge`, { method: "POST" }),
  resolveIncident: (id: string) =>
    req<Incident>(`/incidents/${id}/resolve`, { method: "POST" }),
};
