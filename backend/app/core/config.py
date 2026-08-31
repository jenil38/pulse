"""PULSE — application settings."""
from __future__ import annotations

import os
from functools import lru_cache


class Settings:
    """Environment-driven settings.

    Defaults are chosen so the API runs with zero setup (SQLite) while still
    supporting PostgreSQL via DATABASE_URL in Docker/CI.
    """

    app_name: str = "PULSE API"
    version: str = "0.1.0"
    # SIMULATION / DEMO telemetry — never real external monitoring.
    demo_mode: bool = True

    def __init__(self) -> None:
        self.database_url: str = os.getenv(
            "DATABASE_URL", "sqlite:///./pulse.db")
        self.cors_origins: list[str] = os.getenv(
            "CORS_ORIGINS", "http://localhost:3000").split(",")
        self.secret_key: str = os.getenv("SECRET_KEY", "pulse-dev-secret-not-for-production")
        self.demo_org: str = os.getenv("DEMO_ORG", "NOVA COMMERCE")


@lru_cache
def get_settings() -> Settings:
    return Settings()
