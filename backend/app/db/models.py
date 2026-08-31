"""
PULSE — SQLAlchemy models (PostgreSQL deployment path).

The demo runs entirely in memory over the engine, so these models are not
required to use PULSE. They define the persistence schema described in
docs/DESIGN.md §E for the deployment where incidents, simulations and health
history need to survive a restart.

Every persisted telemetry row carries `simulated=True`: PULSE never stores
measurements from a real external system.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)

    systems: Mapped[list["System"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(40), default="viewer")


class System(Base):
    __tablename__ = "systems"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(120))
    domain: Mapped[str] = mapped_column(String(120), default="")

    organization: Mapped[Organization] = relationship(back_populates="systems")
    assets: Mapped[list["Asset"]] = relationship(back_populates="system")

    __table_args__ = (UniqueConstraint("org_id", "name"),)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    system_id: Mapped[int] = mapped_column(ForeignKey("systems.id"))
    key: Mapped[str] = mapped_column(String(120), unique=True)  # e.g. "fact_orders"
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(40))
    criticality: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    owner: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    health_state: Mapped[str] = mapped_column(String(20), default="HEALTHY")
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    system: Mapped[System] = relationship(back_populates="assets")


class Dependency(Base):
    __tablename__ = "dependencies"

    id: Mapped[int] = mapped_column(primary_key=True)
    upstream_asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    downstream_asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    kind: Mapped[str] = mapped_column(String(40), default="data")

    __table_args__ = (
        UniqueConstraint("upstream_asset_id", "downstream_asset_id", "kind"),
    )


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20))
    rows: Mapped[int] = mapped_column(Integer, default=0)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class HealthMetric(Base):
    __tablename__ = "health_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    freshness_seconds: Mapped[int] = mapped_column(Integer, default=0)
    row_volume: Mapped[int] = mapped_column(Integer, default=0)
    null_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    schema_version: Mapped[str] = mapped_column(String(20), default="v1")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    run_status: Mapped[str] = mapped_column(String(20), default="success")
    # Provenance: PULSE never stores real external measurements.
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class SimulationScenario(Base):
    __tablename__ = "simulation_scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(200))
    origin_asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    failure_type: Mapped[str] = mapped_column(String(40))
    params_json: Mapped[str] = mapped_column(Text, default="{}")


class Simulation(Base):
    __tablename__ = "simulations"

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int | None] = mapped_column(ForeignKey("simulation_scenarios.id"))
    origin_asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    failure_type: Mapped[str] = mapped_column(String(40))
    duration_min: Mapped[int] = mapped_column(Integer, default=30)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    result_json: Mapped[str] = mapped_column(Text, default="{}")

    events: Mapped[list["SimulationEvent"]] = relationship(back_populates="simulation")


class SimulationEvent(Base):
    __tablename__ = "simulation_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_id: Mapped[int] = mapped_column(ForeignKey("simulations.id"))
    t_seconds: Mapped[int] = mapped_column(Integer)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    label: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20))

    simulation: Mapped[Simulation] = relationship(back_populates="events")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    origin_asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    failure_type: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="open")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resilience_before: Mapped[int | None] = mapped_column(Integer)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)

    events: Mapped[list["IncidentEvent"]] = relationship(back_populates="incident")
    recovery_steps: Mapped[list["RecoveryStep"]] = relationship(back_populates="incident")


class IncidentEvent(Base):
    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"))
    t_seconds: Mapped[int] = mapped_column(Integer)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    label: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20))

    incident: Mapped[Incident] = relationship(back_populates="events")


class RecoveryStep(Base):
    __tablename__ = "recovery_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"))
    ordinal: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(Text)
    target_asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    kind: Mapped[str] = mapped_column(String(20))
    done: Mapped[bool] = mapped_column(Boolean, default=False)

    incident: Mapped[Incident] = relationship(back_populates="recovery_steps")


class BusinessConsumer(Base):
    __tablename__ = "business_consumers"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"))
    team: Mapped[str] = mapped_column(String(120))
    process: Mapped[str] = mapped_column(String(200), default="")
