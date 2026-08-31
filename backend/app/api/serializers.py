"""Engine dataclasses -> API schema conversion."""
from __future__ import annotations

from ..engine.blast_radius import BlastRadius
from ..engine.graph import DependencyGraph
from ..engine.health import HealthMetric
from ..engine.layout import Position
from ..engine.recovery import RecoveryStep
from ..engine.simulation import SimulationResult, TimelineEvent
from ..engine.states import FAILURE_LABEL, HealthState
from ..schemas.models import (
    AssetOut,
    BlastRadiusOut,
    HealthMetricOut,
    NodeImpactOut,
    PositionOut,
    RecoveryStepOut,
    TimelineEventOut,
)


def asset_out(graph: DependencyGraph, aid: str,
              positions: dict[str, Position] | None = None,
              state: HealthState = HealthState.HEALTHY) -> AssetOut:
    a = graph.node(aid)
    pos = None
    if positions and aid in positions:
        p = positions[aid]
        pos = PositionOut(x=p.x, y=p.y, z=p.z)
    return AssetOut(
        id=a.id, name=a.name, type=a.type, system=a.system,
        criticality=a.criticality, owner=a.owner, description=a.description,
        health_state=state, position=pos,
    )


def metric_out(m: HealthMetric) -> HealthMetricOut:
    return HealthMetricOut(
        asset_id=m.asset_id, state=m.state,
        freshness_seconds=m.freshness_seconds, freshness_target=m.freshness_target,
        row_volume=m.row_volume, volume_delta_pct=m.volume_delta_pct,
        null_ratio=m.null_ratio, schema_version=m.schema_version,
        latency_ms=m.latency_ms, last_run_status=m.last_run_status,
        last_updated_iso=m.last_updated_iso,
    )


def blast_out(graph: DependencyGraph, br: BlastRadius) -> BlastRadiusOut:
    return BlastRadiusOut(
        origin=br.origin,
        origin_name=graph.node(br.origin).name,
        failure_type=br.failure_type,
        failure_label=FAILURE_LABEL[br.failure_type],
        mode=br.mode.value,
        total_affected=br.total_affected,
        blast_score=br.score,
        nodes=[
            NodeImpactOut(
                id=n.id, name=n.name, type=n.type, state=n.state,
                severity=n.severity, hops=n.hops,
                untrustworthy=n.untrustworthy, impacted=n.impacted,
            )
            for n in sorted(br.nodes.values(), key=lambda x: (x.hops, x.id))
        ],
        affected_ids=br.affected_ids,
        critical_dashboards=br.critical_dashboards,
        ml_models=br.ml_models,
        business_processes=br.business_processes,
        teams=br.teams,
        counts_by_type=br.counts_by_type(),
        counts_by_severity=br.counts_by_severity(),
    )


def recovery_out(steps: list[RecoveryStep]) -> list[RecoveryStepOut]:
    return [
        RecoveryStepOut(order=s.order, action=s.action, target_id=s.target_id,
                        target_name=s.target_name, kind=s.kind)
        for s in steps
    ]


def timeline_out(events: list[TimelineEvent]) -> list[TimelineEventOut]:
    return [
        TimelineEventOut(t=e.t, node_id=e.node_id, label=e.label, kind=e.kind)
        for e in events
    ]
