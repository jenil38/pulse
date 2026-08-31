"""
PULSE — blast-radius engine.

Given a topology, an origin node and a failure type, deterministically compute:
  * the state every downstream node ends up in,
  * a per-node impact severity,
  * which critical dashboards / ML models / teams are affected,
  * the hop distance (used for timeline sequencing),
  * an overall blast-radius score for scenario comparison.

Propagation model (fully explainable — no probabilities):

  1. The origin takes ORIGIN_STATE[failure_type].
  2. We walk the origin's descendants in topological order. Each node inspects
     its *affected* upstream neighbours, takes the worst incoming state, and
     applies a transition rule that depends on the failure's PropagationMode
     and the node's type.
  3. A node is only affected if at least one of its upstreams is affected — so
     unrelated branches of the graph stay HEALTHY.

Transition rules (`_transition`):
  * Data assets:   STARVE -> STALE, CORRUPT -> DEGRADED,
                   BREAK  -> FAILED for transformations, DEGRADED otherwise.
  * Dashboards/ML: always DEGRADED and flagged `untrustworthy`.
  * Processes/Teams: DEGRADED and flagged `impacted`.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .graph import DependencyGraph
from .states import (
    CONSUMER_TYPES,
    CRIT_WEIGHT,
    DATA_ASSET_TYPES,
    FAILURE_MODE,
    IMPACT_TYPES,
    ORIGIN_STATE,
    SEVERITY_RANK,
    Criticality,
    FailureType,
    HealthState,
    ImpactSeverity,
    NodeType,
    PropagationMode,
)


def _transition(incoming: HealthState, node_type: NodeType,
                mode: PropagationMode) -> HealthState:
    """State a node takes given the worst incoming state and failure mode."""
    if node_type in CONSUMER_TYPES:
        # A dashboard/ML never "fails" — it becomes untrustworthy.
        return HealthState.DEGRADED
    if node_type in IMPACT_TYPES:
        return HealthState.DEGRADED
    # data asset
    if mode is PropagationMode.STARVE:
        return HealthState.STALE
    if mode is PropagationMode.CORRUPT:
        return HealthState.DEGRADED
    # BREAK
    if node_type is NodeType.TRANSFORMATION:
        return HealthState.FAILED
    return HealthState.DEGRADED


def _severity(state: HealthState, crit: Criticality,
              node_type: NodeType) -> ImpactSeverity:
    """Business-facing severity from health state + criticality."""
    if state is HealthState.HEALTHY:
        return ImpactSeverity.NONE
    crit_w = CRIT_WEIGHT[crit]
    state_w = SEVERITY_RANK[state]  # STALE 2, DEGRADED 3, FAILED 4
    score = crit_w * state_w
    # Consumers with critical/high criticality escalate — an untrustworthy
    # board dashboard is a critical business impact even though it isn't "FAILED".
    if node_type in CONSUMER_TYPES and crit in (Criticality.CRITICAL, Criticality.HIGH):
        score = max(score, 15)
    if score >= 15:
        return ImpactSeverity.CRITICAL
    if score >= 9:
        return ImpactSeverity.HIGH
    if score >= 4:
        return ImpactSeverity.MEDIUM
    return ImpactSeverity.LOW


@dataclass
class NodeImpact:
    id: str
    name: str
    type: NodeType
    state: HealthState
    severity: ImpactSeverity
    hops: int
    untrustworthy: bool = False   # dashboards/ML
    impacted: bool = False        # processes/teams


@dataclass
class BlastRadius:
    origin: str
    failure_type: FailureType
    mode: PropagationMode
    nodes: dict[str, NodeImpact] = field(default_factory=dict)

    # ---- derived aggregates (populated by compute_blast_radius) ----------
    affected_ids: list[str] = field(default_factory=list)          # excludes origin
    critical_dashboards: list[str] = field(default_factory=list)
    ml_models: list[str] = field(default_factory=list)
    business_processes: list[str] = field(default_factory=list)
    teams: list[str] = field(default_factory=list)
    score: float = 0.0

    @property
    def total_affected(self) -> int:
        return len(self.affected_ids)

    def counts_by_type(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for nid in self.affected_ids:
            t = self.nodes[nid].type.value
            out[t] = out.get(t, 0) + 1
        return out

    def counts_by_severity(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for nid in self.affected_ids:
            s = self.nodes[nid].severity.value
            out[s] = out.get(s, 0) + 1
        return out


def compute_blast_radius(graph: DependencyGraph, origin: str,
                         failure_type: FailureType) -> BlastRadius:
    if origin not in graph:
        raise KeyError(f"unknown origin node: {origin}")

    mode = FAILURE_MODE[failure_type]
    origin_state = ORIGIN_STATE[failure_type]
    hops = graph.shortest_hops(origin)

    states: dict[str, HealthState] = {origin: origin_state}

    # Walk descendants in dependency order so every upstream is decided first.
    descendants = graph.descendants(origin)
    order = graph.topological_order(descendants | {origin})
    for nid in order:
        if nid == origin:
            continue
        affected_parents = [p for p in graph.predecessors(nid) if p in states]
        if not affected_parents:
            continue
        worst = max((states[p] for p in affected_parents),
                    key=lambda s: SEVERITY_RANK[s])
        states[nid] = _transition(worst, graph.node(nid).type, mode)

    br = BlastRadius(origin=origin, failure_type=failure_type, mode=mode)
    for nid, state in states.items():
        asset = graph.node(nid)
        sev = _severity(state, asset.criticality, asset.type)
        impact = NodeImpact(
            id=nid, name=asset.name, type=asset.type, state=state,
            severity=sev, hops=hops.get(nid, 0),
            untrustworthy=asset.type in CONSUMER_TYPES,
            impacted=asset.type in IMPACT_TYPES,
        )
        br.nodes[nid] = impact

    br.affected_ids = sorted(
        (nid for nid in states if nid != origin),
        key=lambda n: (br.nodes[n].hops, n),
    )
    br.critical_dashboards = sorted(
        nid for nid in br.affected_ids
        if br.nodes[nid].type is NodeType.DASHBOARD
        and graph.node(nid).criticality in (Criticality.CRITICAL, Criticality.HIGH)
    )
    br.ml_models = sorted(
        nid for nid in br.affected_ids if br.nodes[nid].type is NodeType.ML_MODEL)
    br.business_processes = sorted(
        nid for nid in br.affected_ids if br.nodes[nid].type is NodeType.BUSINESS_PROCESS)
    br.teams = sorted(
        nid for nid in br.affected_ids if br.nodes[nid].type is NodeType.TEAM)
    br.score = _blast_score(graph, br)
    return br


def _blast_score(graph: DependencyGraph, br: BlastRadius) -> float:
    """A single comparable number: sum of criticality x state-severity.

    Used by scenario comparison ("2.1x greater blast radius"). Deterministic.
    """
    total = 0.0
    for nid in br.affected_ids:
        impact = br.nodes[nid]
        crit_w = CRIT_WEIGHT[graph.node(nid).criticality]
        total += crit_w * SEVERITY_RANK[impact.state]
    return round(total, 2)
