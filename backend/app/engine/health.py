"""
PULSE — health telemetry simulator.

  >>> SIMULATION / DEMO DATA <<<

PULSE does not monitor any real external system. This module generates
*plausible, deterministic* telemetry for the Nova Commerce demo topology so the
Control Room has something honest to render. Every payload it produces is tagged
`"source": "SIMULATED"`.

Determinism: values are derived from a stable hash of (asset_id, bucket) where
bucket advances on a fixed interval. So the numbers drift gently over time (the
UI feels alive) but any given minute is reproducible and testable.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field

from .graph import DependencyGraph
from .states import CONSUMER_TYPES, Criticality, HealthState, NodeType

TELEMETRY_SOURCE = "SIMULATED"
_BUCKET_SECONDS = 30  # telemetry refresh cadence


def _unit(asset_id: str, salt: str, bucket: int) -> float:
    """Deterministic float in [0,1) from asset + salt + time bucket."""
    h = hashlib.sha256(f"{asset_id}|{salt}|{bucket}".encode()).digest()
    return int.from_bytes(h[:6], "big") / float(1 << 48)


def _bucket(now: float | None = None) -> int:
    return int((now if now is not None else time.time()) // _BUCKET_SECONDS)


# Baseline freshness expectations per node type (seconds).
_FRESHNESS_TARGET = {
    NodeType.SOURCE: 300,
    NodeType.INGESTION: 900,
    NodeType.RAW_TABLE: 1800,
    NodeType.TRANSFORMATION: 3600,
    NodeType.WAREHOUSE_TABLE: 7200,
    NodeType.DATA_MODEL: 7200,
    NodeType.DASHBOARD: 7200,
    NodeType.ML_MODEL: 86400,
    NodeType.BUSINESS_PROCESS: 86400,
    NodeType.TEAM: 86400,
}

_VOLUME_BASE = {
    NodeType.SOURCE: 42000,
    NodeType.INGESTION: 42000,
    NodeType.RAW_TABLE: 41800,
    NodeType.TRANSFORMATION: 41500,
    NodeType.WAREHOUSE_TABLE: 41500,
    NodeType.DATA_MODEL: 900,
    NodeType.DASHBOARD: 0,
    NodeType.ML_MODEL: 0,
    NodeType.BUSINESS_PROCESS: 0,
    NodeType.TEAM: 0,
}


@dataclass
class HealthMetric:
    asset_id: str
    state: HealthState
    freshness_seconds: int
    freshness_target: int
    row_volume: int
    volume_delta_pct: float
    null_ratio: float
    schema_version: str
    latency_ms: int
    last_run_status: str
    last_updated_iso: str
    source: str = TELEMETRY_SOURCE


# A small, fixed set of demo assets that sit in a non-healthy baseline so the
# Control Room isn't uniformly green on first load. Deliberately hand-picked
# (not random) so screenshots and tests are stable.
BASELINE_DEGRADED: dict[str, HealthState] = {
    "src_inventory": HealthState.STALE,     # nightly snapshot running late
    "ing_inventory": HealthState.STALE,
    "stg_marketing": HealthState.DEGRADED,  # known null issue in channel field
}


def _state_for(asset_id: str, node_type: NodeType) -> HealthState:
    return BASELINE_DEGRADED.get(asset_id, HealthState.HEALTHY)


def snapshot(graph: DependencyGraph, now: float | None = None) -> dict[str, HealthMetric]:
    """Deterministic telemetry for every asset in the graph."""
    b = _bucket(now)
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now if now else time.time()))
    out: dict[str, HealthMetric] = {}

    for aid, asset in graph.assets.items():
        state = _state_for(aid, asset.type)
        target = _FRESHNESS_TARGET[asset.type]

        # Freshness: healthy sits well inside target; stale exceeds it.
        jitter = _unit(aid, "fresh", b)
        if state is HealthState.STALE:
            freshness = int(target * (1.6 + jitter * 0.8))
        elif state is HealthState.DEGRADED:
            freshness = int(target * (0.7 + jitter * 0.4))
        else:
            freshness = int(target * (0.15 + jitter * 0.45))

        base_vol = _VOLUME_BASE[asset.type]
        vol_jitter = (_unit(aid, "vol", b) - 0.5) * 0.08          # +-4%
        volume = int(base_vol * (1 + vol_jitter)) if base_vol else 0
        delta = round(vol_jitter * 100, 1)

        if state is HealthState.DEGRADED:
            null_ratio = round(0.04 + _unit(aid, "null", b) * 0.18, 4)
        else:
            null_ratio = round(_unit(aid, "null", b) * 0.006, 4)

        latency = int(40 + _unit(aid, "lat", b) * 220)
        if asset.type is NodeType.SOURCE:
            latency = int(80 + _unit(aid, "lat", b) * 400)

        run_status = {
            HealthState.HEALTHY: "success",
            HealthState.STALE: "late",
            HealthState.DEGRADED: "warn",
            HealthState.FAILED: "error",
            HealthState.RECOVERING: "running",
        }[state]

        out[aid] = HealthMetric(
            asset_id=aid,
            state=state,
            freshness_seconds=freshness,
            freshness_target=target,
            row_volume=volume,
            volume_delta_pct=delta,
            null_ratio=null_ratio,
            schema_version=f"v{1 + (hash(aid) % 3)}",
            latency_ms=latency,
            last_run_status=run_status,
            last_updated_iso=ts,
        )
    return out


def rollup(metrics: dict[str, HealthMetric]) -> dict[str, int]:
    """Count assets per health state."""
    counts = {s.value: 0 for s in HealthState}
    for m in metrics.values():
        counts[m.state.value] += 1
    return counts
