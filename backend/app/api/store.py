"""
PULSE — application store.

Holds the singleton topology/layout and an in-memory incident + simulation
registry seeded with demo history. This keeps the API runnable with zero
infrastructure; the SQLAlchemy models in `app/db/` mirror the same shape for the
Postgres deployment path.

All incidents here are SIMULATED / DEMO records.
"""
from __future__ import annotations

import itertools
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from ..engine import build_topology
from ..engine.blast_radius import compute_blast_radius
from ..engine.graph import DependencyGraph
from ..engine.layout import compute_layout
from ..engine.recovery import generate_recovery_plan
from ..engine.simulation import SimulationResult, run_simulation
from ..engine.states import FAILURE_LABEL, FailureType, ImpactSeverity, IMPACT_RANK


@dataclass
class Incident:
    id: str
    title: str
    origin: str
    failure_type: FailureType
    status: str
    started_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    duration_minutes: int = 30
    simulated: bool = True


_GRAPH: DependencyGraph = build_topology()
_LAYOUT = compute_layout(_GRAPH)
_INCIDENTS: dict[str, Incident] = {}
_SIMULATIONS: dict[str, SimulationResult] = {}
_SIM_META: dict[str, dict] = {}


def graph() -> DependencyGraph:
    return _GRAPH


def layout():
    return _LAYOUT


# --------------------------------------------------------------------------- #
#  Demo incident history
# --------------------------------------------------------------------------- #
_DEMO_INCIDENTS = [
    # (id, origin, failure, status, hours_ago, duration)
    ("inc_2041", "src_payments", FailureType.SOURCE_OUTAGE, "resolved", 72, 45),
    ("inc_2042", "stg_customers", FailureType.NULL_SPIKE, "resolved", 36, 90),
    ("inc_2043", "src_inventory", FailureType.STALE_DATA, "open", 3, 30),
]


def _seed_incidents() -> None:
    if _INCIDENTS:
        return
    now = datetime.now(timezone.utc)
    for iid, origin, ft, status, hours_ago, dur in _DEMO_INCIDENTS:
        started = now - timedelta(hours=hours_ago)
        inc = Incident(
            id=iid,
            title=f"{FAILURE_LABEL[ft]} — {_GRAPH.node(origin).name}",
            origin=origin, failure_type=ft, status=status,
            started_at=started, duration_minutes=dur,
        )
        if status in ("acknowledged", "recovering", "resolved"):
            inc.acknowledged_at = started + timedelta(minutes=6)
        if status == "resolved":
            inc.resolved_at = started + timedelta(minutes=dur + 40)
        _INCIDENTS[iid] = inc


_seed_incidents()


def incidents() -> list[Incident]:
    return sorted(_INCIDENTS.values(), key=lambda i: i.started_at, reverse=True)


def incident(iid: str) -> Incident | None:
    return _INCIDENTS.get(iid)


def active_incident_count() -> int:
    return sum(1 for i in _INCIDENTS.values() if i.status != "resolved")


def add_incident(origin: str, ft: FailureType, duration_minutes: int = 30) -> Incident:
    iid = f"inc_{uuid.uuid4().hex[:6]}"
    inc = Incident(
        id=iid, title=f"{FAILURE_LABEL[ft]} — {_GRAPH.node(origin).name}",
        origin=origin, failure_type=ft, status="open",
        started_at=datetime.now(timezone.utc), duration_minutes=duration_minutes,
    )
    _INCIDENTS[iid] = inc
    return inc


def incident_severity(inc: Incident) -> ImpactSeverity:
    br = compute_blast_radius(_GRAPH, inc.origin, inc.failure_type)
    worst = ImpactSeverity.NONE
    for nid in br.affected_ids:
        s = br.nodes[nid].severity
        if IMPACT_RANK[s] > IMPACT_RANK[worst]:
            worst = s
    return worst


# --------------------------------------------------------------------------- #
#  Simulations
# --------------------------------------------------------------------------- #
def save_simulation(result: SimulationResult, parameter: str | None) -> str:
    sid = f"sim_{uuid.uuid4().hex[:8]}"
    _SIMULATIONS[sid] = result
    _SIM_META[sid] = {"parameter": parameter, "created": time.time()}
    return sid


def simulation(sid: str) -> tuple[SimulationResult | None, dict]:
    return _SIMULATIONS.get(sid), _SIM_META.get(sid, {})
