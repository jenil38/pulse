/** PULSE — API types (mirrors backend Pydantic schemas). */

export type NodeType =
  | "SOURCE"
  | "INGESTION"
  | "RAW_TABLE"
  | "TRANSFORMATION"
  | "WAREHOUSE_TABLE"
  | "DATA_MODEL"
  | "DASHBOARD"
  | "ML_MODEL"
  | "BUSINESS_PROCESS"
  | "TEAM";

export type HealthState =
  | "HEALTHY"
  | "RECOVERING"
  | "STALE"
  | "DEGRADED"
  | "FAILED";

export type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ImpactSeverity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type FailureType =
  | "SOURCE_OUTAGE"
  | "SCHEMA_DRIFT"
  | "STALE_DATA"
  | "VOLUME_DROP"
  | "NULL_SPIKE"
  | "DUPLICATE_SPIKE"
  | "TRANSFORMATION_FAILURE"
  | "WAREHOUSE_DELAY"
  | "API_LATENCY"
  | "DATATYPE_CHANGE";

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Asset {
  id: string;
  name: string;
  type: NodeType;
  system: string;
  criticality: Criticality;
  owner: string;
  description: string;
  health_state: HealthState;
  position: Position | null;
}

export interface Dependency {
  upstream: string;
  downstream: string;
  kind: string;
}

export interface SystemSummary {
  name: string;
  asset_count: number;
  health: Record<string, number>;
}

export interface Topology {
  organization: string;
  telemetry_source: "SIMULATED";
  assets: Asset[];
  dependencies: Dependency[];
  systems: SystemSummary[];
}

export interface HealthMetric {
  asset_id: string;
  state: HealthState;
  freshness_seconds: number;
  freshness_target: number;
  row_volume: number;
  volume_delta_pct: number;
  null_ratio: number;
  schema_version: string;
  latency_ms: number;
  last_run_status: string;
  last_updated_iso: string;
  /** Short freshness history for sparklines. */
  trend: number[];
  source: "SIMULATED";
}

export interface HealthOverview {
  telemetry_source: "SIMULATED";
  counts: Record<string, number>;
  total_assets: number;
  active_incidents: number;
  resilience_score: number;
  weakest_component: string | null;
  weakest_reason: string;
}

export interface Lineage {
  asset: Asset;
  upstream: Asset[];
  downstream: Asset[];
  upstream_count: number;
  downstream_count: number;
  business_consumers: Asset[];
  metric: HealthMetric | null;
}

export interface NodeImpact {
  id: string;
  name: string;
  type: NodeType;
  state: HealthState;
  severity: ImpactSeverity;
  hops: number;
  untrustworthy: boolean;
  impacted: boolean;
}

export interface TimelineEvent {
  t: number;
  node_id: string | null;
  label: string;
  kind: "inject" | "propagate" | "impact" | "recover" | "resolve";
}

export interface RecoveryStep {
  order: number;
  action: string;
  target_id: string | null;
  target_name: string | null;
  kind: "restore" | "validate" | "backfill" | "rebuild" | "verify" | "resolve";
}

export interface BlastRadius {
  origin: string;
  origin_name: string;
  failure_type: FailureType;
  failure_label: string;
  mode: "STARVE" | "BREAK" | "CORRUPT";
  total_affected: number;
  blast_score: number;
  nodes: NodeImpact[];
  affected_ids: string[];
  critical_dashboards: string[];
  ml_models: string[];
  business_processes: string[];
  teams: string[];
  counts_by_type: Record<string, number>;
  counts_by_severity: Record<string, number>;
}

export interface Simulation {
  id: string;
  simulated: true;
  origin: string;
  origin_name: string;
  failure_type: FailureType;
  failure_label: string;
  parameter: string | null;
  duration_minutes: number;
  blast_radius: BlastRadius;
  recovery: RecoveryStep[];
  timeline: TimelineEvent[];
  business_impact: {
    affected_assets: number;
    critical_dashboards: string[];
    ml_models: string[];
    business_processes: string[];
    teams: string[];
    blast_score: number;
  };
}

export interface Scenario {
  id: string;
  name: string;
  origin: string;
  origin_name: string;
  failure_type: FailureType;
  parameter: string;
}

export interface ComparisonSide {
  label: string;
  origin: string;
  failure_type: string;
  affected_assets: number;
  critical_dashboards: number;
  ml_models: number;
  teams: number;
  blast_score: number;
}

export interface Comparison {
  a: ComparisonSide;
  b: ComparisonSide;
  ratio: number;
  verdict: string;
}

export interface ResilienceComponent {
  name: string;
  penalty: number;
  detail: string;
}

export interface Resilience {
  score: number;
  method: string;
  components: ResilienceComponent[];
  spof_count: number;
  spofs: Record<string, string[]>;
  weakest_component: string | null;
  weakest_component_name: string | null;
  weakest_reason: string;
}

export interface Incident {
  id: string;
  title: string;
  origin: string;
  origin_name: string;
  failure_type: FailureType;
  status: "open" | "acknowledged" | "recovering" | "resolved";
  severity: ImpactSeverity;
  started_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  affected_assets: number;
  teams: string[];
  simulated: boolean;
}

export interface IncidentDetail extends Incident {
  blast_radius: BlastRadius;
  recovery: RecoveryStep[];
  timeline: TimelineEvent[];
}

export interface FailureTypeInfo {
  value: FailureType;
  label: string;
  mode: "STARVE" | "BREAK" | "CORRUPT";
}

/** Time-series point. `t` is seconds relative to now (negative = past). */
export interface SeriesPoint {
  t: number;
  value: number;
}

export interface HealthHistory {
  simulated: boolean;
  points: {
    t: number;
    healthy: number;
    degraded: number;
    stale: number;
    failed: number;
    recovering: number;
  }[];
}

export interface ResilienceHistory {
  simulated: boolean;
  current: number;
  points: SeriesPoint[];
}

export interface IncidentFrequency {
  simulated: boolean;
  total: number;
  points: { t: number; count: number }[];
}

export interface AssetHistory {
  asset_id: string;
  simulated: boolean;
  freshness: SeriesPoint[];
  volume: SeriesPoint[];
  latency: SeriesPoint[];
}
