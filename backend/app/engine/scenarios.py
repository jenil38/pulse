"""
PULSE — canned demo scenarios + scenario comparison.

The six flagship demo failures, each with a deterministic expected blast radius,
plus a comparison helper that quantifies "N x greater blast radius".
"""
from __future__ import annotations

from dataclasses import dataclass

from .blast_radius import compute_blast_radius
from .graph import DependencyGraph
from .simulation import SimulationResult, run_simulation
from .states import FailureType


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    origin: str
    failure_type: FailureType
    parameter: str  # human-readable change, e.g. "DECIMAL -> STRING"


DEMO_SCENARIOS: list[Scenario] = [
    Scenario("s1_payments_schema", "Payments schema drift", "stg_payments",
             FailureType.SCHEMA_DRIFT, "amount: DECIMAL -> STRING"),
    Scenario("s2_orders_outage", "Orders source outage", "src_orders",
             FailureType.SOURCE_OUTAGE, "Orders API unreachable"),
    Scenario("s3_inventory_stale", "Inventory freshness delay", "src_inventory",
             FailureType.STALE_DATA, "snapshot age > 24h"),
    Scenario("s4_customer_null", "Customer ID null spike", "stg_customers",
             FailureType.NULL_SPIKE, "customer_id null ratio -> 22%"),
    Scenario("s5_transform_fail", "Revenue transformation failure", "daily_revenue",
             FailureType.TRANSFORMATION_FAILURE, "model build error"),
    Scenario("s6_orders_volume", "Orders volume collapse", "src_orders",
             FailureType.VOLUME_DROP, "row count -87% vs baseline"),
]

SCENARIOS_BY_ID = {s.id: s for s in DEMO_SCENARIOS}


def run_scenario(graph: DependencyGraph, scenario_id: str,
                 duration_minutes: int = 30) -> SimulationResult:
    s = SCENARIOS_BY_ID[scenario_id]
    return run_simulation(graph, s.origin, s.failure_type, duration_minutes)


@dataclass
class ScenarioComparison:
    a: dict
    b: dict
    ratio: float
    verdict: str


def _summary(graph: DependencyGraph, origin: str, ft: FailureType, label: str) -> dict:
    br = compute_blast_radius(graph, origin, ft)
    return {
        "label": label,
        "origin": origin,
        "failure_type": ft.value,
        "affected_assets": br.total_affected,
        "critical_dashboards": len(br.critical_dashboards),
        "ml_models": len(br.ml_models),
        "teams": len(br.teams),
        "blast_score": br.score,
    }


def compare(graph: DependencyGraph,
            a_origin: str, a_ft: FailureType, a_label: str,
            b_origin: str, b_ft: FailureType, b_label: str) -> ScenarioComparison:
    a = _summary(graph, a_origin, a_ft, a_label)
    b = _summary(graph, b_origin, b_ft, b_label)
    a_score = a["blast_score"] or 1
    b_score = b["blast_score"] or 1
    if b_score >= a_score:
        ratio = round(b_score / a_score, 2)
        verdict = f"{b_label} has {ratio}x greater blast radius than {a_label}"
    else:
        ratio = round(a_score / b_score, 2)
        verdict = f"{a_label} has {ratio}x greater blast radius than {b_label}"
    return ScenarioComparison(a=a, b=b, ratio=ratio, verdict=verdict)
