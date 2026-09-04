"""
Demo authentication tests.

Demo or not, the auth must actually work: wrong credentials must be rejected,
tokens must be signed and expiring, and tampering must not get you in.
"""
from __future__ import annotations

import os
import sys
import time

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.api.auth import (  # noqa: E402
    DEMO_PASSWORD,
    DEMO_USERS,
    MAX_REGISTRATIONS,
    REGISTERED_USERS,
    _REGISTERED_SECRETS,
    issue_token,
    verify_token,
)
from backend.app.main import app  # noqa: E402

client = TestClient(app)


def _login(email: str = "analyst@pulse.demo", password: str = DEMO_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_demo_accounts_are_published():
    r = client.get("/api/auth/demo-accounts")
    assert r.status_code == 200
    emails = {a["email"] for a in r.json()}
    assert emails == set(DEMO_USERS)
    # Every account explains what it can do.
    assert all(a["description"] for a in r.json())


def test_login_succeeds_and_returns_identity():
    r = _login()
    assert r.status_code == 200
    body = r.json()
    assert body["demo"] is True, "the API must state that this is demo auth"
    assert body["user"]["role"] == "Analyst"
    assert body["user"]["initials"] == "AO"
    assert body["token"]
    assert body["expires_at"] > time.time()


def test_every_demo_account_can_sign_in():
    for email in DEMO_USERS:
        assert _login(email).status_code == 200


def test_wrong_password_is_rejected():
    assert _login(password="not-the-password").status_code == 401


def test_unknown_user_is_rejected():
    assert _login("nobody@pulse.demo").status_code == 401


def test_malformed_email_is_a_validation_error():
    r = client.post("/api/auth/login", json={"email": "nope", "password": DEMO_PASSWORD})
    assert r.status_code == 422


def test_me_requires_a_token():
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer "}).status_code == 401
    assert (
        client.get("/api/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401
    )


def test_me_returns_the_signed_in_user():
    token = _login("operator@pulse.demo").json()["token"]
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["role"] == "Operator"


def test_tampered_token_is_rejected():
    token = _login().json()["token"]
    payload, sig = token.split(".", 1)
    # Flip the payload but keep the original signature.
    forged = f"{payload}x.{sig}"
    assert verify_token(forged) is None
    assert (
        client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code
        == 401
    )


def test_garbage_token_is_rejected():
    for bad in ["", "abc", "abc.def", "...", "a.b.c"]:
        assert verify_token(bad) is None


def test_expired_token_is_rejected(monkeypatch):
    token, _ = issue_token("analyst@pulse.demo")
    assert verify_token(token) is not None
    # Jump past the TTL.
    monkeypatch.setattr(time, "time", lambda: time.struct_time and 1e12)
    assert verify_token(token) is None


def test_logout_is_honest_about_being_stateless():
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    assert "client-side" in r.json()["detail"]


# --- Registration -----------------------------------------------------------
#
# Accounts created at runtime are not durable, but they are not fake either:
# each gets its own random salt, and the shared demo password must not open one.


@pytest.fixture(autouse=True)
def _clean_registry():
    """Registrations live in module state, so each test starts from empty."""
    REGISTERED_USERS.clear()
    _REGISTERED_SECRETS.clear()
    yield
    REGISTERED_USERS.clear()
    _REGISTERED_SECRETS.clear()


def _register(name="Ada Lovelace", email="ada@example.com", password="a-strong-passphrase"):
    return client.post(
        "/api/auth/register", json={"name": name, "email": email, "password": password}
    )


def test_registration_returns_a_usable_session():
    r = _register()
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["name"] == "Ada Lovelace"
    assert body["user"]["initials"] == "AL"
    assert body["expires_at"] > time.time()

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"


def test_registered_account_can_sign_in_again():
    _register()
    assert _login("ada@example.com", "a-strong-passphrase").status_code == 200


def test_registered_account_keeps_its_own_password():
    # The seeded accounts share a printed password; a created one must not.
    _register()
    assert _login("ada@example.com", DEMO_PASSWORD).status_code == 401


def test_email_is_matched_case_insensitively():
    _register(email="Ada@Example.com")
    assert _login("ada@example.com", "a-strong-passphrase").status_code == 200


def test_duplicate_registration_is_rejected():
    _register()
    assert _register().status_code == 409
    # Including against the seeded accounts, which must not be shadowed.
    assert _register(email="analyst@pulse.demo").status_code == 409


def test_weak_or_missing_details_are_validation_errors():
    assert _register(password="short").status_code == 422
    assert _register(name="A").status_code == 422
    assert _register(email="not-an-email").status_code == 422


def test_registration_is_capped():
    for i in range(MAX_REGISTRATIONS):
        REGISTERED_USERS[f"filler{i}@example.com"] = DEMO_USERS["analyst@pulse.demo"]
    assert _register().status_code == 429


def test_registered_accounts_are_not_published_as_demo_accounts():
    _register()
    emails = {a["email"] for a in client.get("/api/auth/demo-accounts").json()}
    assert "ada@example.com" not in emails
