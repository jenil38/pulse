"""
PULSE — deterministic topology layout.

Positions are computed once, server-side, so the 3D graph is identical on every
reload and across clients (no jitter, no random seeds, no client-side physics).

Layout model: assets are placed in *stage layers* along X (the direction data
flows), spread across Y within their layer, and pushed along Z by system so
parallel pipelines read as separate lanes in depth.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .graph import DependencyGraph
from .states import NodeType

# X position per pipeline stage — data flows left -> right.
# Kept tighter than the Z/Y spread so the graph reads as a VOLUME rather than a
# flat horizontal ribbon when viewed from the establishing camera.
_STAGE_X = {
    NodeType.SOURCE: -44.0,
    NodeType.INGESTION: -31.5,
    NodeType.RAW_TABLE: -19.0,
    NodeType.TRANSFORMATION: -6.5,
    NodeType.WAREHOUSE_TABLE: 7.0,
    NodeType.DATA_MODEL: 21.0,
    NodeType.DASHBOARD: 35.5,
    NodeType.ML_MODEL: 35.5,
    NodeType.BUSINESS_PROCESS: 48.0,
    NodeType.TEAM: 60.0,
}

# Z lane per system — separate pipelines occupy distinct planes in depth.
_SYSTEM_Z = {
    "Payments": -42.0,
    "Commerce": -14.0,
    "Inventory": 14.0,
    "Marketing": 42.0,
    "Analytics": 0.0,
    "Business": 0.0,
}

# Each system lane also sits at its own height, so the four source pipelines
# read as stacked strata instead of one flat plane.
_SYSTEM_Y = {
    "Payments": 20.0,
    "Commerce": 7.0,
    "Inventory": -7.0,
    "Marketing": -20.0,
    "Analytics": 0.0,
    "Business": 0.0,
}

_Y_SPREAD = 11.0


@dataclass(frozen=True)
class Position:
    x: float
    y: float
    z: float


def _lanes(names: list[str]) -> dict[str, tuple[float, float]]:
    """Depth/height for every lane, including ones this module has never seen.

    The demo's lanes are hand-placed above. A system somebody built themselves
    names its own, so those are spread evenly around the origin in sorted order
    — deterministic, and never all stacked on z=0 where parallel pipelines
    would overlap into one ribbon.
    """
    placed = {n: (_SYSTEM_Z[n], _SYSTEM_Y[n]) for n in names if n in _SYSTEM_Z}
    unknown = [n for n in names if n not in _SYSTEM_Z]
    if unknown:
        span = 42.0
        n = len(unknown)
        for i, name in enumerate(unknown):
            t = 0.0 if n == 1 else (i / (n - 1)) * 2.0 - 1.0
            placed[name] = (round(t * span, 2), round(t * span * 0.48, 2))
    return placed


def _depth_x(graph: DependencyGraph) -> dict[str, float]:
    """Stage every node by its longest path from a root, on the _STAGE_X grid."""
    depth: dict[str, int] = {}
    for nid in graph.topological_order():
        preds = graph.predecessors(nid)
        depth[nid] = 0 if not preds else max(depth[p] for p in preds) + 1
    step = 12.5
    return {nid: -44.0 + d * step for nid, d in depth.items()}


def _stage_x(graph: DependencyGraph) -> dict[str, float]:
    """Where each component sits along the direction data flows.

    Normally the node's own type says which pipeline stage it is, and that is
    the more meaningful answer. But a system somebody described themselves may
    call almost everything a service, and typing every node the same would
    stack the whole graph into one column.

    So both readings are computed and the one that actually separates the graph
    wins, with ties going to the declared types. Dependency depth is not a
    different fact from the stage — it is the same fact, recovered from the
    edges when the types were not specific enough to carry it.
    """
    by_type = {nid: _STAGE_X[graph.node(nid).type] for nid in graph.ids()}
    try:
        by_depth = _depth_x(graph)
    except ValueError:  # a cycle: no depth exists, so the types are all we have
        return by_type
    return by_depth if len(set(by_depth.values())) > len(set(by_type.values())) else by_type


def compute_layout(graph: DependencyGraph) -> dict[str, Position]:
    """Stable 3D position for every asset."""
    positions: dict[str, Position] = {}
    stage_x = _stage_x(graph)

    # Group by (stage, system) so members of a lane fan out predictably in Y.
    groups: dict[tuple[float, str], list[str]] = {}
    for aid in graph.ids():  # sorted -> deterministic
        groups.setdefault((stage_x[aid], graph.node(aid).system), []).append(aid)

    lanes = _lanes(sorted({a.system for a in graph.assets.values()}))

    for (x, system), members in groups.items():
        z_base, y_base = lanes.get(system, (0.0, 0.0))
        n = len(members)
        for i, aid in enumerate(members):
            # Centre the group: t runs -1..1 across the members of the lane.
            t = 0.0 if n == 1 else (i / (n - 1)) * 2.0 - 1.0

            if system in ("Analytics", "Business") and n > 1:
                # Convergence stages fan out in BOTH depth and height, so the
                # many-to-few funnel is legible from the establishing camera.
                z = t * 34.0
                y = y_base + math.cos(t * math.pi * 0.5) * 9.0 - 3.0
            else:
                z = z_base
                y = y_base + (t * _Y_SPREAD if n > 1 else 0.0)

            positions[aid] = Position(round(x, 2), round(y, 2), round(z, 2))

    return positions
