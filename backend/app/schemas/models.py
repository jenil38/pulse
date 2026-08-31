"""PULSE — Pydantic API schemas."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..engine.states import Criticality, FailureType, HealthState, ImpactSeverity, NodeType


# --------------------------------------------------------------------------- #
#  Topology
# --------------------------------------------------------------------------- #
class PositionOut(BaseModel):
    x: float
    y: float
    z: float


class AssetOut(BaseModel):
    id: str
    name: str
    type: NodeType
    system: str
    criticality: Criticality
    owner: str
    description: str = ""
    health_state: HealthState = HealthState.HEALTHY
    position: Optional[PositionOut] = None


class DependencyOut(BaseModel):
    upstream: str
    downstream: str
    kind: str = "data"


class SystemOut(BaseModel):
    name: str
    asset_count: int
    health: dict[str, int]


class TopologyOut(BaseModel):
    organization: str
    telemetry_source: Literal["SIMULATED"] = "SIMULATED"
    assets: list[AssetOut]
    dependencies: list[DependencyOut]
    systems: list[SystemOut]


# --------------------------------------------------------------------------- #
#  Health
# --------------------------------------------------------------------------- #
class HealthMetricOut(BaseModel):
    asset_id: str
    state: HealthState
    freshness_seconds: int
    freshness_target: int
    row_volume: int
    volume_delta_pct: float
    null_ratio: float
    schema_version: str
    latency_ms: int
    last_run_status: str
    last_updated_iso: str
    source: Literal["SIMULATED"] = "SIMULATED"


class HealthOverviewOut(BaseModel):
    telemetry_source: Literal["SIMULATED"] = "SIMULATED"
    counts: dict[str, int]
    total_assets: int
    active_incidents: int
    resilience_score: int
    weakest_component: Optional[str] = None
    weakest_reason: str = ""


# --------------------------------------------------------------------------- #
#  Lineage / inspector
# --------------------------------------------------------------------------- #
class LineageOut(BaseModel):
    asset: AssetOut
    upstream: list[AssetOut]
    downstream: list[AssetOut]
    upstream_count: int
    downstream_count: int
    business_consumers: list[AssetOut]
    metric: Optional[HealthMetricOut] = None


# --------------------------------------------------------------------------- #
#  Simulation / blast radius
# --------------------------------------------------------------------------- #
class SimulationRequest(BaseModel):
    origin: str = Field(..., description="asset id where the failure starts")
    failure_type: FailureType
    duration_minutes: int = Field(30, ge=1, le=1440)
    parameter: Optional[str] = Field(
        None, description="human-readable change, e.g. 'amount: DECIMAL -> STRING'")


class NodeImpactOut(BaseModel):
    id: str
    name: str
    type: NodeType
    state: HealthState
    severity: ImpactSeverity
    hops: int
    untrustworthy: bool
    impacted: bool


class TimelineEventOut(BaseModel):
    t: int
    node_id: Optional[str]
    label: str
    kind: str


class RecoveryStepOut(BaseModel):
    order: int
    action: str
    target_id: Optional[str]
    target_name: Optional[str]
    kind: str


class BlastRadiusOut(BaseModel):
    origin: str
    origin_name: str
    failure_type: FailureType
    failure_label: str
    mode: str
    total_affected: int
    blast_score: float
    nodes: list[NodeImpactOut]
    affected_ids: list[str]
    critical_dashboards: list[str]
    ml_models: list[str]
    business_processes: list[str]
    teams: list[str]
    counts_by_type: dict[str, int]
    counts_by_severity: dict[str, int]


class SimulationOut(BaseModel):
    id: str
    simulated: Literal[True] = True
    origin: str
    origin_name: str
    failure_type: FailureType
    failure_label: str
    parameter: Optional[str] = None
    duration_minutes: int
    blast_radius: BlastRadiusOut
    recovery: list[RecoveryStepOut]
    timeline: list[TimelineEventOut]
    business_impact: dict


# --------------------------------------------------------------------------- #
#  Scenarios & comparison
# --------------------------------------------------------------------------- #
class ScenarioOut(BaseModel):
    id: str
    name: str
    origin: str
    origin_name: str
    failure_type: FailureType
    parameter: str


class ComparisonRequest(BaseModel):
    a_origin: str
    a_failure_type: FailureType
    a_label: Optional[str] = None
    b_origin: str
    b_failure_type: FailureType
    b_label: Optional[str] = None


class ComparisonSideOut(BaseModel):
    label: str
    origin: str
    failure_type: str
    affected_assets: int
    critical_dashboards: int
    ml_models: int
    teams: int
    blast_score: float


class ComparisonOut(BaseModel):
    a: ComparisonSideOut
    b: ComparisonSideOut
    ratio: float
    verdict: str


# --------------------------------------------------------------------------- #
#  Resilience
# --------------------------------------------------------------------------- #
class ResilienceComponentOut(BaseModel):
    name: str
    penalty: float
    detail: str


class ResilienceOut(BaseModel):
    score: int
    method: str
    components: list[ResilienceComponentOut]
    spof_count: int
    spofs: dict[str, list[str]]
    weakest_component: Optional[str]
    weakest_component_name: Optional[str]
    weakest_reason: str


# --------------------------------------------------------------------------- #
#  Incidents
# --------------------------------------------------------------------------- #
class IncidentOut(BaseModel):
    id: str
    title: str
    origin: str
    origin_name: str
    failure_type: FailureType
    status: str  # open | acknowledged | recovering | resolved
    severity: ImpactSeverity
    started_at: str
    acknowledged_at: Optional[str] = None
    resolved_at: Optional[str] = None
    affected_assets: int
    teams: list[str]
    simulated: bool = True


class IncidentDetailOut(IncidentOut):
    blast_radius: BlastRadiusOut
    recovery: list[RecoveryStepOut]
    timeline: list[TimelineEventOut]
