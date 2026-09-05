"""
Workspace tests: a user's own systems, and the wall between them.

The point of this layer is that PULSE stops being a pre-populated demo. Two
things have to hold for that to be true, and both are tested here:

  * a new account starts EMPTY — the demo is reachable, but it is not theirs
  * the whole analysis surface runs on the graph the user actually built,
    and refuses to run on anybody else's
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.api import workspace
from backend.app.main import app

client = TestClient(app)


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
def new_account() -> dict:
    """Register a throwaway account and return its auth header."""
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/api/auth/register", json={
        "name": "Test Person", "email": email, "password": "correct-horse",
    })
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


#: The system from the specification's own worked example. `source` depends on
#: `target`, so a Payment DB failure must reach the Website.
ACME = {
    "name": "Acme E-commerce",
    "description": "Checkout path",
    "components": [
        {"name": "Website", "type": "service"},
        {"name": "Order Service", "type": "service"},
        {"name": "Payment Service", "type": "service"},
        {"name": "Payment DB", "type": "database"},
    ],
    "dependencies": [
        {"source": "Website", "target": "Order Service"},
        {"source": "Order Service", "target": "Payment Service"},
        {"source": "Payment Service", "target": "Payment DB"},
    ],
}


def create_acme(headers: dict) -> dict:
    r = client.post("/api/workspace/systems", json=ACME, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# --------------------------------------------------------------------------- #
#  Empty workspace
# --------------------------------------------------------------------------- #
def test_new_account_workspace_is_empty():
    headers = new_account()
    r = client.get("/api/workspace/systems", headers=headers)
    assert r.status_code == 200
    assert r.json() == []


def test_workspace_requires_authentication():
    assert client.get("/api/workspace/systems").status_code == 401


def test_demo_is_reachable_without_an_account():
    r = client.get("/api/workspace/demo")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "demo"
    assert body["read_only"] is True
    assert body["component_count"] > 0


def test_demo_does_not_appear_in_a_users_systems():
    headers = new_account()
    create_acme(headers)
    ids = [s["id"] for s in client.get("/api/workspace/systems", headers=headers).json()]
    assert ids and workspace.DEMO_SYSTEM_ID not in ids


# --------------------------------------------------------------------------- #
#  Creation, editing, retrieval
# --------------------------------------------------------------------------- #
def test_create_and_retrieve_a_system():
    headers = new_account()
    created = create_acme(headers)
    assert created["component_count"] == 4
    assert created["dependency_count"] == 3
    assert created["read_only"] is False

    fetched = client.get(f"/api/workspace/systems/{created['id']}", headers=headers)
    assert fetched.status_code == 200
    assert {c["name"] for c in fetched.json()["components"]} == {
        "Website", "Order Service", "Payment Service", "Payment DB",
    }


def test_saving_the_builder_replaces_the_graph():
    headers = new_account()
    sid = create_acme(headers)["id"]

    r = client.put(f"/api/workspace/systems/{sid}/graph", headers=headers, json={
        "components": [
            {"name": "Website", "type": "service"},
            {"name": "Order Service", "type": "service"},
            {"name": "Email Service", "type": "service"},
        ],
        "dependencies": [
            {"source": "Website", "target": "Order Service"},
            {"source": "Order Service", "target": "Email Service"},
        ],
    })
    assert r.status_code == 200
    assert r.json()["component_count"] == 3
    assert "Payment DB" not in {c["name"] for c in r.json()["components"]}


def test_rename_and_delete():
    headers = new_account()
    sid = create_acme(headers)["id"]

    r = client.patch(f"/api/workspace/systems/{sid}", headers=headers,
                     json={"name": "Acme Checkout"})
    assert r.status_code == 200 and r.json()["name"] == "Acme Checkout"

    assert client.delete(f"/api/workspace/systems/{sid}", headers=headers).status_code == 204
    assert client.get(f"/api/workspace/systems/{sid}", headers=headers).status_code == 404


def test_demo_cannot_be_edited_or_deleted():
    headers = new_account()
    assert client.patch(f"/api/workspace/systems/{workspace.DEMO_SYSTEM_ID}",
                        headers=headers, json={"name": "Mine now"}).status_code == 403
    assert client.delete(f"/api/workspace/systems/{workspace.DEMO_SYSTEM_ID}",
                         headers=headers).status_code == 403


# --------------------------------------------------------------------------- #
#  Ownership
# --------------------------------------------------------------------------- #
def test_another_user_cannot_read_modify_or_delete_your_system():
    owner = new_account()
    intruder = new_account()
    sid = create_acme(owner)["id"]

    # 404 rather than 403: the API must not confirm the id exists.
    assert client.get(f"/api/workspace/systems/{sid}", headers=intruder).status_code == 404
    assert client.patch(f"/api/workspace/systems/{sid}", headers=intruder,
                        json={"name": "Taken"}).status_code == 404
    assert client.put(f"/api/workspace/systems/{sid}/graph", headers=intruder,
                      json={"components": [{"name": "X"}], "dependencies": []}
                      ).status_code == 404
    assert client.delete(f"/api/workspace/systems/{sid}", headers=intruder).status_code == 404

    # And it is untouched.
    assert client.get(f"/api/workspace/systems/{sid}", headers=owner).json()["name"] == \
        "Acme E-commerce"


def test_analysis_routes_refuse_another_users_system():
    owner = new_account()
    intruder = new_account()
    sid = create_acme(owner)["id"]

    for path in (
        f"/api/systems/topology?system={sid}",
        f"/api/health/overview?system={sid}",
        f"/api/resilience?system={sid}",
        f"/api/incidents?system={sid}",
        f"/api/scenarios?system={sid}",
    ):
        assert client.get(path, headers=intruder).status_code == 404, path
        assert client.get(path).status_code == 404, path

    r = client.post(f"/api/simulations?system={sid}", headers=intruder,
                    json={"origin": "payment_db", "failure_type": "SOURCE_OUTAGE"})
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
#  Import validation
# --------------------------------------------------------------------------- #
def test_import_rejects_a_missing_component_reference():
    headers = new_account()
    r = client.post("/api/workspace/systems", headers=headers, json={
        "name": "Broken",
        "components": [{"name": "Website", "type": "service"}],
        "dependencies": [{"source": "Website", "target": "Ghost Service"}],
    })
    assert r.status_code == 422
    assert "Ghost Service" in r.json()["detail"]


def test_import_rejects_a_cycle():
    headers = new_account()
    r = client.post("/api/workspace/systems", headers=headers, json={
        "name": "Loop",
        "components": [{"name": "A"}, {"name": "B"}],
        "dependencies": [
            {"source": "A", "target": "B"},
            {"source": "B", "target": "A"},
        ],
    })
    assert r.status_code == 422
    assert "cycle" in r.json()["detail"].lower()


def test_import_rejects_duplicates_self_edges_and_empty_systems():
    headers = new_account()

    dup = client.post("/api/workspace/systems", headers=headers, json={
        "name": "Dupes",
        "components": [{"name": "A"}, {"name": "A"}], "dependencies": [],
    })
    assert dup.status_code == 422

    loop = client.post("/api/workspace/systems", headers=headers, json={
        "name": "Selfie",
        "components": [{"name": "A"}],
        "dependencies": [{"source": "A", "target": "A"}],
    })
    assert loop.status_code == 422

    empty = client.post("/api/workspace/systems", headers=headers, json={
        "name": "Nothing", "components": [], "dependencies": [],
    })
    assert empty.status_code == 422


def test_import_rejects_an_unknown_component_type():
    headers = new_account()
    r = client.post("/api/workspace/systems", headers=headers, json={
        "name": "Odd",
        "components": [{"name": "A", "type": "quantum-flux"}],
        "dependencies": [],
    })
    assert r.status_code == 422


def test_validate_endpoint_reports_problems_without_saving():
    headers = new_account()
    bad = client.post("/api/workspace/systems/validate", headers=headers, json={
        "components": [{"name": "A"}],
        "dependencies": [{"source": "A", "target": "Nope"}],
    })
    assert bad.status_code == 200 and bad.json()["ok"] is False

    good = client.post("/api/workspace/systems/validate", headers=headers, json={
        "components": [{"name": "A"}, {"name": "B"}],
        "dependencies": [{"source": "A", "target": "B"}],
    })
    assert good.json() == {"ok": True, "component_count": 2, "dependency_count": 1}
    assert client.get("/api/workspace/systems", headers=headers).json() == []


# --------------------------------------------------------------------------- #
#  Simulation runs on the user's own graph
# --------------------------------------------------------------------------- #
def test_simulation_propagates_through_the_users_own_dependencies():
    headers = new_account()
    created = create_acme(headers)
    sid = created["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=headers).json()["components"]}

    r = client.post(f"/api/simulations?system={sid}", headers=headers, json={
        "origin": keys["Payment DB"], "failure_type": "SOURCE_OUTAGE",
    })
    assert r.status_code == 200, r.text
    affected = set(r.json()["blast_radius"]["affected_ids"])

    # Payment DB -> Payment Service -> Order Service -> Website
    assert keys["Payment Service"] in affected
    assert keys["Order Service"] in affected
    assert keys["Website"] in affected


def test_simulation_does_not_reach_an_unrelated_branch():
    headers = new_account()
    r = client.post("/api/workspace/systems", headers=headers, json={
        "name": "Two branches",
        "components": [
            {"name": "Web"}, {"name": "Orders"}, {"name": "Orders DB"},
            {"name": "Reporting"}, {"name": "Reporting DB"},
        ],
        "dependencies": [
            {"source": "Web", "target": "Orders"},
            {"source": "Orders", "target": "Orders DB"},
            {"source": "Reporting", "target": "Reporting DB"},
        ],
    })
    sid = r.json()["id"]
    keys = {c["name"]: c["key"] for c in r.json()["components"]}

    sim = client.post(f"/api/simulations?system={sid}", headers=headers, json={
        "origin": keys["Orders DB"], "failure_type": "SOURCE_OUTAGE",
    }).json()
    affected = set(sim["blast_radius"]["affected_ids"])
    assert keys["Orders"] in affected
    assert keys["Reporting"] not in affected
    assert keys["Reporting DB"] not in affected


def test_topology_and_health_reflect_the_users_system_not_the_demo():
    headers = new_account()
    sid = create_acme(headers)["id"]

    topo = client.get(f"/api/systems/topology?system={sid}", headers=headers).json()
    assert topo["organization"] == "Acme E-commerce"
    assert len(topo["assets"]) == 4
    assert all("src_payments" != a["id"] for a in topo["assets"])

    overview = client.get(f"/api/health/overview?system={sid}", headers=headers).json()
    assert overview["total_assets"] == 4
    assert overview["active_incidents"] == 0


def test_omitting_the_system_parameter_still_serves_the_demo():
    topo = client.get("/api/systems/topology").json()
    assert topo["organization"] == "NOVA COMMERCE"
    assert len(topo["assets"]) > 4


def test_a_single_type_system_still_reads_left_to_right():
    """
    A user who calls everything a "service" must not get one stacked column.

    The stage a component sits at comes from its type when the types are
    specific enough to say, and from dependency depth when they are not.
    """
    headers = new_account()
    created = create_acme(headers)
    sid = created["id"]
    topo = client.get(f"/api/systems/topology?system={sid}", headers=headers).json()
    x = {a["name"]: a["position"]["x"] for a in topo["assets"]}

    assert x["Payment DB"] < x["Payment Service"] < x["Order Service"] < x["Website"]


def test_the_demo_is_still_staged_by_component_type():
    topo = client.get("/api/systems/topology").json()
    x = {a["id"]: a["position"]["x"] for a in topo["assets"]}
    # Every source shares one column, which only holds while types drive staging.
    sources = [x[a["id"]] for a in topo["assets"] if a["type"] == "SOURCE"]
    assert len(set(sources)) == 1
    assert x["src_payments"] < x["ing_payments"] < x["raw_payments"]


# --------------------------------------------------------------------------- #
#  Scenarios
# --------------------------------------------------------------------------- #
def test_saved_scenarios_belong_to_the_system_and_can_be_rerun():
    headers = new_account()
    created = create_acme(headers)
    sid = created["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=headers).json()["components"]}

    r = client.post(f"/api/workspace/systems/{sid}/scenarios", headers=headers, json={
        "name": "Payment DB Failure",
        "origin": keys["Payment DB"],
        "failure_type": "SOURCE_OUTAGE",
        "duration_minutes": 45,
    })
    assert r.status_code == 201, r.text
    scenario_id = r.json()["id"]

    listed = client.get(f"/api/scenarios?system={sid}", headers=headers).json()
    assert [s["id"] for s in listed] == [scenario_id]

    run = client.post(f"/api/scenarios/{scenario_id}/run?system={sid}", headers=headers)
    assert run.status_code == 200
    assert run.json()["duration_minutes"] == 45
    assert keys["Website"] in run.json()["blast_radius"]["affected_ids"]


def test_another_user_cannot_see_or_delete_your_scenarios():
    owner = new_account()
    intruder = new_account()
    sid = create_acme(owner)["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=owner).json()["components"]}
    scenario_id = client.post(
        f"/api/workspace/systems/{sid}/scenarios", headers=owner,
        json={"name": "Theirs", "origin": keys["Payment DB"],
              "failure_type": "SOURCE_OUTAGE"},
    ).json()["id"]

    assert client.get(f"/api/workspace/systems/{sid}/scenarios",
                      headers=intruder).status_code == 404
    assert client.delete(f"/api/workspace/systems/{sid}/scenarios/{scenario_id}",
                         headers=intruder).status_code == 404
    assert len(client.get(f"/api/workspace/systems/{sid}/scenarios",
                          headers=owner).json()) == 1


def test_scenarios_cannot_be_saved_against_the_demo():
    headers = new_account()
    r = client.post(f"/api/workspace/systems/{workspace.DEMO_SYSTEM_ID}/scenarios",
                    headers=headers,
                    json={"name": "Nope", "origin": "src_orders",
                          "failure_type": "SOURCE_OUTAGE"})
    assert r.status_code == 403


def test_the_demo_still_lists_its_curated_scenarios():
    listed = client.get("/api/scenarios").json()
    assert {s["id"] for s in listed} >= {"s1_payments_schema", "s2_orders_outage"}


# --------------------------------------------------------------------------- #
#  Incidents
# --------------------------------------------------------------------------- #
def test_a_user_system_starts_with_no_incidents_and_can_record_one():
    headers = new_account()
    sid = create_acme(headers)["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=headers).json()["components"]}

    assert client.get(f"/api/incidents?system={sid}", headers=headers).json() == []

    r = client.post(f"/api/incidents?system={sid}", headers=headers, json={
        "origin": keys["Payment DB"], "failure_type": "SOURCE_OUTAGE",
        "duration_minutes": 30,
    })
    assert r.status_code == 201
    incident_id = r.json()["id"]

    detail = client.get(f"/api/incidents/{incident_id}?system={sid}", headers=headers)
    assert detail.status_code == 200
    assert keys["Website"] in detail.json()["blast_radius"]["affected_ids"]

    # The demo's seeded incidents are not visible from this system.
    assert client.get(f"/api/incidents/inc_2041?system={sid}",
                      headers=headers).status_code == 404


def test_demo_incidents_cannot_be_recorded_into():
    headers = new_account()
    r = client.post("/api/incidents", headers=headers,
                    json={"origin": "src_orders", "failure_type": "SOURCE_OUTAGE"})
    assert r.status_code == 403


# --------------------------------------------------------------------------- #
#  Resilience history
#
#  The score is only credible if every number in it came from the system being
#  scored. A user's system must never inherit the demo's curated history.
# --------------------------------------------------------------------------- #
def _history_component(body: dict) -> dict:
    return next(c for c in body["components"] if c["name"] == "incident_history")


def test_a_new_system_is_not_penalised_for_incidents_it_never_had():
    headers = new_account()
    sid = create_acme(headers)["id"]

    res = client.get(f"/api/resilience?system={sid}", headers=headers).json()
    history = _history_component(res)

    assert history["penalty"] == 0
    # And it must not describe somebody else's incidents.
    assert "0 recent incidents" in history["detail"]
    assert "demo" not in history["detail"].lower()


def test_recording_an_incident_is_what_creates_the_history_penalty():
    headers = new_account()
    sid = create_acme(headers)["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=headers).json()["components"]}

    before = client.get(f"/api/resilience?system={sid}", headers=headers).json()
    assert _history_component(before)["penalty"] == 0

    client.post(f"/api/incidents?system={sid}", headers=headers, json={
        "origin": keys["Payment DB"], "failure_type": "SOURCE_OUTAGE",
    })

    after = client.get(f"/api/resilience?system={sid}", headers=headers).json()
    history = _history_component(after)
    # One incident, still open: 1 * 1.5 + 1 * 2.0
    assert history["penalty"] == 3.5
    assert "1 recent incidents, 1 unresolved" in history["detail"]
    assert after["score"] < before["score"]


def test_resolving_an_incident_releases_the_unresolved_penalty():
    headers = new_account()
    sid = create_acme(headers)["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=headers).json()["components"]}

    inc = client.post(f"/api/incidents?system={sid}", headers=headers, json={
        "origin": keys["Payment DB"], "failure_type": "SOURCE_OUTAGE",
    }).json()["id"]
    client.post(f"/api/incidents/{inc}/resolve?system={sid}", headers=headers)

    history = _history_component(
        client.get(f"/api/resilience?system={sid}", headers=headers).json()
    )
    # The incident still counts as recent, but nothing is broken now.
    assert "1 recent incidents, 0 unresolved" in history["detail"]
    assert history["penalty"] == 1.5


def test_the_demo_keeps_its_curated_history():
    """The sample system is documented as scoring 65, and that must hold."""
    res = client.get("/api/resilience").json()
    assert _history_component(res)["penalty"] == 5.0
    assert res["score"] == 65


def test_the_score_a_system_lists_with_matches_the_one_it_opens_with():
    """The workspace card and the Resilience screen must not disagree."""
    headers = new_account()
    sid = create_acme(headers)["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=headers).json()["components"]}
    client.post(f"/api/incidents?system={sid}", headers=headers, json={
        "origin": keys["Payment DB"], "failure_type": "SOURCE_OUTAGE",
    })

    listed = client.get("/api/workspace/systems", headers=headers).json()[0]
    detail = client.get(f"/api/resilience?system={sid}", headers=headers).json()
    overview = client.get(f"/api/health/overview?system={sid}", headers=headers).json()

    assert listed["resilience_score"] == detail["score"] == overview["resilience_score"]


# --------------------------------------------------------------------------- #
#  Editing keeps what the user already described
# --------------------------------------------------------------------------- #
def test_editing_a_system_preserves_its_dependencies():
    """
    The builder round-trips through `GET /workspace/systems/{id}` and saves via
    `PUT .../graph`, which REPLACES the graph. So the read has to return every
    dependency in the form the save expects, or editing a name would silently
    erase the user's edges.
    """
    headers = new_account()
    sid = create_acme(headers)["id"]

    loaded = client.get(f"/api/workspace/systems/{sid}", headers=headers).json()
    assert len(loaded["dependencies"]) == 3

    # Save exactly what was loaded back, as the builder does.
    saved = client.put(f"/api/workspace/systems/{sid}/graph", headers=headers, json={
        "components": [
            {"name": c["name"], "type": c["type"], "key": c["key"],
             "group": c["group"], "criticality": c["criticality"]}
            for c in loaded["components"]
        ],
        "dependencies": loaded["dependencies"],
    })
    assert saved.status_code == 200, saved.text
    assert saved.json()["dependency_count"] == 3

    # The propagation path still works, which is the thing edges are for.
    keys = {c["name"]: c["key"] for c in saved.json()["components"]}
    sim = client.post(f"/api/simulations?system={sid}", headers=headers, json={
        "origin": keys["Payment DB"], "failure_type": "SOURCE_OUTAGE",
    }).json()
    assert keys["Website"] in sim["blast_radius"]["affected_ids"]


# --------------------------------------------------------------------------- #
#  Persistence
# --------------------------------------------------------------------------- #
def test_systems_survive_a_reload_of_the_store():
    headers = new_account()
    sid = create_acme(headers)["id"]

    # Simulate a restart: drop everything in memory, then load from disk.
    workspace.reset_for_tests()
    assert client.get(f"/api/workspace/systems/{sid}", headers=headers).status_code == 404
    workspace.load()

    restored = client.get(f"/api/workspace/systems/{sid}", headers=headers)
    assert restored.status_code == 200
    assert restored.json()["name"] == "Acme E-commerce"
    assert restored.json()["dependency_count"] == 3


def test_an_account_survives_a_reload_and_still_owns_its_systems():
    headers = new_account()
    sid = create_acme(headers)["id"]

    workspace.reset_for_tests()
    workspace.load()

    # The same token still resolves, and still reaches the same system.
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    listed = client.get("/api/workspace/systems", headers=headers).json()
    assert [s["id"] for s in listed] == [sid]


# --------------------------------------------------------------------------- #
#  Demo incidents are read-only
# --------------------------------------------------------------------------- #
def test_demo_incidents_cannot_be_acknowledged():
    """A visitor must not be able to mutate the shared demo's incident state."""
    r = client.post("/api/incidents/inc_2043/acknowledge")
    assert r.status_code == 403
    assert "read-only" in r.json()["detail"].lower()


def test_demo_incidents_cannot_be_resolved():
    r = client.post("/api/incidents/inc_2043/resolve")
    assert r.status_code == 403
    assert "read-only" in r.json()["detail"].lower()


def test_demo_incidents_are_read_only_even_when_authenticated():
    """Signing in does not grant write access to the demo."""
    headers = new_account()
    ack = client.post("/api/incidents/inc_2043/acknowledge", headers=headers)
    res = client.post("/api/incidents/inc_2043/resolve", headers=headers)
    assert ack.status_code == 403
    assert res.status_code == 403


def test_user_incidents_can_still_be_acknowledged_and_resolved():
    """The read-only guard must not affect a user's own system."""
    headers = new_account()
    sid = create_acme(headers)["id"]
    keys = {c["name"]: c["key"] for c in
            client.get(f"/api/workspace/systems/{sid}", headers=headers).json()["components"]}
    iid = client.post(f"/api/incidents?system={sid}", headers=headers, json={
        "origin": keys["Payment DB"], "failure_type": "SOURCE_OUTAGE",
    }).json()["id"]

    ack = client.post(f"/api/incidents/{iid}/acknowledge?system={sid}", headers=headers)
    assert ack.status_code == 200
    assert ack.json()["status"] == "acknowledged"

    res = client.post(f"/api/incidents/{iid}/resolve?system={sid}", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"
