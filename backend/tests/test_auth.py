"""
Demo authentication tests.

Demo or not, the auth must actually work: wrong credentials must be rejected,
tokens must be signed and expiring, and tampering must not get you in.
"""
from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.api.auth import (  # noqa: E402
    DEMO_PASSWORD,
    DEMO_USERS,
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
