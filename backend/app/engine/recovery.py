"""
PULSE — recovery planner.

Generates a recommended recovery sequence *from the topology*, not from
hard-coded UI text. The order is: restore the origin, validate the first landed
data, backfill the missing window (only for STARVE-mode failures), then rebuild
each affected data asset in dependency order, then re-verify every affected
dashboard / ML model, then close out with the impacted teams.
"""
from __future__ import annotations

from dataclasses import dataclass

from .blast_radius import BlastRadius
from .graph import DependencyGraph
from .states import (
    CONSUMER_TYPES,
    DATA_ASSET_TYPES,
    FAILURE_LABEL,
    FailureType,
    NodeType,
    PropagationMode,
)


@dataclass
class RecoveryStep:
    order: int
    action: str
    target_id: str | None
    target_name: str | None
    kind: str  # restore | validate | backfill | rebuild | verify | resolve


_RESTORE_VERB = {
    NodeType.SOURCE: "Restore",
    NodeType.INGESTION: "Restart",
    NodeType.TRANSFORMATION: "Fix and rerun",
    NodeType.RAW_TABLE: "Reload",
    NodeType.WAREHOUSE_TABLE: "Rebuild",
    NodeType.DATA_MODEL: "Rebuild",
}


def generate_recovery_plan(graph: DependencyGraph, br: BlastRadius) -> list[RecoveryStep]:
    steps: list[RecoveryStep] = []
    n = 0

    def add(action: str, target_id, target_name, kind: str):
        nonlocal n
        n += 1
        steps.append(RecoveryStep(n, action, target_id, target_name, kind))

    origin = graph.node(br.origin)
    fail_label = FAILURE_LABEL[br.failure_type]

    # 1. Restore / remediate the origin.
    verb = _RESTORE_VERB.get(origin.type, "Restore")
    if br.failure_type is FailureType.SCHEMA_DRIFT:
        add(f"Reject the drifted schema and restore the data contract at {origin.name}",
            origin.id, origin.name, "restore")
    elif br.failure_type is FailureType.DATATYPE_CHANGE:
        add(f"Pin the expected datatype and re-parse {origin.name}",
            origin.id, origin.name, "restore")
    else:
        add(f"{verb} {origin.name} ({fail_label.lower()})",
            origin.id, origin.name, "restore")

    # 2. Validate the first landed / ingested data below the origin.
    first_hop = sorted(
        (nid for nid in br.affected_ids
         if graph.node(nid).type in (NodeType.INGESTION, NodeType.RAW_TABLE)
         and br.nodes[nid].hops <= 2),
        key=lambda x: (br.nodes[x].hops, x),
    )
    for nid in first_hop[:1]:
        add(f"Validate freshly landed data in {graph.node(nid).name}",
            nid, graph.node(nid).name, "validate")

    # 3. Backfill (only when data was starved / missing).
    if br.mode is PropagationMode.STARVE:
        add("Backfill the missing time window", None, None, "backfill")

    # 4. Rebuild affected data assets in dependency order.
    data_assets = [nid for nid in br.affected_ids
                   if graph.node(nid).type in DATA_ASSET_TYPES
                   and nid not in {s.target_id for s in steps}]
    for nid in graph.topological_order(set(data_assets)):
        name = graph.node(nid).name
        add(f"Rebuild {name}", nid, name, "rebuild")

    # 5. Re-verify consumers.
    for nid in br.affected_ids:
        if graph.node(nid).type in CONSUMER_TYPES:
            name = graph.node(nid).name
            kind_word = "model" if graph.node(nid).type is NodeType.ML_MODEL else "dashboard"
            add(f"Verify {kind_word} {name} is trustworthy again",
                nid, name, "verify")

    # 6. Resolve.
    team_names = [graph.node(t).name for t in br.teams]
    if team_names:
        add(f"Notify {', '.join(team_names)} and mark incident resolved",
            None, None, "resolve")
    else:
        add("Mark incident resolved", None, None, "resolve")

    return steps
