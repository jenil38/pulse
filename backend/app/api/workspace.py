"""
PULSE — workspaces: the demo system and the systems users build themselves.

The engine has always taken a `DependencyGraph` as an argument, so nothing about
it needed to change to support many systems. What was missing was an owner: a
single module-level graph meant every visitor saw the same pre-populated estate,
which made a product look like a showcase.

This module is that owner. It holds:

  * exactly one DEMO system, rebuilt from code on every boot and never persisted
  * zero or more USER systems, each belonging to one account by email

Access is decided here, in `resolve`, and nowhere else. A user system is
invisible — 404, not 403 — to anyone who does not own it, so the API never
confirms that someone else's system id exists.

Durability is a JSON file rather than a database. The SQLAlchemy models in
`app/db/` describe the Postgres deployment path and remain unused; a file keeps
"create a system, restart the API, it is still there" true with no migration to
run and nothing to destroy.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Literal

from ..engine import build_topology
from ..engine.blast_radius import compute_blast_radius
from ..engine.graph import Asset, Dependency, DependencyGraph
from ..engine.layout import Position, compute_layout
from ..engine.resilience import ResilienceScore, compute_resilience
from ..engine.simulation import SimulationResult
from ..engine.states import (
    Criticality,
    FAILURE_LABEL,
    FailureType,
    ImpactSeverity,
    IMPACT_RANK,
    NodeType,
)
from ..engine.topology import ORGANIZATION

DEMO_SYSTEM_ID = "demo"

#: Caps. An open builder/import endpoint should not be able to exhaust memory.
MAX_SYSTEMS_PER_USER = 25
MAX_COMPONENTS = 300
MAX_DEPENDENCIES = 900
MAX_SCENARIOS_PER_SYSTEM = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    return datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


class AccessDenied(Exception):
    """Raised when a caller asks for a system that is not theirs to see."""


class ValidationProblem(Exception):
    """A system definition the builder or importer refuses to accept."""


# --------------------------------------------------------------------------- #
#  Records
# --------------------------------------------------------------------------- #
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


@dataclass
class SavedScenario:
    """A failure configuration a user chose to keep, so it can be re-run later."""
    id: str
    name: str
    origin: str
    failure_type: FailureType
    duration_minutes: int
    parameter: str | None
    created_at: datetime


@dataclass
class StoredSystem:
    id: str
    name: str
    description: str
    #: Account email, or None for the demo system (which belongs to nobody).
    owner: str | None
    kind: Literal["demo", "user"]
    graph: DependencyGraph
    layout: dict[str, Position]
    created_at: datetime
    updated_at: datetime
    incidents: dict[str, Incident] = field(default_factory=dict)
    scenarios: dict[str, SavedScenario] = field(default_factory=dict)
    #: Simulation results live only for the life of the process — they are pure
    #: functions of (graph, origin, failure), so nothing is lost by recomputing.
    simulations: dict[str, SimulationResult] = field(default_factory=dict)
    sim_meta: dict[str, dict] = field(default_factory=dict)

    @property
    def read_only(self) -> bool:
        return self.kind == "demo"

    def touch(self) -> None:
        self.updated_at = _now()


# --------------------------------------------------------------------------- #
#  Component type vocabulary
# --------------------------------------------------------------------------- #
#: Generic words people reach for when hand-writing a system definition, mapped
#: onto PULSE's own node taxonomy. Importing is meant to be forgiving; the
#: canonical NodeType values are always accepted too.
TYPE_ALIASES: dict[str, NodeType] = {
    "api": NodeType.SOURCE,
    "external": NodeType.SOURCE,
    "external_dependency": NodeType.SOURCE,
    "external dependency": NodeType.SOURCE,
    "infrastructure": NodeType.SOURCE,
    "source": NodeType.SOURCE,
    "third_party": NodeType.SOURCE,
    "queue": NodeType.INGESTION,
    "stream": NodeType.INGESTION,
    "topic": NodeType.INGESTION,
    "job": NodeType.INGESTION,
    "ingestion": NodeType.INGESTION,
    "storage": NodeType.RAW_TABLE,
    "bucket": NodeType.RAW_TABLE,
    "file": NodeType.RAW_TABLE,
    "raw": NodeType.RAW_TABLE,
    "service": NodeType.TRANSFORMATION,
    "worker": NodeType.TRANSFORMATION,
    "function": NodeType.TRANSFORMATION,
    "transformation": NodeType.TRANSFORMATION,
    "database": NodeType.WAREHOUSE_TABLE,
    "db": NodeType.WAREHOUSE_TABLE,
    "table": NodeType.WAREHOUSE_TABLE,
    "cache": NodeType.WAREHOUSE_TABLE,
    "warehouse": NodeType.WAREHOUSE_TABLE,
    "model": NodeType.DATA_MODEL,
    "metric": NodeType.DATA_MODEL,
    "report": NodeType.DASHBOARD,
    "dashboard": NodeType.DASHBOARD,
    "ml": NodeType.ML_MODEL,
    "ml_model": NodeType.ML_MODEL,
    "process": NodeType.BUSINESS_PROCESS,
    "business_process": NodeType.BUSINESS_PROCESS,
    "team": NodeType.TEAM,
}


def coerce_type(raw: str | None) -> NodeType:
    if not raw:
        return NodeType.TRANSFORMATION
    key = str(raw).strip()
    try:
        return NodeType(key.upper())
    except ValueError:
        pass
    alias = TYPE_ALIASES.get(key.lower().replace("-", "_"))
    if alias is None:
        raise ValidationProblem(
            f"'{raw}' is not a component type. Use one of: "
            + ", ".join(t.value for t in NodeType)
        )
    return alias


def coerce_criticality(raw: str | None) -> Criticality:
    if not raw:
        return Criticality.MEDIUM
    try:
        return Criticality(str(raw).strip().upper())
    except ValueError:
        raise ValidationProblem(
            f"'{raw}' is not a criticality. Use LOW, MEDIUM, HIGH or CRITICAL."
        ) from None


def slugify(name: str, taken: set[str]) -> str:
    base = "".join(c if c.isalnum() else "_" for c in name.strip().lower()).strip("_")
    base = "_".join(p for p in base.split("_") if p) or "component"
    candidate, n = base, 2
    while candidate in taken:
        candidate = f"{base}_{n}"
        n += 1
    return candidate


# --------------------------------------------------------------------------- #
#  Building a graph from a user definition
# --------------------------------------------------------------------------- #
@dataclass
class ComponentSpec:
    name: str
    type: str | None = None
    key: str | None = None
    group: str | None = None
    criticality: str | None = None
    owner: str = ""
    description: str = ""


@dataclass
class DependencySpec:
    """`source` depends on `target`: data and availability flow target -> source.

    This is the direction the JSON import format uses, so that
    `{"source": "Website", "target": "Order Service"}` reads as
    "Website depends on Order Service" and a failure in Order Service
    propagates outward to Website.
    """
    source: str
    target: str
    kind: str = "data"


def build_graph(
    components: Iterable[ComponentSpec],
    dependencies: Iterable[DependencySpec],
) -> tuple[DependencyGraph, dict[str, Position]]:
    """Validate a user definition and turn it into an engine graph.

    Raises `ValidationProblem` with a sentence a person can act on. Nothing
    here trusts the caller: names, references, cycles and size are all checked
    before an engine object exists.
    """
    comps = list(components)
    deps = list(dependencies)

    if not comps:
        raise ValidationProblem("A system needs at least one component.")
    if len(comps) > MAX_COMPONENTS:
        raise ValidationProblem(f"A system can hold at most {MAX_COMPONENTS} components.")
    if len(deps) > MAX_DEPENDENCIES:
        raise ValidationProblem(
            f"A system can hold at most {MAX_DEPENDENCIES} dependencies."
        )

    assets: list[Asset] = []
    keys: set[str] = set()
    # Both the explicit key and the display name resolve a dependency endpoint,
    # so an import can reference components by whichever it used.
    by_name: dict[str, str] = {}

    for spec in comps:
        name = " ".join(str(spec.name or "").split())
        if not name:
            raise ValidationProblem("Every component needs a name.")
        if len(name) > 120:
            raise ValidationProblem(f"Component name is too long: {name[:40]}…")

        key = (spec.key or "").strip() or slugify(name, keys)
        if key in keys:
            raise ValidationProblem(f"Duplicate component: {key}")
        if name.lower() in by_name:
            raise ValidationProblem(f"Two components are both named '{name}'.")
        keys.add(key)
        by_name[name.lower()] = key

        assets.append(
            Asset(
                id=key,
                name=name,
                type=coerce_type(spec.type),
                system=" ".join(str(spec.group or "").split()) or "System",
                criticality=coerce_criticality(spec.criticality),
                owner=str(spec.owner or "")[:80],
                description=str(spec.description or "")[:400],
            )
        )

    def resolve_ref(ref: str, side: str) -> str:
        token = str(ref or "").strip()
        if not token:
            raise ValidationProblem(f"A dependency is missing its {side}.")
        if token in keys:
            return token
        found = by_name.get(token.lower())
        if found is None:
            raise ValidationProblem(f"Dependency {side} '{token}' is not a component.")
        return found

    edges: list[Dependency] = []
    seen: set[tuple[str, str]] = set()
    for spec in deps:
        downstream = resolve_ref(spec.source, "source")
        upstream = resolve_ref(spec.target, "target")
        if upstream == downstream:
            raise ValidationProblem(
                f"'{assets_by_id(assets)[upstream].name}' cannot depend on itself."
            )
        if (upstream, downstream) in seen:
            continue
        seen.add((upstream, downstream))
        edges.append(
            Dependency(upstream=upstream, downstream=downstream,
                       kind=str(spec.kind or "data")[:40])
        )

    graph = DependencyGraph(assets, edges)
    try:
        graph.topological_order()
    except ValueError:
        raise ValidationProblem(
            "These dependencies form a cycle. PULSE propagates failure along a "
            "directed graph, so a component cannot end up depending on itself."
        ) from None

    return graph, compute_layout(graph)


def assets_by_id(assets: list[Asset]) -> dict[str, Asset]:
    return {a.id: a for a in assets}


# --------------------------------------------------------------------------- #
#  The registry
# --------------------------------------------------------------------------- #
_LOCK = threading.RLock()
_SYSTEMS: dict[str, StoredSystem] = {}

_DATA_DIR = Path(os.getenv("PULSE_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
_DATA_FILE = _DATA_DIR / "workspace.json"


def _build_demo() -> StoredSystem:
    graph = build_topology()
    now = _now()
    sys = StoredSystem(
        id=DEMO_SYSTEM_ID,
        name=ORGANIZATION,
        description=(
            "A fictional e-commerce data platform used to demonstrate PULSE. "
            "Read-only: explore it, break it, then build your own."
        ),
        owner=None,
        kind="demo",
        graph=graph,
        layout=compute_layout(graph),
        created_at=now,
        updated_at=now,
    )
    _seed_demo_incidents(sys)
    return sys


_DEMO_INCIDENTS = [
    # (id, origin, failure, status, hours_ago, duration)
    ("inc_2041", "src_payments", FailureType.SOURCE_OUTAGE, "resolved", 72, 45),
    ("inc_2042", "stg_customers", FailureType.NULL_SPIKE, "resolved", 36, 90),
    ("inc_2043", "src_inventory", FailureType.STALE_DATA, "open", 3, 30),
]


def _seed_demo_incidents(sys: StoredSystem) -> None:
    now = _now()
    for iid, origin, ft, status, hours_ago, dur in _DEMO_INCIDENTS:
        started = now - timedelta(hours=hours_ago)
        inc = Incident(
            id=iid,
            title=f"{FAILURE_LABEL[ft]} — {sys.graph.node(origin).name}",
            origin=origin, failure_type=ft, status=status,
            started_at=started, duration_minutes=dur,
        )
        if status in ("acknowledged", "recovering", "resolved"):
            inc.acknowledged_at = started + timedelta(minutes=6)
        if status == "resolved":
            inc.resolved_at = started + timedelta(minutes=dur + 40)
        sys.incidents[iid] = inc


# --------------------------------------------------------------------------- #
#  Persistence
# --------------------------------------------------------------------------- #
def _system_to_json(sys: StoredSystem) -> dict:
    return {
        "id": sys.id,
        "name": sys.name,
        "description": sys.description,
        "owner": sys.owner,
        "created_at": _iso(sys.created_at),
        "updated_at": _iso(sys.updated_at),
        "components": [
            {
                "key": a.id,
                "name": a.name,
                "type": a.type.value,
                "group": a.system,
                "criticality": a.criticality.value,
                "owner": a.owner,
                "description": a.description,
            }
            for a in sys.graph.assets.values()
        ],
        "dependencies": [
            # Persisted in the same "source depends on target" direction the
            # import format uses, so the file round-trips through one code path.
            {"source": d.downstream, "target": d.upstream, "kind": d.kind}
            for d in sys.graph.dependencies
        ],
        "scenarios": [
            {
                "id": s.id, "name": s.name, "origin": s.origin,
                "failure_type": s.failure_type.value,
                "duration_minutes": s.duration_minutes,
                "parameter": s.parameter, "created_at": _iso(s.created_at),
            }
            for s in sys.scenarios.values()
        ],
        "incidents": [
            {
                "id": i.id, "title": i.title, "origin": i.origin,
                "failure_type": i.failure_type.value, "status": i.status,
                "started_at": _iso(i.started_at),
                "acknowledged_at": _iso(i.acknowledged_at),
                "resolved_at": _iso(i.resolved_at),
                "duration_minutes": i.duration_minutes,
            }
            for i in sys.incidents.values()
        ],
    }


def _system_from_json(raw: dict) -> StoredSystem:
    graph, layout = build_graph(
        [ComponentSpec(**{k: c.get(k) for k in
                          ("name", "type", "key", "group", "criticality")},
                       owner=c.get("owner") or "",
                       description=c.get("description") or "")
         for c in raw.get("components", [])],
        [DependencySpec(source=d["source"], target=d["target"],
                        kind=d.get("kind") or "data")
         for d in raw.get("dependencies", [])],
    )
    sys = StoredSystem(
        id=raw["id"],
        name=raw["name"],
        description=raw.get("description") or "",
        owner=raw.get("owner"),
        kind="user",
        graph=graph,
        layout=layout,
        created_at=_parse_iso(raw.get("created_at")) or _now(),
        updated_at=_parse_iso(raw.get("updated_at")) or _now(),
    )
    for s in raw.get("scenarios", []):
        sys.scenarios[s["id"]] = SavedScenario(
            id=s["id"], name=s["name"], origin=s["origin"],
            failure_type=FailureType(s["failure_type"]),
            duration_minutes=s.get("duration_minutes", 30),
            parameter=s.get("parameter"),
            created_at=_parse_iso(s.get("created_at")) or _now(),
        )
    for i in raw.get("incidents", []):
        sys.incidents[i["id"]] = Incident(
            id=i["id"], title=i["title"], origin=i["origin"],
            failure_type=FailureType(i["failure_type"]), status=i["status"],
            started_at=_parse_iso(i["started_at"]) or _now(),
            acknowledged_at=_parse_iso(i.get("acknowledged_at")),
            resolved_at=_parse_iso(i.get("resolved_at")),
            duration_minutes=i.get("duration_minutes", 30),
        )
    return sys


#: Set by app.api.auth so accounts persist alongside the systems they own.
#: Kept as hooks rather than an import so the two modules do not depend on
#: each other in a cycle.
_account_dump = None
_account_load = None


def register_account_persistence(dump, load) -> None:
    global _account_dump, _account_load
    _account_dump, _account_load = dump, load


def save() -> None:
    """Write every user system (and account) to disk. Demo data is never saved."""
    with _LOCK:
        payload = {
            "version": 1,
            "accounts": _account_dump() if _account_dump else [],
            "systems": [
                _system_to_json(s) for s in _SYSTEMS.values() if s.kind == "user"
            ],
        }
        try:
            _DATA_DIR.mkdir(parents=True, exist_ok=True)
            tmp = _DATA_FILE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            tmp.replace(_DATA_FILE)
        except OSError:
            # A read-only deployment should still serve the demo rather than 500.
            pass


def load() -> None:
    """Restore user systems and accounts. A corrupt file is skipped, not fatal."""
    with _LOCK:
        if not _DATA_FILE.exists():
            return
        try:
            payload = json.loads(_DATA_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if _account_load:
            _account_load(payload.get("accounts", []))
        for raw in payload.get("systems", []):
            try:
                sys = _system_from_json(raw)
            except (ValidationProblem, KeyError, ValueError):
                continue
            _SYSTEMS[sys.id] = sys


def reset_for_tests() -> None:
    """Drop every user system and rebuild the demo. Used by the test suite."""
    with _LOCK:
        _SYSTEMS.clear()
        _SYSTEMS[DEMO_SYSTEM_ID] = _build_demo()


# --------------------------------------------------------------------------- #
#  Access
# --------------------------------------------------------------------------- #
def demo() -> StoredSystem:
    return _SYSTEMS[DEMO_SYSTEM_ID]


def resolve(system_id: str | None, viewer: str | None) -> StoredSystem:
    """The one place a system id turns into a system.

    `viewer` is the authenticated account email, or None for an anonymous
    caller. A user system that is not the viewer's own raises `AccessDenied`,
    which the API surfaces as 404 — the same answer an id that never existed
    gets, so nothing here reveals which other people's systems are real.
    """
    sid = (system_id or DEMO_SYSTEM_ID).strip() or DEMO_SYSTEM_ID
    sys = _SYSTEMS.get(sid)
    if sys is None:
        raise AccessDenied(sid)
    if sys.kind == "demo":
        return sys
    if viewer is None or sys.owner != viewer:
        raise AccessDenied(sid)
    return sys


def list_for(viewer: str) -> list[StoredSystem]:
    """Every system this account owns, most recently updated first."""
    with _LOCK:
        mine = [s for s in _SYSTEMS.values() if s.kind == "user" and s.owner == viewer]
    return sorted(mine, key=lambda s: s.updated_at, reverse=True)


def create(
    owner: str,
    name: str,
    description: str,
    components: Iterable[ComponentSpec],
    dependencies: Iterable[DependencySpec],
) -> StoredSystem:
    graph, layout = build_graph(components, dependencies)
    with _LOCK:
        if len(list_for(owner)) >= MAX_SYSTEMS_PER_USER:
            raise ValidationProblem(
                f"A workspace can hold at most {MAX_SYSTEMS_PER_USER} systems."
            )
        now = _now()
        sys = StoredSystem(
            id=f"sys_{uuid.uuid4().hex[:10]}",
            name=_clean_name(name),
            description=str(description or "")[:400],
            owner=owner,
            kind="user",
            graph=graph,
            layout=layout,
            created_at=now,
            updated_at=now,
        )
        _SYSTEMS[sys.id] = sys
    save()
    return sys


def replace_graph(
    sys: StoredSystem,
    components: Iterable[ComponentSpec],
    dependencies: Iterable[DependencySpec],
) -> StoredSystem:
    if sys.read_only:
        raise ValidationProblem("The demo system cannot be edited.")
    graph, layout = build_graph(components, dependencies)
    with _LOCK:
        sys.graph, sys.layout = graph, layout
        # Incidents and scenarios that pointed at components which no longer
        # exist would crash every later blast-radius call, so they go with them.
        sys.incidents = {k: v for k, v in sys.incidents.items() if v.origin in graph}
        sys.scenarios = {k: v for k, v in sys.scenarios.items() if v.origin in graph}
        sys.simulations.clear()
        sys.sim_meta.clear()
        sys.touch()
    save()
    return sys


def update_meta(sys: StoredSystem, name: str | None, description: str | None) -> StoredSystem:
    if sys.read_only:
        raise ValidationProblem("The demo system cannot be edited.")
    if name is not None:
        sys.name = _clean_name(name)
    if description is not None:
        sys.description = str(description)[:400]
    sys.touch()
    save()
    return sys


def delete(sys: StoredSystem) -> None:
    if sys.read_only:
        raise ValidationProblem("The demo system cannot be deleted.")
    with _LOCK:
        _SYSTEMS.pop(sys.id, None)
    save()


def _clean_name(name: str) -> str:
    cleaned = " ".join(str(name or "").split())
    if len(cleaned) < 2:
        raise ValidationProblem("Give the system a name of at least two characters.")
    return cleaned[:120]


# --------------------------------------------------------------------------- #
#  Per-system records
# --------------------------------------------------------------------------- #
#: How far back an incident still counts as "recent" for the resilience score.
RECENT_INCIDENT_DAYS = 30

#: The demo's curated history. The sample system is meant to score the way the
#: documentation says it does, so its history is stated rather than accumulated.
#: No user system is ever scored against these.
DEMO_INCIDENT_HISTORY = (2, 1)


def incident_history(sys: StoredSystem) -> tuple[int, int]:
    """(recent incidents, still unresolved) — the score's history inputs.

    A user's system is scored on what actually happened inside it. A system
    nobody has broken yet reports (0, 0) and takes no history penalty, which is
    the honest answer: PULSE has no incident record for it because there isn't
    one.
    """
    if sys.kind == "demo":
        return DEMO_INCIDENT_HISTORY
    cutoff = _now() - timedelta(days=RECENT_INCIDENT_DAYS)
    recent = sum(1 for i in sys.incidents.values() if i.started_at >= cutoff)
    return recent, active_incident_count(sys)


def system_resilience(sys: StoredSystem) -> ResilienceScore:
    """The resilience score for a stored system, history included.

    The one place a StoredSystem becomes a score, so no route can accidentally
    fall back to the engine's history-free default and report a different
    number than the screen beside it.
    """
    recent, unresolved = incident_history(sys)
    return compute_resilience(sys.graph, recent, unresolved)


def incidents(sys: StoredSystem) -> list[Incident]:
    return sorted(sys.incidents.values(), key=lambda i: i.started_at, reverse=True)


def active_incident_count(sys: StoredSystem) -> int:
    return sum(1 for i in sys.incidents.values() if i.status != "resolved")


def add_incident(
    sys: StoredSystem, origin: str, ft: FailureType, duration_minutes: int = 30
) -> Incident:
    inc = Incident(
        id=f"inc_{uuid.uuid4().hex[:6]}",
        title=f"{FAILURE_LABEL[ft]} — {sys.graph.node(origin).name}",
        origin=origin, failure_type=ft, status="open",
        started_at=_now(), duration_minutes=duration_minutes,
    )
    sys.incidents[inc.id] = inc
    if sys.kind == "user":
        sys.touch()
        save()
    return inc


def incident_severity(sys: StoredSystem, inc: Incident) -> ImpactSeverity:
    br = compute_blast_radius(sys.graph, inc.origin, inc.failure_type)
    worst = ImpactSeverity.NONE
    for nid in br.affected_ids:
        s = br.nodes[nid].severity
        if IMPACT_RANK[s] > IMPACT_RANK[worst]:
            worst = s
    return worst


def save_simulation(sys: StoredSystem, result: SimulationResult, parameter: str | None) -> str:
    sid = f"sim_{uuid.uuid4().hex[:8]}"
    sys.simulations[sid] = result
    sys.sim_meta[sid] = {"parameter": parameter}
    return sid


def simulation(sys: StoredSystem, sid: str) -> tuple[SimulationResult | None, dict]:
    return sys.simulations.get(sid), sys.sim_meta.get(sid, {})


def add_scenario(
    sys: StoredSystem, name: str, origin: str, ft: FailureType,
    duration_minutes: int, parameter: str | None,
) -> SavedScenario:
    if sys.read_only:
        raise ValidationProblem("Scenarios cannot be saved against the demo system.")
    if origin not in sys.graph:
        raise ValidationProblem(f"'{origin}' is not a component of this system.")
    if len(sys.scenarios) >= MAX_SCENARIOS_PER_SYSTEM:
        raise ValidationProblem(
            f"A system can hold at most {MAX_SCENARIOS_PER_SYSTEM} saved scenarios."
        )
    sc = SavedScenario(
        id=f"scn_{uuid.uuid4().hex[:8]}",
        name=_clean_name(name),
        origin=origin,
        failure_type=ft,
        duration_minutes=duration_minutes,
        parameter=parameter,
        created_at=_now(),
    )
    sys.scenarios[sc.id] = sc
    sys.touch()
    save()
    return sc


def delete_scenario(sys: StoredSystem, scenario_id: str) -> bool:
    if sys.scenarios.pop(scenario_id, None) is None:
        return False
    sys.touch()
    save()
    return True


_SYSTEMS[DEMO_SYSTEM_ID] = _build_demo()
