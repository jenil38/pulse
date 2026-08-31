"""
PULSE — simulation orchestrator.

Ties the pieces together into one deterministic result the API/UI can render:
blast radius + a propagation timeline + business impact + a recovery plan.

A simulation NEVER touches real data. It is a pure computation over the graph.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .blast_radius import BlastRadius, compute_blast_radius
from .graph import DependencyGraph
from .recovery import RecoveryStep, generate_recovery_plan
from .states import FAILURE_LABEL, FailureType, NodeType

# Seconds of simulated wall-clock added per dependency hop, and per recovery step.
_SECONDS_PER_HOP = 180
_SECONDS_PER_RECOVERY_STEP = 300


@dataclass
class TimelineEvent:
    t: int              # seconds from failure injection
    node_id: str | None
    label: str
    kind: str           # inject | propagate | impact | recover | resolve


@dataclass
class SimulationResult:
    origin: str
    origin_name: str
    failure_type: FailureType
    failure_label: str
    duration_minutes: int
    blast: BlastRadius
    recovery: list[RecoveryStep]
    timeline: list[TimelineEvent]
    business_impact: dict = field(default_factory=dict)


def run_simulation(graph: DependencyGraph, origin: str, failure_type: FailureType,
                   duration_minutes: int = 30) -> SimulationResult:
    br = compute_blast_radius(graph, origin, failure_type)
    recovery = generate_recovery_plan(graph, br)
    timeline = _build_timeline(graph, br, recovery, duration_minutes)
    impact = _business_impact(graph, br)
    return SimulationResult(
        origin=origin,
        origin_name=graph.node(origin).name,
        failure_type=failure_type,
        failure_label=FAILURE_LABEL[failure_type],
        duration_minutes=duration_minutes,
        blast=br,
        recovery=recovery,
        timeline=timeline,
        business_impact=impact,
    )


def _build_timeline(graph: DependencyGraph, br: BlastRadius,
                    recovery: list[RecoveryStep], duration_minutes: int) -> list[TimelineEvent]:
    events: list[TimelineEvent] = [
        TimelineEvent(0, br.origin,
                      f"{graph.node(br.origin).name} — {FAILURE_LABEL[br.failure_type]} injected",
                      "inject"),
    ]
    # Propagation: nodes light up in hop order.
    for nid in br.affected_ids:
        impact = br.nodes[nid]
        t = impact.hops * _SECONDS_PER_HOP
        if graph.node(nid).type in (NodeType.DASHBOARD, NodeType.ML_MODEL):
            events.append(TimelineEvent(t, nid, f"{impact.name} becomes untrustworthy", "impact"))
        elif graph.node(nid).type in (NodeType.TEAM, NodeType.BUSINESS_PROCESS):
            events.append(TimelineEvent(t, nid, f"{impact.name} impacted", "impact"))
        else:
            events.append(TimelineEvent(t, nid, f"{impact.name} -> {impact.state.value}", "propagate"))

    # Recovery starts after the configured failure duration.
    base = duration_minutes * 60
    for step in recovery:
        t = base + (step.order - 1) * _SECONDS_PER_RECOVERY_STEP
        kind = "resolve" if step.kind == "resolve" else "recover"
        events.append(TimelineEvent(t, step.target_id, step.action, kind))

    events.sort(key=lambda e: (e.t, 0 if e.kind == "inject" else 1))
    return events


def _business_impact(graph: DependencyGraph, br: BlastRadius) -> dict:
    return {
        "affected_assets": br.total_affected,
        "critical_dashboards": [graph.node(n).name for n in br.critical_dashboards],
        "ml_models": [graph.node(n).name for n in br.ml_models],
        "business_processes": [graph.node(n).name for n in br.business_processes],
        "teams": [graph.node(n).name for n in br.teams],
        "blast_score": br.score,
    }
