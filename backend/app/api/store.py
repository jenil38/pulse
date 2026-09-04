"""
PULSE — demo-system accessors.

PULSE used to keep exactly one topology in a module-level singleton here. It
now keeps many, one per account, in `workspace`. This module survives as the
short way to reach the *demo* system, which is what the engine tests and the
camera-framing tool want and what an anonymous visitor sees.

Anything that needs to respect ownership must go through `workspace.resolve`
instead — this module deliberately offers no way to reach a user's system.
"""
from __future__ import annotations

from ..engine.graph import DependencyGraph
from ..engine.layout import Position
from . import workspace
from .workspace import Incident  # re-exported: the demo's incident record type

__all__ = ["Incident", "graph", "layout", "incidents", "incident",
           "active_incident_count"]


def graph() -> DependencyGraph:
    return workspace.demo().graph


def layout() -> dict[str, Position]:
    return workspace.demo().layout


def incidents() -> list[Incident]:
    return workspace.incidents(workspace.demo())


def incident(iid: str) -> Incident | None:
    return workspace.demo().incidents.get(iid)


def active_incident_count() -> int:
    return workspace.active_incident_count(workspace.demo())
