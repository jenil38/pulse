"""
PULSE — deterministic historical telemetry.

Real observability products are full of time-series: freshness over time, volume
trends, incident frequency, reliability trends. PULSE had none, which is a large
part of why it read as a static diagram rather than an operational tool.

Everything here is SIMULATED and DETERMINISTIC. There is no randomness: values
are derived from a hash of (asset id, bucket index), so the same asset always
produces the same history, and the charts are stable across reloads. This is a
generator, not a measurement.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .graph import DependencyGraph
from .states import CRIT_WEIGHT, Criticality, HealthState, NodeType


def _noise(seed: str, i: int) -> float:
    """Stable pseudo-random value in [0, 1) for (seed, index)."""
    h = hashlib.sha256(f"{seed}:{i}".encode()).digest()
    return int.from_bytes(h[:4], "big") / 0xFFFFFFFF


def _wave(seed: str, i: int, period: int) -> float:
    """Smooth-ish deterministic oscillation in [0, 1]."""
    import math

    phase = _noise(seed, 0) * math.tau
    return (math.sin(phase + (i / period) * math.tau) + 1) / 2


@dataclass
class Point:
    t: int          # seconds before "now" (negative = past), 0 = now
    value: float


@dataclass
class AssetHistory:
    asset_id: str
    freshness: list[Point]
    volume: list[Point]
    latency: list[Point]


def asset_history(graph: DependencyGraph, asset_id: str, points: int = 48,
                  step_seconds: int = 1800) -> AssetHistory:
    """
    Per-asset freshness / volume / latency over the recent window.

    Shape is driven by the asset's real properties — a CRITICAL warehouse table
    behaves differently from a LOW raw table — so the charts stay consistent
    with everything else the UI says about that asset.
    """
    asset = graph.node(asset_id)
    crit = CRIT_WEIGHT[asset.criticality]

    # Baselines scale with node type and criticality.
    base_volume = {
        NodeType.SOURCE: 0,
        NodeType.INGESTION: 0,
        NodeType.RAW_TABLE: 120_000,
        NodeType.TRANSFORMATION: 90_000,
        NodeType.WAREHOUSE_TABLE: 240_000,
        NodeType.DATA_MODEL: 40_000,
    }.get(asset.type, 0) * (0.6 + crit * 0.2)

    base_latency = 40 + crit * 55
    base_freshness = {
        NodeType.SOURCE: 120,
        NodeType.INGESTION: 900,
        NodeType.RAW_TABLE: 1_800,
        NodeType.TRANSFORMATION: 3_600,
        NodeType.WAREHOUSE_TABLE: 7_200,
        NodeType.DATA_MODEL: 10_800,
    }.get(asset.type, 3_600)

    fresh, vol, lat = [], [], []
    for i in range(points):
        t = -(points - 1 - i) * step_seconds
        n = _noise(asset_id, i)
        w = _wave(asset_id, i, 24)

        # Freshness drifts up and resets — the sawtooth of a scheduled pipeline.
        cycle = (i % max(3, 6 - crit)) / max(3, 6 - crit)
        fresh.append(Point(t, round(base_freshness * (0.35 + cycle * 0.9 + n * 0.15), 1)))

        if base_volume:
            # Daily rhythm plus small deterministic variation.
            vol.append(Point(t, round(base_volume * (0.75 + w * 0.4 + n * 0.08))))

        lat.append(Point(t, round(base_latency * (0.8 + w * 0.35 + n * 0.25), 1)))

    return AssetHistory(asset_id=asset_id, freshness=fresh, volume=vol, latency=lat)


def health_history(graph: DependencyGraph, points: int = 48,
                   step_seconds: int = 1800) -> list[dict]:
    """
    Fleet-wide health counts over the recent window.

    Mostly healthy with occasional degradation, so the trend line has shape
    without implying the demo system is on fire.
    """
    total = len(graph.assets)
    out: list[dict] = []
    for i in range(points):
        t = -(points - 1 - i) * step_seconds
        w = _wave("fleet", i, 18)
        n = _noise("fleet", i)

        degraded = int(round(w * 3 + n * 1.5))
        stale = int(round((1 - w) * 2 + n))
        failed = 1 if (i % 17 == 0) else 0
        healthy = total - degraded - stale - failed

        out.append({
            "t": t,
            "healthy": healthy,
            "degraded": degraded,
            "stale": stale,
            "failed": failed,
            "recovering": 0,
        })
    return out


def resilience_history(points: int = 30, step_seconds: int = 86400,
                       current: int = 65) -> list[Point]:
    """
    Daily resilience score, ending at today's real computed value.

    The series converges on `current` so the chart never contradicts the score
    displayed beside it.
    """
    out: list[Point] = []
    for i in range(points):
        t = -(points - 1 - i) * step_seconds
        # Blend a wandering baseline toward the true current score.
        drift = (_wave("resilience", i, 11) - 0.5) * 9
        pull = i / max(points - 1, 1)
        value = (current + drift) * (1 - pull) + current * pull
        out.append(Point(t, round(max(0, min(100, value)))))
    out[-1] = Point(0, float(current))
    return out


def incident_history(days: int = 30) -> list[dict]:
    """Incident counts per day — the frequency chart every ops tool has."""
    out = []
    for i in range(days):
        t = -(days - 1 - i) * 86400
        n = _noise("incidents", i)
        count = 0 if n < 0.55 else (1 if n < 0.87 else 2)
        out.append({"t": t, "count": count})
    return out
