"""
PULSE — DEMO authentication.

  >>> THIS IS DEMO AUTHENTICATION, NOT PRODUCTION AUTHENTICATION <<<

It is implemented honestly rather than faked in the browser: credentials are
verified server-side, and the session token is a real HMAC-signed, expiring
token that the API validates on every protected request. What makes it a *demo*
is deliberate and documented:

  * the three seeded demo accounts share one published password
  * registered accounts live in a JSON file, not a real user store
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
from . import workspace

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

#: Accounts created through /auth/register.
#:
#: Each one gets its own random salt, unlike the seeded demo accounts, and is
#: written to the workspace file alongside the systems it owns — otherwise a
#: restart would strand a user's saved systems behind an account that no longer
#: exists. The salt and hash are persisted; the password never is.
REGISTERED_USERS: dict[str, DemoUser] = {}
_REGISTERED_SECRETS: dict[str, tuple[bytes, str]] = {}

#: A cap, so an open registration endpoint cannot be used to exhaust memory.
MAX_REGISTRATIONS = 200


def _hash_with_salt(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt, _PBKDF2_ROUNDS
    ).hex()


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def lookup_user(email: str) -> DemoUser | None:
    """Resolve an account from either the seeded set or the registered set."""
    key = email.lower()
    return DEMO_USERS.get(key) or REGISTERED_USERS.get(key)


def _dump_accounts() -> list[dict]:
    return [
        {
            "email": u.email, "name": u.name, "role": u.role,
            "initials": u.initials, "description": u.description,
            "salt": base64.b64encode(_REGISTERED_SECRETS[u.email][0]).decode(),
            "hash": _REGISTERED_SECRETS[u.email][1],
        }
        for u in REGISTERED_USERS.values()
        if u.email in _REGISTERED_SECRETS
    ]


def _load_accounts(rows: list[dict]) -> None:
    for row in rows:
        try:
            email = row["email"].lower()
            REGISTERED_USERS[email] = DemoUser(
                email=email, name=row["name"], role=row.get("role", "Operator"),
                initials=row.get("initials") or _initials(row["name"]),
                description=row.get("description", ""),
            )
            _REGISTERED_SECRETS[email] = (base64.b64decode(row["salt"]), row["hash"])
        except (KeyError, ValueError, TypeError):
            continue


workspace.register_account_persistence(_dump_accounts, _load_accounts)


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
    return lookup_user(data.get("sub", ""))


# --------------------------------------------------------------------------- #
#  Schemas
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


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
def optional_user(authorization: str | None = Header(default=None)) -> DemoUser | None:
    """Resolve the bearer token if one was sent, without demanding it.

    Routes that serve the demo to anonymous visitors *and* a private system to
    its owner depend on this: the identity decides which systems are reachable,
    but its absence is not itself an error.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return verify_token(authorization.split(" ", 1)[1].strip())


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


@router.post("/auth/register", response_model=LoginResponse, status_code=201, tags=["auth"])
def register(req: RegisterRequest):
    """
    Create a workspace account and sign straight in.

    The chosen password is salted with fresh random bytes, hashed, and checked
    on every later sign-in. The account and its hash are written to the
    workspace file so the systems it owns survive a restart.
    """
    email = req.email.lower()
    if lookup_user(email) is not None:
        raise HTTPException(409, "An account with that email already exists")
    if len(REGISTERED_USERS) >= MAX_REGISTRATIONS:
        raise HTTPException(429, "The demo has reached its account limit")

    name = " ".join(req.name.split())
    salt = os.urandom(16)
    _REGISTERED_SECRETS[email] = (salt, _hash_with_salt(req.password, salt))
    user = DemoUser(
        email=email,
        name=name,
        role="Operator",
        initials=_initials(name),
        description="Workspace account.",
    )
    REGISTERED_USERS[email] = user
    workspace.save()

    token, expires = issue_token(email)
    return LoginResponse(token=token, expires_at=expires, user=UserOut(**user.__dict__))


@router.post("/auth/login", response_model=LoginResponse, tags=["auth"])
def login(req: LoginRequest):
    email = req.email.lower()

    # Registered accounts carry their own salt; the seeded demo accounts all
    # share one published password. Both paths do the full hash before
    # deciding, so timing doesn't leak which addresses exist.
    secret = _REGISTERED_SECRETS.get(email)
    if secret is not None:
        salt, expected = secret
        ok = hmac.compare_digest(_hash_with_salt(req.password, salt), expected)
        user = REGISTERED_USERS.get(email)
    else:
        ok = hmac.compare_digest(_hash_password(req.password), _PASSWORD_HASH)
        user = DEMO_USERS.get(email)

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
