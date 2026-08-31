"""
API tests — routes, validation, simulation flow, incident lifecycle.

Run:  python -m pytest backend/tests -q
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402

client = TestClient(app)


# --------------------------------------------------------------------------- #
#  Meta & topology
# --------------------------------------------------------------------------- #
def test_root_declares_simulated_telemetry():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["telemetry_source"] == "SIMULATED"


def test_topology_shape():
    r = client.get("/api/systems/topology")
    assert r.status_code == 200
    d = r.json()
    assert d["organization"] == "NOVA COMMERCE"
    assert d["telemetry_source"] == "SIMULATED"
    assert len(d["assets"]) == 43
    assert len(d["dependencies"]) == 47
    # every asset has a stable 3D position
    assert all(a["position"] is not None for a in d["assets"])


def test_topology_positions_are_stable_across_calls():
    a = client.get("/api/systems/topology").json()["assets"]
    b = client.get("/api/systems/topology").json()["assets"]
    pos_a = {x["id"]: x["position"] for x in a}
    pos_b = {x["id"]: x["position"] for x in b}
    assert pos_a == pos_b


def test_systems_rollup():
    r = client.get("/api/systems")
    assert r.status_code == 200
    names = {s["name"] for s in r.json()}
    assert {"Payments", "Commerce", "Analytics"} <= names


# --------------------------------------------------------------------------- #
#  Assets / lineage
# --------------------------------------------------------------------------- #
def test_asset_lineage():
    r = client.get("/api/assets/fact_orders")
    assert r.status_code == 200
    d = r.json()
    assert d["asset"]["name"] == "fact_orders"
    assert d["downstream_count"] > 0
    assert d["metric"]["source"] == "SIMULATED"
    up_ids = {u["id"] for u in d["upstream"]}
    assert "stg_orders" in up_ids


def test_unknown_asset_404():
    assert client.get("/api/assets/does_not_exist").status_code == 404


def test_downstream_endpoint():
    r = client.get("/api/assets/src_payments/downstream")
    assert r.status_code == 200
    ids = {a["id"] for a in r.json()}
    assert "dash_exec_revenue" in ids
    assert "dash_marketing" not in ids  # unrelated branch


# --------------------------------------------------------------------------- #
#  Health & resilience
# --------------------------------------------------------------------------- #
def test_health_overview():
    r = client.get("/api/health/overview")
    assert r.status_code == 200
    d = r.json()
    assert d["total_assets"] == 43
    assert 0 <= d["resilience_score"] <= 100
    assert d["telemetry_source"] == "SIMULATED"


def test_resilience_is_explainable():
    r = client.get("/api/resilience")
    assert r.status_code == 200
    d = r.json()
    assert "no ML" in d["method"]
    assert len(d["components"]) == 6
    assert d["spof_count"] > 0
    assert d["weakest_component_name"]


# --------------------------------------------------------------------------- #
#  Simulations
# --------------------------------------------------------------------------- #
def test_create_and_fetch_simulation():
    r = client.post("/api/simulations", json={
        "origin": "src_payments", "failure_type": "SOURCE_OUTAGE",
        "duration_minutes": 30, "parameter": "Stripe API unreachable"})
    assert r.status_code == 200
    d = r.json()
    assert d["simulated"] is True
    assert d["blast_radius"]["total_affected"] > 0
    assert d["recovery"][0]["kind"] == "restore"
    assert d["recovery"][-1]["kind"] == "resolve"
    assert d["timeline"][0]["kind"] == "inject"

    got = client.get(f"/api/simulations/{d['id']}")
    assert got.status_code == 200
    assert got.json()["blast_radius"]["total_affected"] == d["blast_radius"]["total_affected"]


def test_simulation_validates_origin_and_failure_type():
    assert client.post("/api/simulations", json={
        "origin": "nope", "failure_type": "SOURCE_OUTAGE"}).status_code == 404
    assert client.post("/api/simulations", json={
        "origin": "src_orders", "failure_type": "NOT_A_FAILURE"}).status_code == 422
    assert client.post("/api/simulations", json={
        "origin": "src_orders", "failure_type": "SOURCE_OUTAGE",
        "duration_minutes": 0}).status_code == 422


def test_orders_blast_bigger_than_payments_via_api():
    def blast(origin):
        return client.post("/api/simulations", json={
            "origin": origin, "failure_type": "SOURCE_OUTAGE"}).json()["blast_radius"]
    assert blast("src_orders")["total_affected"] > blast("src_payments")["total_affected"]


def test_unknown_simulation_404():
    assert client.get("/api/simulations/sim_nope").status_code == 404


# --------------------------------------------------------------------------- #
#  Scenarios & comparison
# --------------------------------------------------------------------------- #
def test_demo_scenarios_listed_and_runnable():
    r = client.get("/api/scenarios")
    assert r.status_code == 200
    scenarios = r.json()
    assert len(scenarios) == 6
    for s in scenarios:
        run = client.post(f"/api/scenarios/{s['id']}/run")
        assert run.status_code == 200
        assert run.json()["blast_radius"]["total_affected"] >= 1


def test_scenario_comparison():
    r = client.post("/api/scenarios/compare", json={
        "a_origin": "src_payments", "a_failure_type": "SOURCE_OUTAGE",
        "a_label": "Payments API outage",
        "b_origin": "src_orders", "b_failure_type": "SOURCE_OUTAGE",
        "b_label": "Orders DB outage"})
    assert r.status_code == 200
    d = r.json()
    assert d["ratio"] >= 1.0
    assert d["b"]["affected_assets"] > d["a"]["affected_assets"]
    assert "blast radius" in d["verdict"]


# --------------------------------------------------------------------------- #
#  Incident lifecycle
# --------------------------------------------------------------------------- #
def test_incident_list_and_detail():
    r = client.get("/api/incidents")
    assert r.status_code == 200
    incidents = r.json()
    assert len(incidents) >= 3
    iid = incidents[0]["id"]
    detail = client.get(f"/api/incidents/{iid}")
    assert detail.status_code == 200
    d = detail.json()
    assert d["blast_radius"]["total_affected"] >= 0
    assert d["timeline"]


def test_incident_acknowledge_then_resolve():
    open_incs = [i for i in client.get("/api/incidents").json() if i["status"] == "open"]
    assert open_incs, "expected a seeded open incident"
    iid = open_incs[0]["id"]

    ack = client.post(f"/api/incidents/{iid}/acknowledge")
    assert ack.status_code == 200
    assert ack.json()["status"] == "acknowledged"
    assert ack.json()["acknowledged_at"]

    res = client.post(f"/api/incidents/{iid}/resolve")
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"
    assert res.json()["resolved_at"]

    # acknowledging a resolved incident is a conflict
    assert client.post(f"/api/incidents/{iid}/acknowledge").status_code == 409


def test_incident_recovery_plan_from_topology():
    iid = client.get("/api/incidents").json()[0]["id"]
    r = client.get(f"/api/incidents/{iid}/recovery")
    assert r.status_code == 200
    steps = r.json()["steps"]
    assert steps[0]["kind"] == "restore"
    assert steps[-1]["kind"] == "resolve"


def test_unknown_incident_404():
    assert client.get("/api/incidents/inc_nope").status_code == 404
    assert client.post("/api/incidents/inc_nope/resolve").status_code == 404


def test_failure_types_catalogue():
    r = client.get("/api/failure-types")
    assert r.status_code == 200
    d = r.json()
    assert len(d) == 10
    modes = {x["mode"] for x in d}
    assert modes == {"STARVE", "BREAK", "CORRUPT"}
