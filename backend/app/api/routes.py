"""
PULSE — REST API routes.

Resource groups: systems/topology, assets/lineage, health, simulations,
scenarios, comparison, resilience, incidents, recovery.

Every route here reads or analyses ONE system, chosen by the `system` query
parameter and resolved by `resolve_system`. Omitting it means the demo, which
is what keeps the landing page and an anonymous visitor working. A system that
belongs to another account answers 404, the same as an id that never existed —
see `workspace.resolve`, the single place that decision is made.

Every telemetry payload is labelled SIMULATED. No route mutates real data;
simulations are pure computations over the dependency graph.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from ..engine import compute_blast_radius, find_spofs
from ..engine.health import rollup, snapshot
from ..engine.history import (
    asset_history,
    health_history,
    incident_history,
    resilience_history,
)
from ..engine.recovery import generate_recovery_plan
from ..engine.scenarios import DEMO_SCENARIOS, SCENARIOS_BY_ID, compare
from ..engine.simulation import run_simulation
from ..engine.states import (
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
from . import workspace
from .auth import DemoUser, optional_user
from .serializers import asset_out, blast_out, metric_out, recovery_out, timeline_out
from .workspace import StoredSystem

router = APIRouter()

RESILIENCE_METHOD = (
    "score = 100 - penalties(single_points_of_failure, blast_concentration, "
    "source_redundancy, dependency_depth, incident_history, recovery_complexity). "
    "Deterministic graph analysis - no ML, no probability."
)


def resolve_system(
    system: str | None = Query(
        None,
        description="Id of the system to analyse. Omitted means the demo system.",
    ),
    user: DemoUser | None = Depends(optional_user),
) -> StoredSystem:
    try:
        return workspace.resolve(system, user.email if user else None)
    except workspace.AccessDenied:
        raise HTTPException(404, f"unknown system: {system}") from None


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
def _lanes(sys: StoredSystem) -> list[SystemOut]:
    """The groups *within* a system — its pipeline lanes, not workspace systems."""
    g = sys.graph
    metrics = snapshot(g)
    by_group: dict[str, list[str]] = {}
    for aid, a in g.assets.items():
        by_group.setdefault(a.system, []).append(aid)
    out = []
    for name in sorted(by_group):
        ids = by_group[name]
        counts = {s.value: 0 for s in HealthState}
        for aid in ids:
            counts[metrics[aid].state.value] += 1
        out.append(SystemOut(name=name, asset_count=len(ids), health=counts))
    return out


@router.get("/systems", response_model=list[SystemOut], tags=["systems"])
def list_systems(sys: StoredSystem = Depends(resolve_system)):
    return _lanes(sys)


@router.get("/systems/topology", response_model=TopologyOut, tags=["systems"])
def get_topology(sys: StoredSystem = Depends(resolve_system)):
    """Full dependency graph with stable 3D positions and simulated health."""
    g, pos = sys.graph, sys.layout
    metrics = snapshot(g)
    assets = [asset_out(g, aid, pos, metrics[aid].state) for aid in g.ids()]
    deps = [DependencyOut(upstream=d.upstream, downstream=d.downstream, kind=d.kind)
            for d in g.dependencies]
    return TopologyOut(
        organization=sys.name,
        assets=assets, dependencies=deps, systems=_lanes(sys),
    )


# --------------------------------------------------------------------------- #
#  Assets / lineage
# --------------------------------------------------------------------------- #
@router.get("/assets", response_model=list[AssetOut], tags=["assets"])
def list_assets(
    system_group: str | None = Query(None, alias="group"),
    type: NodeType | None = None,
    sys: StoredSystem = Depends(resolve_system),
):
    g, pos = sys.graph, sys.layout
    metrics = snapshot(g)
    out = []
    for aid in g.ids():
        a = g.node(aid)
        if system_group and a.system != system_group:
            continue
        if type and a.type != type:
            continue
        out.append(asset_out(g, aid, pos, metrics[aid].state))
    return out


@router.get("/assets/{asset_id}", response_model=LineageOut, tags=["assets"])
def get_asset(asset_id: str, sys: StoredSystem = Depends(resolve_system)):
    g = sys.graph
    if asset_id not in g:
        raise HTTPException(404, f"unknown asset: {asset_id}")
    pos = sys.layout
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
def get_downstream(asset_id: str, sys: StoredSystem = Depends(resolve_system)):
    g = sys.graph
    if asset_id not in g:
        raise HTTPException(404, f"unknown asset: {asset_id}")
    pos, metrics = sys.layout, snapshot(g)
    return [asset_out(g, n, pos, metrics[n].state) for n in sorted(g.descendants(asset_id))]


@router.get("/assets/{asset_id}/dependencies", tags=["assets"])
def get_dependencies(asset_id: str, sys: StoredSystem = Depends(resolve_system)):
    g = sys.graph
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
def health_overview(sys: StoredSystem = Depends(resolve_system)):
    g = sys.graph
    metrics = snapshot(g)
    res = workspace.system_resilience(sys)
    weakest_name = g.node(res.weakest_component).name if res.weakest_component else None
    return HealthOverviewOut(
        counts=rollup(metrics),
        total_assets=len(g.assets),
        active_incidents=workspace.active_incident_count(sys),
        resilience_score=res.score,
        weakest_component=weakest_name,
        weakest_reason=res.weakest_reason,
    )


@router.get("/health/metrics", response_model=list[HealthMetricOut], tags=["health"])
def health_metrics(
    trend_points: int = Query(12, ge=0, le=48),
    sys: StoredSystem = Depends(resolve_system),
):
    """
    Current metrics for every asset, each with a short freshness trend so the
    asset table can draw sparklines from a single request rather than issuing
    one call per row.
    """
    g = sys.graph
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
def resilience(sys: StoredSystem = Depends(resolve_system)):
    g = sys.graph
    res = workspace.system_resilience(sys)
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
def _simulation_payload(sys: StoredSystem, sid: str, result, parameter: str | None) -> SimulationOut:
    return SimulationOut(
        id=sid,
        origin=result.origin, origin_name=result.origin_name,
        failure_type=result.failure_type, failure_label=result.failure_label,
        parameter=parameter, duration_minutes=result.duration_minutes,
        blast_radius=blast_out(sys.graph, result.blast),
        recovery=recovery_out(result.recovery),
        timeline=timeline_out(result.timeline),
        business_impact=result.business_impact,
    )


@router.post("/simulations", response_model=SimulationOut, tags=["simulations"])
def create_simulation(
    req: SimulationRequest, sys: StoredSystem = Depends(resolve_system)
):
    """Run a SAFE, deterministic failure simulation over the selected system."""
    if req.origin not in sys.graph:
        raise HTTPException(404, f"unknown asset: {req.origin}")
    result = run_simulation(sys.graph, req.origin, req.failure_type, req.duration_minutes)
    sid = workspace.save_simulation(sys, result, req.parameter)
    return _simulation_payload(sys, sid, result, req.parameter)


@router.get("/simulations/{sim_id}", response_model=SimulationOut, tags=["simulations"])
def get_simulation(sim_id: str, sys: StoredSystem = Depends(resolve_system)):
    result, meta = workspace.simulation(sys, sim_id)
    if result is None:
        raise HTTPException(404, f"unknown simulation: {sim_id}")
    return _simulation_payload(sys, sim_id, result, meta.get("parameter"))


@router.get("/simulations/{sim_id}/blast-radius", tags=["simulations"])
def get_simulation_blast(sim_id: str, sys: StoredSystem = Depends(resolve_system)):
    result, _ = workspace.simulation(sys, sim_id)
    if result is None:
        raise HTTPException(404, f"unknown simulation: {sim_id}")
    return blast_out(sys.graph, result.blast)


# --------------------------------------------------------------------------- #
#  Scenarios & comparison
# --------------------------------------------------------------------------- #
@router.get("/scenarios", response_model=list[ScenarioOut], tags=["scenarios"])
def list_scenarios(sys: StoredSystem = Depends(resolve_system)):
    """
    The demo ships a curated catalogue; a user system offers whatever the user
    saved. Both answer here so the Scenarios screen has one source.
    """
    g = sys.graph
    if sys.kind == "demo":
        return [
            ScenarioOut(id=s.id, name=s.name, origin=s.origin,
                        origin_name=g.node(s.origin).name,
                        failure_type=s.failure_type, parameter=s.parameter)
            for s in DEMO_SCENARIOS
        ]
    saved = sorted(sys.scenarios.values(), key=lambda s: s.created_at, reverse=True)
    return [
        ScenarioOut(id=s.id, name=s.name, origin=s.origin,
                    origin_name=g.node(s.origin).name,
                    failure_type=s.failure_type, parameter=s.parameter or "")
        for s in saved
    ]


@router.post("/scenarios/{scenario_id}/run", response_model=SimulationOut, tags=["scenarios"])
def run_saved_scenario(
    scenario_id: str,
    duration_minutes: int = Query(30, ge=1, le=1440),
    sys: StoredSystem = Depends(resolve_system),
):
    if sys.kind == "demo":
        scenario = SCENARIOS_BY_ID.get(scenario_id)
        if scenario is None:
            raise HTTPException(404, f"unknown scenario: {scenario_id}")
        origin, ft, parameter = scenario.origin, scenario.failure_type, scenario.parameter
    else:
        saved = sys.scenarios.get(scenario_id)
        if saved is None:
            raise HTTPException(404, f"unknown scenario: {scenario_id}")
        origin, ft, parameter = saved.origin, saved.failure_type, saved.parameter
        duration_minutes = saved.duration_minutes

    result = run_simulation(sys.graph, origin, ft, duration_minutes)
    sid = workspace.save_simulation(sys, result, parameter)
    return _simulation_payload(sys, sid, result, parameter)


@router.post("/scenarios/compare", response_model=ComparisonOut, tags=["scenarios"])
def compare_scenarios(
    req: ComparisonRequest, sys: StoredSystem = Depends(resolve_system)
):
    g = sys.graph
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
def _incident_out(sys: StoredSystem, inc) -> IncidentOut:
    g = sys.graph
    br = compute_blast_radius(g, inc.origin, inc.failure_type)
    return IncidentOut(
        id=inc.id, title=inc.title, origin=inc.origin,
        origin_name=g.node(inc.origin).name, failure_type=inc.failure_type,
        status=inc.status, severity=workspace.incident_severity(sys, inc),
        started_at=_iso(inc.started_at), acknowledged_at=_iso(inc.acknowledged_at),
        resolved_at=_iso(inc.resolved_at), affected_assets=br.total_affected,
        teams=[g.node(t).name for t in br.teams],
    )


def _require_incident(sys: StoredSystem, incident_id: str):
    inc = sys.incidents.get(incident_id)
    if inc is None:
        raise HTTPException(404, f"unknown incident: {incident_id}")
    return inc


@router.get("/incidents", response_model=list[IncidentOut], tags=["incidents"])
def list_incidents(
    status: str | None = None, sys: StoredSystem = Depends(resolve_system)
):
    out = [_incident_out(sys, i) for i in workspace.incidents(sys)]
    return [i for i in out if not status or i.status == status]


@router.post("/incidents", response_model=IncidentOut, status_code=201, tags=["incidents"])
def record_incident(
    req: SimulationRequest, sys: StoredSystem = Depends(resolve_system)
):
    """
    Keep a simulation as an incident, so a run the user cared about turns into
    a record they can reopen, replay and recover from later.
    """
    if sys.read_only:
        raise HTTPException(403, "The demo system is read-only.")
    if req.origin not in sys.graph:
        raise HTTPException(404, f"unknown asset: {req.origin}")
    inc = workspace.add_incident(sys, req.origin, req.failure_type, req.duration_minutes)
    return _incident_out(sys, inc)


@router.get("/incidents/stats/frequency", tags=["incidents"])
def get_incident_frequency(
    days: int = Query(30, ge=7, le=90), sys: StoredSystem = Depends(resolve_system)
):
    """
    Incidents per day. The demo carries a synthetic history; a user system
    reports only what actually happened in it, which is usually nothing yet.
    """
    if sys.kind != "demo":
        recorded: dict[str, int] = {}
        for inc in sys.incidents.values():
            key = inc.started_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
            recorded[key] = recorded.get(key, 0) + 1
        points = [{"t": k, "count": v} for k, v in sorted(recorded.items())]
        return {"simulated": True, "total": sum(recorded.values()), "points": points}

    points = incident_history(days=days)
    return {
        "simulated": True,
        "total": sum(p["count"] for p in points),
        "points": points,
    }


@router.get("/incidents/{incident_id}", response_model=IncidentDetailOut, tags=["incidents"])
def get_incident(incident_id: str, sys: StoredSystem = Depends(resolve_system)):
    inc = _require_incident(sys, incident_id)
    g = sys.graph
    result = run_simulation(g, inc.origin, inc.failure_type, inc.duration_minutes)
    base = _incident_out(sys, inc)
    return IncidentDetailOut(
        **base.model_dump(),
        blast_radius=blast_out(g, result.blast),
        recovery=recovery_out(result.recovery),
        timeline=timeline_out(result.timeline),
    )


@router.post("/incidents/{incident_id}/acknowledge", response_model=IncidentOut, tags=["incidents"])
def acknowledge_incident(incident_id: str, sys: StoredSystem = Depends(resolve_system)):
    if sys.read_only:
        raise HTTPException(403, "The demo system is read-only.")
    inc = _require_incident(sys, incident_id)
    if inc.status == "resolved":
        raise HTTPException(409, "incident already resolved")
    inc.status = "acknowledged"
    inc.acknowledged_at = inc.acknowledged_at or datetime.now(timezone.utc)
    if sys.kind == "user":
        workspace.save()
    return _incident_out(sys, inc)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut, tags=["incidents"])
def resolve_incident(incident_id: str, sys: StoredSystem = Depends(resolve_system)):
    if sys.read_only:
        raise HTTPException(403, "The demo system is read-only.")
    inc = _require_incident(sys, incident_id)
    inc.status = "resolved"
    inc.acknowledged_at = inc.acknowledged_at or datetime.now(timezone.utc)
    inc.resolved_at = datetime.now(timezone.utc)
    if sys.kind == "user":
        workspace.save()
    return _incident_out(sys, inc)


@router.get("/incidents/{incident_id}/recovery", tags=["recovery"])
def get_incident_recovery(incident_id: str, sys: StoredSystem = Depends(resolve_system)):
    inc = _require_incident(sys, incident_id)
    g = sys.graph
    br = compute_blast_radius(g, inc.origin, inc.failure_type)
    return {"incident": incident_id, "steps": recovery_out(generate_recovery_plan(g, br))}


# --------------------------------------------------------------------------- #
#  History / trends  (SIMULATED, deterministic — see engine/history.py)
# --------------------------------------------------------------------------- #
@router.get("/health/history", tags=["health"])
def get_health_history(
    points: int = Query(48, ge=8, le=168),
    step_seconds: int = Query(1800, ge=300, le=86400),
    sys: StoredSystem = Depends(resolve_system),
):
    """Fleet-wide health counts over the recent window."""
    return {
        "simulated": True,
        "points": health_history(sys.graph, points=points, step_seconds=step_seconds),
    }


@router.get("/health/resilience-history", tags=["health"])
def get_resilience_history(
    days: int = Query(30, ge=7, le=90), sys: StoredSystem = Depends(resolve_system)
):
    """
    Daily resilience score, converging on today's real computed value so the
    trend can never contradict the number displayed beside it.
    """
    current = workspace.system_resilience(sys).score
    series = resilience_history(points=days, current=current)
    return {
        "simulated": True,
        "current": current,
        "points": [{"t": p.t, "value": p.value} for p in series],
    }


@router.get("/assets/{asset_id}/history", tags=["assets"])
def get_asset_history(
    asset_id: str,
    points: int = Query(48, ge=8, le=168),
    step_seconds: int = Query(1800, ge=300, le=86400),
    sys: StoredSystem = Depends(resolve_system),
):
    """Per-asset freshness / volume / latency history."""
    g = sys.graph
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
