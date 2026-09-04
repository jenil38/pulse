"""
PULSE — FastAPI application.

  Data Resilience Digital Twin — "See failure before it spreads."

NOTE: all telemetry served by this API is SIMULATION / DEMO data generated from
a synthetic topology (NOVA COMMERCE). PULSE does not monitor any real external
system, and simulations never mutate real data.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import workspace
from .api.auth import router as auth_router
from .api.routes import router
from .api.systems import router as workspace_router
from .core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "Data Resilience Digital Twin. Model a data system as a dependency "
        "graph, simulate failures, and compute deterministic blast radius, "
        "recovery plans and resilience scores. All telemetry is SIMULATED."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(workspace_router, prefix="/api")
app.include_router(router, prefix="/api")

# Accounts and the systems they own are restored together, once, at boot. The
# demo system is rebuilt from code instead — it is never persisted, so it can
# never drift from what the repository says it is.
workspace.load()


@app.get("/", tags=["meta"])
def root():
    return {
        "product": "PULSE",
        "positioning": "Data Resilience Digital Twin",
        "tagline": "See failure before it spreads.",
        "telemetry_source": "SIMULATED",
        "docs": "/docs",
    }
