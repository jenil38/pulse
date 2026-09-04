"""
PULSE — workspace routes: the systems a user builds, imports and keeps.

Everything here is scoped to the authenticated account. `require_system`
resolves an id through `workspace.resolve`, which is the single place ownership
is decided; a system belonging to someone else answers 404 exactly as an
unknown id does, so the API never confirms it exists.

The analysis routes (topology, health, simulation, incidents…) live in
routes.py and take the system as a query parameter — see `resolve_system`
there. This module is only about the systems themselves.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from ..engine.states import Criticality, FailureType, NodeType
from . import workspace
from .auth import DemoUser, current_user
from .workspace import (
    ComponentSpec,
    DependencySpec,
    StoredSystem,
    ValidationProblem,
)

router = APIRouter()


# --------------------------------------------------------------------------- #
#  Schemas
# --------------------------------------------------------------------------- #
class ComponentIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    type: Optional[str] = Field(
        None,
        description="A PULSE NodeType, or a common alias such as 'service', "
                    "'database', 'api', 'queue'. Defaults to TRANSFORMATION.",
    )
    key: Optional[str] = Field(None, max_length=120)
    group: Optional[str] = Field(None, max_length=80,
                                 description="Lane this component belongs to.")
    criticality: Optional[str] = None
    owner: str = ""
    description: str = ""


class DependencyIn(BaseModel):
    """`source` depends on `target`.

    Failure propagates from target outward to source, so
    `{"source": "Website", "target": "Order Service"}` means an Order Service
    outage reaches the Website.
    """
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    kind: str = "data"


class SystemGraphIn(BaseModel):
    components: list[ComponentIn] = []
    dependencies: list[DependencyIn] = []


class SystemCreateIn(SystemGraphIn):
    name: str = Field(..., min_length=2, max_length=120)
    description: str = Field("", max_length=400)


class SystemPatchIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=400)


class SystemSummaryOut(BaseModel):
    id: str
    name: str
    description: str
    kind: str
    read_only: bool
    component_count: int
    dependency_count: int
    scenario_count: int
    incident_count: int
    resilience_score: int
    created_at: str
    updated_at: str


class ComponentOut(BaseModel):
    key: str
    name: str
    type: NodeType
    group: str
    criticality: Criticality
    owner: str
    description: str


class SystemDetailOut(SystemSummaryOut):
    components: list[ComponentOut]
    dependencies: list[DependencyIn]


class SavedScenarioIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    origin: str
    failure_type: FailureType
    duration_minutes: int = Field(30, ge=1, le=1440)
    parameter: Optional[str] = Field(None, max_length=200)


class SavedScenarioOut(BaseModel):
    id: str
    name: str
    origin: str
    origin_name: str
    failure_type: FailureType
    duration_minutes: int
    parameter: Optional[str]
    created_at: str


class ComponentTypeOut(BaseModel):
    value: NodeType
    label: str
    hint: str


# --------------------------------------------------------------------------- #
#  Serialisation
# --------------------------------------------------------------------------- #
def _summary(sys: StoredSystem) -> SystemSummaryOut:
    return SystemSummaryOut(
        id=sys.id,
        name=sys.name,
        description=sys.description,
        kind=sys.kind,
        read_only=sys.read_only,
        component_count=len(sys.graph.assets),
        dependency_count=len(sys.graph.dependencies),
        scenario_count=len(sys.scenarios),
        incident_count=len(sys.incidents),
        resilience_score=workspace.system_resilience(sys).score,
        created_at=workspace._iso(sys.created_at) or "",
        updated_at=workspace._iso(sys.updated_at) or "",
    )


def _detail(sys: StoredSystem) -> SystemDetailOut:
    return SystemDetailOut(
        **_summary(sys).model_dump(),
        components=[
            ComponentOut(
                key=a.id, name=a.name, type=a.type, group=a.system,
                criticality=a.criticality, owner=a.owner, description=a.description,
            )
            for a in sys.graph.assets.values()
        ],
        dependencies=[
            DependencyIn(source=d.downstream, target=d.upstream, kind=d.kind)
            for d in sys.graph.dependencies
        ],
    )


def _scenario_out(sys: StoredSystem, sc) -> SavedScenarioOut:
    return SavedScenarioOut(
        id=sc.id, name=sc.name, origin=sc.origin,
        origin_name=sys.graph.node(sc.origin).name,
        failure_type=sc.failure_type, duration_minutes=sc.duration_minutes,
        parameter=sc.parameter, created_at=workspace._iso(sc.created_at) or "",
    )


def _specs(payload: SystemGraphIn) -> tuple[list[ComponentSpec], list[DependencySpec]]:
    return (
        [ComponentSpec(name=c.name, type=c.type, key=c.key, group=c.group,
                       criticality=c.criticality, owner=c.owner,
                       description=c.description)
         for c in payload.components],
        [DependencySpec(source=d.source, target=d.target, kind=d.kind)
         for d in payload.dependencies],
    )


# --------------------------------------------------------------------------- #
#  Dependencies
# --------------------------------------------------------------------------- #
def require_system(
    system_id: str = Path(..., alias="system_id"),
    user: DemoUser = Depends(current_user),
) -> StoredSystem:
    try:
        return workspace.resolve(system_id, user.email)
    except workspace.AccessDenied:
        raise HTTPException(404, f"unknown system: {system_id}") from None


def require_own_system(sys: StoredSystem = Depends(require_system)) -> StoredSystem:
    """A system the caller may modify — never the demo."""
    if sys.read_only:
        raise HTTPException(403, "The demo system is read-only. Build your own to edit it.")
    return sys


# --------------------------------------------------------------------------- #
#  Routes
# --------------------------------------------------------------------------- #
@router.get("/workspace/component-types", response_model=list[ComponentTypeOut],
            tags=["workspace"])
def component_types():
    """The component vocabulary the builder offers, in pipeline order."""
    labels = {
        NodeType.SOURCE: ("External source", "An API, database or third party you do not run"),
        NodeType.INGESTION: ("Ingestion", "A job, queue or stream that pulls a source in"),
        NodeType.RAW_TABLE: ("Raw store", "Landed, untransformed data"),
        NodeType.TRANSFORMATION: ("Service / transformation", "Code that reads upstream and produces something"),
        NodeType.WAREHOUSE_TABLE: ("Database / table", "A conformed store others read from"),
        NodeType.DATA_MODEL: ("Metric model", "A business-level aggregate"),
        NodeType.DASHBOARD: ("Dashboard", "A surface a human trusts"),
        NodeType.ML_MODEL: ("ML model", "A model consuming upstream data"),
        NodeType.BUSINESS_PROCESS: ("Business process", "A decision fed by this system"),
        NodeType.TEAM: ("Team", "The people who feel it when this breaks"),
    }
    return [
        ComponentTypeOut(value=t, label=labels[t][0], hint=labels[t][1])
        for t in NodeType
    ]


@router.get("/workspace/systems", response_model=list[SystemSummaryOut], tags=["workspace"])
def list_my_systems(user: DemoUser = Depends(current_user)):
    """The caller's own systems. The demo is deliberately not in this list."""
    return [_summary(s) for s in workspace.list_for(user.email)]


@router.get("/workspace/demo", response_model=SystemSummaryOut, tags=["workspace"])
def get_demo_system():
    """The sample system, reachable without an account."""
    return _summary(workspace.demo())


@router.post("/workspace/systems", response_model=SystemDetailOut, status_code=201,
             tags=["workspace"])
def create_system(payload: SystemCreateIn, user: DemoUser = Depends(current_user)):
    """Create a system from the builder, or import one from JSON."""
    components, dependencies = _specs(payload)
    try:
        sys = workspace.create(
            user.email, payload.name, payload.description, components, dependencies
        )
    except ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from None
    return _detail(sys)


@router.get("/workspace/systems/{system_id}", response_model=SystemDetailOut,
            tags=["workspace"])
def get_system(sys: StoredSystem = Depends(require_system)):
    return _detail(sys)


@router.patch("/workspace/systems/{system_id}", response_model=SystemDetailOut,
              tags=["workspace"])
def patch_system(payload: SystemPatchIn, sys: StoredSystem = Depends(require_own_system)):
    try:
        workspace.update_meta(sys, payload.name, payload.description)
    except ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from None
    return _detail(sys)


@router.put("/workspace/systems/{system_id}/graph", response_model=SystemDetailOut,
            tags=["workspace"])
def replace_system_graph(
    payload: SystemGraphIn, sys: StoredSystem = Depends(require_own_system)
):
    """Save the builder's current components and dependencies over the system."""
    components, dependencies = _specs(payload)
    try:
        workspace.replace_graph(sys, components, dependencies)
    except ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from None
    return _detail(sys)


@router.delete("/workspace/systems/{system_id}", status_code=204, tags=["workspace"])
def delete_system(sys: StoredSystem = Depends(require_own_system)):
    workspace.delete(sys)


@router.post("/workspace/systems/validate", tags=["workspace"])
def validate_definition(
    payload: SystemGraphIn, user: DemoUser = Depends(current_user)
):
    """Dry-run a definition so the import screen can report problems before saving."""
    components, dependencies = _specs(payload)
    try:
        graph, _ = workspace.build_graph(components, dependencies)
    except ValidationProblem as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "component_count": len(graph.assets),
        "dependency_count": len(graph.dependencies),
    }


# --------------------------------------------------------------------------- #
#  Saved scenarios
# --------------------------------------------------------------------------- #
@router.get("/workspace/systems/{system_id}/scenarios",
            response_model=list[SavedScenarioOut], tags=["workspace"])
def list_saved_scenarios(sys: StoredSystem = Depends(require_system)):
    scenarios = sorted(sys.scenarios.values(), key=lambda s: s.created_at, reverse=True)
    return [_scenario_out(sys, s) for s in scenarios]


@router.post("/workspace/systems/{system_id}/scenarios", response_model=SavedScenarioOut,
             status_code=201, tags=["workspace"])
def save_scenario(payload: SavedScenarioIn, sys: StoredSystem = Depends(require_own_system)):
    try:
        sc = workspace.add_scenario(
            sys, payload.name, payload.origin, payload.failure_type,
            payload.duration_minutes, payload.parameter,
        )
    except ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from None
    return _scenario_out(sys, sc)


@router.delete("/workspace/systems/{system_id}/scenarios/{scenario_id}",
               status_code=204, tags=["workspace"])
def remove_scenario(scenario_id: str, sys: StoredSystem = Depends(require_own_system)):
    if not workspace.delete_scenario(sys, scenario_id):
        raise HTTPException(404, f"unknown scenario: {scenario_id}")
