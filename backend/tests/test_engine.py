"""
Engine tests — graph traversal, blast radius, propagation semantics,
resilience score, recovery order, scenario comparison, determinism.

Run with:  python -m pytest backend/tests -q
(or, with no pytest installed:  python backend/tests/test_engine.py)
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.engine import (  # noqa: E402
    FailureType,
    HealthState,
    NodeType,
    build_topology,
    compare,
    compute_blast_radius,
    compute_resilience,
    find_spofs,
    generate_recovery_plan,
    run_scenario,
    run_simulation,
)
from backend.app.engine.scenarios import DEMO_SCENARIOS  # noqa: E402
from backend.app.engine.states import Criticality  # noqa: E402


# --------------------------------------------------------------------------- #
#  Graph structure
# --------------------------------------------------------------------------- #
def test_topology_builds_and_is_acyclic():
    g = build_topology()
    order = g.topological_order()
    assert len(order) == len(g.assets)
    # sources come before their downstream tables
    assert order.index("src_orders") < order.index("fact_orders")


def test_descendants_and_ancestors_are_consistent():
    g = build_topology()
    assert "dash_exec_revenue" in g.descendants("src_payments")
    assert "src_payments" in g.ancestors("dash_exec_revenue")
    # an unrelated branch is not downstream
    assert "dash_marketing" not in g.descendants("src_payments")


# --------------------------------------------------------------------------- #
#  Blast radius
# --------------------------------------------------------------------------- #
def test_payments_outage_reaches_exec_dashboard_and_finance():
    g = build_topology()
    br = compute_blast_radius(g, "src_payments", FailureType.SOURCE_OUTAGE)
    assert "dash_exec_revenue" in br.nodes
    assert "team_finance" in br.teams
    # STARVE mode => downstream tables go STALE, dashboards untrustworthy
    assert br.nodes["fact_payments"].state is HealthState.STALE
    assert br.nodes["dash_exec_revenue"].untrustworthy is True


def test_unaffected_branch_stays_healthy():
    g = build_topology()
    br = compute_blast_radius(g, "src_payments", FailureType.SOURCE_OUTAGE)
    # marketing has nothing to do with payments
    assert "dash_marketing" not in br.nodes
    assert "team_marketing" not in br.nodes


def test_orders_has_larger_blast_radius_than_payments():
    g = build_topology()
    orders = compute_blast_radius(g, "src_orders", FailureType.SOURCE_OUTAGE)
    payments = compute_blast_radius(g, "src_payments", FailureType.SOURCE_OUTAGE)
    # fact_orders fans out to revenue, customers, marketing, demand ML
    assert orders.total_affected > payments.total_affected
    assert orders.score > payments.score
    assert len(orders.critical_dashboards) >= len(payments.critical_dashboards)


def test_schema_drift_breaks_transformations():
    g = build_topology()
    br = compute_blast_radius(g, "stg_payments", FailureType.SCHEMA_DRIFT)
    # BREAK mode: fact table degraded, revenue model degraded, dashboard untrusted
    assert br.nodes["fact_payments"].state in (HealthState.DEGRADED, HealthState.FAILED)
    assert br.nodes["dash_exec_revenue"].untrustworthy


def test_stale_mode_produces_stale_states():
    g = build_topology()
    br = compute_blast_radius(g, "src_inventory", FailureType.STALE_DATA)
    assert br.nodes["fact_inventory"].state is HealthState.STALE


def test_determinism_same_input_same_output():
    g = build_topology()
    a = compute_blast_radius(g, "src_orders", FailureType.SOURCE_OUTAGE)
    b = compute_blast_radius(g, "src_orders", FailureType.SOURCE_OUTAGE)
    assert a.affected_ids == b.affected_ids
    assert a.score == b.score


# --------------------------------------------------------------------------- #
#  Recovery
# --------------------------------------------------------------------------- #
def test_recovery_restores_origin_first_and_resolves_last():
    g = build_topology()
    br = compute_blast_radius(g, "src_payments", FailureType.SOURCE_OUTAGE)
    plan = generate_recovery_plan(g, br)
    assert plan[0].kind == "restore"
    assert plan[0].target_id == "src_payments"
    assert plan[-1].kind == "resolve"
    # dashboards are verified only after their upstream models are rebuilt
    rebuild_ids = [s.target_id for s in plan if s.kind == "rebuild"]
    verify_order = [s.order for s in plan if s.kind == "verify"]
    rebuild_order = [s.order for s in plan if s.kind == "rebuild"]
    if rebuild_order and verify_order:
        assert max(rebuild_order) < min(verify_order)


def test_backfill_only_for_starve_failures():
    g = build_topology()
    starve = generate_recovery_plan(
        g, compute_blast_radius(g, "src_orders", FailureType.SOURCE_OUTAGE))
    corrupt = generate_recovery_plan(
        g, compute_blast_radius(g, "stg_customers", FailureType.NULL_SPIKE))
    assert any(s.kind == "backfill" for s in starve)
    assert not any(s.kind == "backfill" for s in corrupt)


# --------------------------------------------------------------------------- #
#  Resilience
# --------------------------------------------------------------------------- #
def test_resilience_score_in_range_and_explained():
    g = build_topology()
    r = compute_resilience(g)
    assert 0 <= r.score <= 100
    assert r.components  # breakdown present
    assert r.weakest_component is not None
    # penalties sum to (100 - score) within rounding
    total_penalty = sum(c.penalty for c in r.components)
    assert abs((100 - total_penalty) - r.score) <= 1


def test_spofs_include_single_source_chains():
    g = build_topology()
    spofs = find_spofs(g)
    # the Orders source solely gates the board reporting chain
    assert "src_orders" in spofs


# --------------------------------------------------------------------------- #
#  Scenarios & simulation
# --------------------------------------------------------------------------- #
def test_all_demo_scenarios_run():
    g = build_topology()
    for sc in DEMO_SCENARIOS:
        res = run_scenario(g, sc.id)
        assert res.blast.total_affected >= 1
        assert res.recovery[-1].kind == "resolve"
        assert res.timeline[0].kind == "inject"


def test_simulation_timeline_is_ordered():
    g = build_topology()
    res = run_simulation(g, "src_orders", FailureType.SOURCE_OUTAGE, duration_minutes=30)
    times = [e.t for e in res.timeline]
    assert times == sorted(times)
    assert res.timeline[0].t == 0


def test_scenario_comparison_ratio():
    g = build_topology()
    cmp = compare(
        g, "src_payments", FailureType.SOURCE_OUTAGE, "Payments API outage",
        "src_orders", FailureType.SOURCE_OUTAGE, "Orders DB outage")
    assert cmp.ratio >= 1.0
    assert "blast radius" in cmp.verdict


# --------------------------------------------------------------------------- #
#  no-pytest fallback runner
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {fn.__name__}: {exc}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
