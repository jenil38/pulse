"""
PULSE — REST API routes.

Resource groups: systems/topology, assets/lineage, health, simulations,
scenarios, comparison, resilience, incidents, recovery.

Every telemetry payload is labelled SIMULATED. No route mutates real data;
simulations are pure computations over the dependency graph.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from ..engine import compute_blast_radius, compute_resilience, find_spofs
from ..engine.health import rollup, snapshot
from ..engine.history import (
    asset_history,
    health_history,
    incident_history,
    resilience_history,
)
from ..engine.recovery import generate_recovery_plan
from ..engine.scenarios import DEMO_SCENARIOS, SCENARIOS_BY_ID, compare, run_scenario
from ..engine.simulation import run_simulation
from ..engine.states import (
    CONSUMER_TYPES,
    FAILURE_LABEL,
    IMPACT_TYPES,
    FailureType,
    HealthState,
    NodeType,
)
from ..engine.topology import ORGANIZATION
from ..schemas.models import (
    AssetOut,
    ComparisonOut,
    ComparisonRequest,
    ComparisonSideOut,
    DependencyOut,
    HealthMetricOut,
    HealthOverviewOut,
    IncidentDetailOut,
    IncidentOut,
    LineageOut,
    ResilienceComponentOut,
    ResilienceOut,
    ScenarioOut,
    SimulationOut,
    SimulationRequest,
    SystemOut,
    TopologyOut,
)
from . import store
from .serializers import asset_out, blast_out, metric_out, recovery_out, timeline_out

router = APIRouter()

RESILIENCE_METHOD = (
    "score = 100 - penalties(single_points_of_failure, blast_concentration, "
    "source_redundancy, dependency_depth, incident_history, recovery_complexity). "
    "Deterministic graph analysis - no ML, no probability."
)


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


# --------------------------------------------------------------------------- #
#  Meta
# --------------------------------------------------------------------------- #
@router.get("/health", tags=["meta"])
def api_health():
    return {"status": "ok", "organization": ORGANIZATION, "telemetry_source": "SIMULATED"}


@router.get("/failure-types", tags=["meta"])
def failure_types():
    from ..engine.states import FAILURE_MODE
    return [
        {"value": ft.value, "label": FAILURE_LABEL[ft], "mode": FAILURE_MODE[ft].value}
        for ft in FailureType
    ]


# --------------------------------------------------------------------------- #
#  Systems / topology
# --------------------------------------------------------------------------- #
@router.get("/systems", response_model=list[SystemOut], tags=["systems"])
def list_systems():
    g = store.graph()
    metrics = snapshot(g)
    by_system: dict[str, list[str]] = {}
    for aid, a in g.assets.items():
        by_system.setdefault(a.system, []).append(aid)
    out = []
    for name in sorted(by_system):
        ids = by_system[name]
        counts = {s.value: 0 for s in HealthState}
        for aid in ids:
            counts[metrics[aid].state.value] += 1
        out.append(SystemOut(name=name, asset_count=len(ids), health=counts))
    return out


@router.get("/systems/topology", response_model=TopologyOut, tags=["systems"])
def get_topology():
    """Full dependency graph with stable 3D positions and simulated health."""
    g = store.graph()
    pos = store.layout()
    metrics = snapshot(g)
    assets = [asset_out(g, aid, pos, metrics[aid].state) for aid in g.ids()]
    deps = [DependencyOut(upstream=d.upstream, downstream=d.downstream, kind=d.kind)
            for d in g.dependencies]
    return TopologyOut(
        organization=ORGANIZATION,
        assets=assets, dependencies=deps, systems=list_systems(),
    )


# --------------------------------------------------------------------------- #
#  Assets / lineage
# --------------------------------------------------------------------------- #
@router.get("/assets", response_model=list[AssetOut], tags=["assets"])
def list_assets(system: str | None = None, type: NodeType | None = None):
    g = store.graph()
    pos = store.layout()
    metrics = snapshot(g)
    out = []
    for aid in g.ids():
        a = g.node(aid)
        if system and a.system != system:
            continue
        if type and a.type != type:
            continue
        out.append(asset_out(g, aid, pos, metrics[aid].state))
    return out


@router.get("/assets/{asset_id}", response_model=LineageOut, tags=["assets"])
def get_asset(asset_id: str):
    g = store.graph()
    if asset_id not in g:
        raise HTTPException(404, f"unknown asset: {asset_id}")
    pos = store.layout()
    metrics = snapshot(g)
    consumers = sorted(
        n for n in g.descendants(asset_id) if g.node(n).type in IMPACT_TYPES)
    return LineageOut(
        asset=asset_out(g, asset_id, pos, metrics[asset_id].state),
        upstream=[asset_out(g, n, pos, metrics[n].state) for n in g.predecessors(asset_id)],
        downstream=[asset_out(g, n, pos, metrics[n].state) for n in g.successors(asset_id)],
        upstream_count=len(g.ancestors(asset_id)),
        downstream_count=len(g.descendants(asset_id)),
        business_consumers=[asset_out(g, n, pos, metrics[n].state) for n in consumers],
        metric=metric_out(metrics[asset_id]),
    )


@router.get("/assets/{asset_id}/downstream", response_model=list[AssetOut], tags=["assets"])
def get_downstream(asset_id: str):
    g = store.graph()
    if asset_id not in g:
        raise HTTPException(404, f"unknown asset: {asset_id}")
    pos, metrics = store.layout(), snapshot(g)
    return [asset_out(g, n, pos, metrics[n].state) for n in sorted(g.descendants(asset_id))]


@router.get("/assets/{asset_id}/dependencies", tags=["assets"])
def get_dependencies(asset_id: str):
    g = store.graph()
    if asset_id not in g:
        raise HTTPException(404, f"unknown asset: {asset_id}")
    return {
        "asset": asset_id,
        "upstream": sorted(g.ancestors(asset_id)),
        "downstream": sorted(g.descendants(asset_id)),
        "direct_upstream": g.predecessors(asset_id),
        "direct_downstream": g.successors(asset_id),
    }


# --------------------------------------------------------------------------- #
#  Health
# --------------------------------------------------------------------------- #
@router.get("/health/overview", response_model=HealthOverviewOut, tags=["health"])
def health_overview():
    g = store.graph()
    metrics = snapshot(g)
    res = compute_resilience(g)
    weakest_name = g.node(res.weakest_component).name if res.weakest_component else None
    return HealthOverviewOut(
        counts=rollup(metrics),
        total_assets=len(g.assets),
        active_incidents=store.active_incident_count(),
        resilience_score=res.score,
        weakest_component=weakest_name,
        weakest_reason=res.weakest_reason,
    )


@router.get("/health/metrics", response_model=list[HealthMetricOut], tags=["health"])
def health_metrics(trend_points: int = Query(12, ge=0, le=48)):
    """
    Current metrics for every asset, each with a short freshness trend so the
    asset table can draw sparklines from a single request rather than issuing
    one call per row.
    """
    g = store.graph()
    out = []
    for m in snapshot(g).values():
        row = metric_out(m)
        if trend_points:
            hist = asset_history(g, m.asset_id, points=trend_points, step_seconds=3600)
            row.trend = [p.value for p in hist.freshness]
        out.append(row)
    return out


# --------------------------------------------------------------------------- #
#  Resilience
# --------------------------------------------------------------------------- #
@router.get("/resilience", response_model=ResilienceOut, tags=["resilience"])
def resilience():
    g = store.graph()
    res = compute_resilience(g)
    spofs = find_spofs(g)
    return ResilienceOut(
        score=res.score,
        method=RESILIENCE_METHOD,
        components=[ResilienceComponentOut(name=c.name, penalty=c.penalty, detail=c.detail)
                    for c in res.components],
        spof_count=res.spof_count,
        spofs=spofs,
        weakest_component=res.weakest_component,
        weakest_component_name=g.node(res.weakest_component).name if res.weakest_component else None,
        weakest_reason=res.weakest_reason,
    )


# --------------------------------------------------------------------------- #
#  Simulations
# --------------------------------------------------------------------------- #
def _simulation_payload(sid: str, result, parameter: str | None) -> SimulationOut:
    g = store.graph()
    return SimulationOut(
        id=sid,
        origin=result.origin, origin_name=result.origin_name,
        failure_type=result.failure_type, failure_label=result.failure_label,
        parameter=parameter, duration_minutes=result.duration_minutes,
        blast_radius=blast_out(g, result.blast),
        recovery=recovery_out(result.recovery),
        timeline=timeline_out(result.timeline),
        business_impact=result.business_impact,
    )


@router.post("/simulations", response_model=SimulationOut, tags=["simulations"])
def create_simulation(req: SimulationRequest):
    """Run a SAFE, deterministic failure simulation. Never touches real data."""
    g = store.graph()
    if req.origin not in g:
        raise HTTPException(404, f"unknown asset: {req.origin}")
    result = run_simulation(g, req.origin, req.failure_type, req.duration_minutes)
    sid = store.save_simulation(result, req.parameter)
    return _simulation_payload(sid, result, req.parameter)


@router.get("/simulations/{sim_id}", response_model=SimulationOut, tags=["simulations"])
def get_simulation(sim_id: str):
    result, meta = store.simulation(sim_id)
    if result is None:
        raise HTTPException(404, f"unknown simulation: {sim_id}")
    return _simulation_payload(sim_id, result, meta.get("parameter"))


@router.get("/simulations/{sim_id}/blast-radius", tags=["simulations"])
def get_simulation_blast(sim_id: str):
    result, _ = store.simulation(sim_id)
    if result is None:
        raise HTTPException(404, f"unknown simulation: {sim_id}")
    return blast_out(store.graph(), result.blast)


# --------------------------------------------------------------------------- #
#  Scenarios & comparison
# --------------------------------------------------------------------------- #
@router.get("/scenarios", response_model=list[ScenarioOut], tags=["scenarios"])
def list_scenarios():
    g = store.graph()
    return [
        ScenarioOut(id=s.id, name=s.name, origin=s.origin,
                    origin_name=g.node(s.origin).name,
                    failure_type=s.failure_type, parameter=s.parameter)
        for s in DEMO_SCENARIOS
    ]


@router.post("/scenarios/{scenario_id}/run", response_model=SimulationOut, tags=["scenarios"])
def run_demo_scenario(scenario_id: str, duration_minutes: int = Query(30, ge=1, le=1440)):
    if scenario_id not in SCENARIOS_BY_ID:
        raise HTTPException(404, f"unknown scenario: {scenario_id}")
    g = store.graph()
    result = run_scenario(g, scenario_id, duration_minutes)
    sid = store.save_simulation(result, SCENARIOS_BY_ID[scenario_id].parameter)
    return _simulation_payload(sid, result, SCENARIOS_BY_ID[scenario_id].parameter)


@router.post("/scenarios/compare", response_model=ComparisonOut, tags=["scenarios"])
def compare_scenarios(req: ComparisonRequest):
    g = store.graph()
    for oid in (req.a_origin, req.b_origin):
        if oid not in g:
            raise HTTPException(404, f"unknown asset: {oid}")
    a_label = req.a_label or f"{FAILURE_LABEL[req.a_failure_type]} — {g.node(req.a_origin).name}"
    b_label = req.b_label or f"{FAILURE_LABEL[req.b_failure_type]} — {g.node(req.b_origin).name}"
    c = compare(g, req.a_origin, req.a_failure_type, a_label,
                req.b_origin, req.b_failure_type, b_label)
    return ComparisonOut(
        a=ComparisonSideOut(**c.a), b=ComparisonSideOut(**c.b),
        ratio=c.ratio, verdict=c.verdict,
    )


# --------------------------------------------------------------------------- #
#  Incidents
# --------------------------------------------------------------------------- #
def _incident_out(inc) -> IncidentOut:
    g = store.graph()
    br = compute_blast_radius(g, inc.origin, inc.failure_type)
    return IncidentOut(
        id=inc.id, title=inc.title, origin=inc.origin,
        origin_name=g.node(inc.origin).name, failure_type=inc.failure_type,
        status=inc.status, severity=store.incident_severity(inc),
        started_at=_iso(inc.started_at), acknowledged_at=_iso(inc.acknowledged_at),
        resolved_at=_iso(inc.resolved_at), affected_assets=br.total_affected,
        teams=[g.node(t).name for t in br.teams],
    )


@router.get("/incidents", response_model=list[IncidentOut], tags=["incidents"])
def list_incidents(status: str | None = None):
    out = [_incident_out(i) for i in store.incidents()]
    return [i for i in out if not status or i.status == status]


@router.get("/incidents/{incident_id}", response_model=IncidentDetailOut, tags=["incidents"])
def get_incident(incident_id: str):
    inc = store.incident(incident_id)
    if inc is None:
        raise HTTPException(404, f"unknown incident: {incident_id}")
    g = store.graph()
    result = run_simulation(g, inc.origin, inc.failure_type, inc.duration_minutes)
    base = _incident_out(inc)
    return IncidentDetailOut(
        **base.model_dump(),
        blast_radius=blast_out(g, result.blast),
        recovery=recovery_out(result.recovery),
        timeline=timeline_out(result.timeline),
    )


@router.post("/incidents/{incident_id}/acknowledge", response_model=IncidentOut, tags=["incidents"])
def acknowledge_incident(incident_id: str):
    inc = store.incident(incident_id)
    if inc is None:
        raise HTTPException(404, f"unknown incident: {incident_id}")
    if inc.status == "resolved":
        raise HTTPException(409, "incident already resolved")
    inc.status = "acknowledged"
    inc.acknowledged_at = inc.acknowledged_at or datetime.now(timezone.utc)
    return _incident_out(inc)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut, tags=["incidents"])
def resolve_incident(incident_id: str):
    inc = store.incident(incident_id)
    if inc is None:
        raise HTTPException(404, f"unknown incident: {incident_id}")
    inc.status = "resolved"
    inc.acknowledged_at = inc.acknowledged_at or datetime.now(timezone.utc)
    inc.resolved_at = datetime.now(timezone.utc)
    return _incident_out(inc)


@router.get("/incidents/{incident_id}/recovery", tags=["recovery"])
def get_incident_recovery(incident_id: str):
    inc = store.incident(incident_id)
    if inc is None:
        raise HTTPException(404, f"unknown incident: {incident_id}")
    g = store.graph()
    br = compute_blast_radius(g, inc.origin, inc.failure_type)
    return {"incident": incident_id, "steps": recovery_out(generate_recovery_plan(g, br))}


# --------------------------------------------------------------------------- #
#  History / trends  (SIMULATED, deterministic — see engine/history.py)
# --------------------------------------------------------------------------- #
@router.get("/health/history", tags=["health"])
def get_health_history(
    points: int = Query(48, ge=8, le=168),
    step_seconds: int = Query(1800, ge=300, le=86400),
):
    """Fleet-wide health counts over the recent window."""
    return {
        "simulated": True,
        "points": health_history(store.graph(), points=points, step_seconds=step_seconds),
    }


@router.get("/health/resilience-history", tags=["health"])
def get_resilience_history(days: int = Query(30, ge=7, le=90)):
    """
    Daily resilience score, converging on today's real computed value so the
    trend can never contradict the number displayed beside it.
    """
    current = compute_resilience(store.graph()).score
    series = resilience_history(points=days, current=current)
    return {
        "simulated": True,
        "current": current,
        "points": [{"t": p.t, "value": p.value} for p in series],
    }


@router.get("/incidents/stats/frequency", tags=["incidents"])
def get_incident_frequency(days: int = Query(30, ge=7, le=90)):
    """Incidents per day — the frequency chart every operations tool has."""
    points = incident_history(days=days)
    return {
        "simulated": True,
        "total": sum(p["count"] for p in points),
        "points": points,
    }


@router.get("/assets/{asset_id}/history", tags=["assets"])
def get_asset_history(
    asset_id: str,
    points: int = Query(48, ge=8, le=168),
    step_seconds: int = Query(1800, ge=300, le=86400),
):
    """Per-asset freshness / volume / latency history."""
    g = store.graph()
    if asset_id not in g:
        raise HTTPException(404, f"unknown asset: {asset_id}")
    h = asset_history(g, asset_id, points=points, step_seconds=step_seconds)
    return {
        "asset_id": asset_id,
        "simulated": True,
        "freshness": [{"t": p.t, "value": p.value} for p in h.freshness],
        "volume": [{"t": p.t, "value": p.value} for p in h.volume],
        "latency": [{"t": p.t, "value": p.value} for p in h.latency],
    }
