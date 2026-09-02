"""
PULSE — DEMO authentication.

  >>> THIS IS DEMO AUTHENTICATION, NOT PRODUCTION AUTHENTICATION <<<

It is implemented honestly rather than faked in the browser: credentials are
verified server-side, and the session token is a real HMAC-signed, expiring
token that the API validates on every protected request. What makes it a *demo*
is deliberate and documented:

  * the user set is a fixed, seeded list — there is no registration
  * every demo account shares one published password
  * passwords are salted+hashed with PBKDF2, but the hashes are generated at
    import time from a constant, so nothing here is secret
  * SECRET_KEY defaults to a well-known development value

A production version would need a real user store, per-user password reset,
rate limiting, and rotation. None of that is claimed here.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field

from ..core.config import get_settings

router = APIRouter()
settings = get_settings()

#: The single published password for every demo account.
DEMO_PASSWORD = "pulse-demo"

TOKEN_TTL_SECONDS = 60 * 60 * 12  # 12 hours
_PBKDF2_ROUNDS = 120_000
_SALT = b"pulse-demo-salt"


def _hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), _SALT, _PBKDF2_ROUNDS
    ).hex()


@dataclass(frozen=True)
class DemoUser:
    email: str
    name: str
    role: str
    initials: str
    description: str


DEMO_USERS: dict[str, DemoUser] = {
    "analyst@pulse.demo": DemoUser(
        "analyst@pulse.demo", "Ada Okafor", "Analyst", "AO",
        "Read-only access: explore topology, inspect assets, review incidents.",
    ),
    "operator@pulse.demo": DemoUser(
        "operator@pulse.demo", "Rai Fontaine", "Operator", "RF",
        "Can run simulations in the Chaos Lab and acknowledge or resolve incidents.",
    ),
    "admin@pulse.demo": DemoUser(
        "admin@pulse.demo", "Mikael Brandt", "Admin", "MB",
        "Full access, including scenario execution and resilience configuration.",
    ),
}

#: Precomputed once — identical for every demo account by design.
_PASSWORD_HASH = _hash_password(DEMO_PASSWORD)


# --------------------------------------------------------------------------- #
#  Token handling — HMAC-signed, expiring, verified on every request
# --------------------------------------------------------------------------- #
def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def issue_token(email: str) -> tuple[str, int]:
    expires = int(time.time()) + TOKEN_TTL_SECONDS
    payload = _b64e(json.dumps({"sub": email, "exp": expires}).encode())
    sig = _b64e(
        hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).digest()
    )
    return f"{payload}.{sig}", expires


def verify_token(token: str) -> DemoUser | None:
    try:
        payload, sig = token.split(".", 1)
    except ValueError:
        return None

    expected = _b64e(
        hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).digest()
    )
    # Constant-time comparison — the habit matters even in a demo.
    if not hmac.compare_digest(sig, expected):
        return None

    try:
        data = json.loads(_b64d(payload))
    except Exception:  # noqa: BLE001
        return None

    if data.get("exp", 0) < time.time():
        return None
    return DEMO_USERS.get(data.get("sub", ""))


# --------------------------------------------------------------------------- #
#  Schemas
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserOut(BaseModel):
    email: str
    name: str
    role: str
    initials: str
    description: str


class LoginResponse(BaseModel):
    token: str
    expires_at: int
    user: UserOut
    demo: bool = True


class DemoAccountOut(BaseModel):
    email: str
    name: str
    role: str
    description: str


# --------------------------------------------------------------------------- #
#  Dependency
# --------------------------------------------------------------------------- #
def current_user(authorization: str | None = Header(default=None)) -> DemoUser:
    """Resolve the bearer token, or 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    user = verify_token(authorization.split(" ", 1)[1].strip())
    if user is None:
        raise HTTPException(401, "Session expired or invalid")
    return user


# --------------------------------------------------------------------------- #
#  Routes
# --------------------------------------------------------------------------- #
@router.get("/auth/demo-accounts", response_model=list[DemoAccountOut], tags=["auth"])
def demo_accounts():
    """The published demo accounts. Deliberately discoverable — this is a demo."""
    return [
        DemoAccountOut(email=u.email, name=u.name, role=u.role, description=u.description)
        for u in DEMO_USERS.values()
    ]


@router.post("/auth/login", response_model=LoginResponse, tags=["auth"])
def login(req: LoginRequest):
    user = DEMO_USERS.get(req.email.lower())
    submitted = _hash_password(req.password)

    # Compare regardless of whether the user exists, so timing doesn't leak
    # which addresses are valid.
    ok = hmac.compare_digest(submitted, _PASSWORD_HASH)
    if user is None or not ok:
        raise HTTPException(401, "Incorrect email or password")

    token, expires = issue_token(user.email)
    return LoginResponse(
        token=token,
        expires_at=expires,
        user=UserOut(**user.__dict__),
    )


@router.get("/auth/me", response_model=UserOut, tags=["auth"])
def me(user: DemoUser = Depends(current_user)):
    return UserOut(**user.__dict__)


@router.post("/auth/logout", tags=["auth"])
def logout():
    """
    Tokens are stateless, so logout is a client-side discard. Exposed as an
    endpoint so the frontend has one honest place to call, and so a future
    server-side revocation list has somewhere to live.
    """
    return {"ok": True, "detail": "Discard the token client-side."}
