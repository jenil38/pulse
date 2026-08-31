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
    NodeType.SOURCE: -52.0,
    NodeType.INGESTION: -37.0,
    NodeType.RAW_TABLE: -22.0,
    NodeType.TRANSFORMATION: -7.0,
    NodeType.WAREHOUSE_TABLE: 9.0,
    NodeType.DATA_MODEL: 25.0,
    NodeType.DASHBOARD: 42.0,
    NodeType.ML_MODEL: 42.0,
    NodeType.BUSINESS_PROCESS: 57.0,
    NodeType.TEAM: 72.0,
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
    "Payments": 9.0,
    "Commerce": 3.0,
    "Inventory": -3.0,
    "Marketing": -9.0,
    "Analytics": 0.0,
    "Business": 0.0,
}

_Y_SPREAD = 7.0


@dataclass(frozen=True)
class Position:
    x: float
    y: float
    z: float


def compute_layout(graph: DependencyGraph) -> dict[str, Position]:
    """Stable 3D position for every asset."""
    positions: dict[str, Position] = {}

    # Group by (stage, system) so members of a lane fan out predictably in Y.
    groups: dict[tuple[NodeType, str], list[str]] = {}
    for aid in graph.ids():  # sorted -> deterministic
        a = graph.node(aid)
        groups.setdefault((a.type, a.system), []).append(aid)

    for (ntype, system), members in groups.items():
        x = _STAGE_X[ntype]
        z_base = _SYSTEM_Z.get(system, 0.0)
        y_base = _SYSTEM_Y.get(system, 0.0)
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
