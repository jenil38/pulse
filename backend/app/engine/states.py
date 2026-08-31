"""
PULSE — core state & failure taxonomy.

Everything the failure-simulation engine reasons about is deterministic and
declared here: node types, health states, criticality weights, the catalogue of
failure types, and the *propagation mode* each failure type induces.

There is no ML, no probability, no randomness in this module. Given the same
topology + failure input, the engine always produces the same blast radius.
"""
from __future__ import annotations

from enum import Enum


class NodeType(str, Enum):
    """The kinds of node a data system is modelled from."""
    SOURCE = "SOURCE"                    # external system of record (API / DB)
    INGESTION = "INGESTION"              # extract/load job pulling a source in
    RAW_TABLE = "RAW_TABLE"             # landed, untransformed data
    TRANSFORMATION = "TRANSFORMATION"    # staging / cleaning model (dbt-style)
    WAREHOUSE_TABLE = "WAREHOUSE_TABLE"  # conformed fact / dimension
    DATA_MODEL = "DATA_MODEL"            # business-level metric model
    DASHBOARD = "DASHBOARD"              # BI surface a human trusts
    ML_MODEL = "ML_MODEL"                # model consuming warehouse data
    BUSINESS_PROCESS = "BUSINESS_PROCESS"  # a decision/process fed by data
    TEAM = "TEAM"                        # human consumer / owner


# Nodes that hold or move data (state degrades along the pipe).
DATA_ASSET_TYPES = frozenset({
    NodeType.INGESTION,
    NodeType.RAW_TABLE,
    NodeType.TRANSFORMATION,
    NodeType.WAREHOUSE_TABLE,
    NodeType.DATA_MODEL,
})

# Nodes that *consume* data and become untrustworthy rather than "failed".
CONSUMER_TYPES = frozenset({NodeType.DASHBOARD, NodeType.ML_MODEL})

# Human / process anchors — impacted, not technically failed.
IMPACT_TYPES = frozenset({NodeType.BUSINESS_PROCESS, NodeType.TEAM})


class HealthState(str, Enum):
    HEALTHY = "HEALTHY"
    RECOVERING = "RECOVERING"
    STALE = "STALE"          # data present but not refreshing
    DEGRADED = "DEGRADED"    # data present but wrong / untrustworthy
    FAILED = "FAILED"        # no usable data


# Ordinal severity so we can take the "worst incoming" state deterministically.
SEVERITY_RANK = {
    HealthState.HEALTHY: 0,
    HealthState.RECOVERING: 1,
    HealthState.STALE: 2,
    HealthState.DEGRADED: 3,
    HealthState.FAILED: 4,
}


class Criticality(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


CRIT_WEIGHT = {
    Criticality.LOW: 1,
    Criticality.MEDIUM: 2,
    Criticality.HIGH: 3,
    Criticality.CRITICAL: 5,
}


class FailureType(str, Enum):
    SOURCE_OUTAGE = "SOURCE_OUTAGE"
    SCHEMA_DRIFT = "SCHEMA_DRIFT"
    STALE_DATA = "STALE_DATA"
    VOLUME_DROP = "VOLUME_DROP"
    NULL_SPIKE = "NULL_SPIKE"
    DUPLICATE_SPIKE = "DUPLICATE_SPIKE"
    TRANSFORMATION_FAILURE = "TRANSFORMATION_FAILURE"
    WAREHOUSE_DELAY = "WAREHOUSE_DELAY"
    API_LATENCY = "API_LATENCY"
    DATATYPE_CHANGE = "DATATYPE_CHANGE"


class PropagationMode(str, Enum):
    """How a failure *feels* to everything downstream."""
    STARVE = "STARVE"    # no fresh data arrives  -> downstream goes STALE
    BREAK = "BREAK"      # structure/parsing fails -> downstream FAILED/DEGRADED
    CORRUPT = "CORRUPT"  # wrong values flow through -> downstream DEGRADED


# Each failure type maps to exactly one propagation mode. This is the single
# most important design decision in the engine and is intentionally explicit.
FAILURE_MODE = {
    FailureType.SOURCE_OUTAGE: PropagationMode.STARVE,
    FailureType.API_LATENCY: PropagationMode.STARVE,
    FailureType.WAREHOUSE_DELAY: PropagationMode.STARVE,
    FailureType.STALE_DATA: PropagationMode.STARVE,
    FailureType.SCHEMA_DRIFT: PropagationMode.BREAK,
    FailureType.TRANSFORMATION_FAILURE: PropagationMode.BREAK,
    FailureType.DATATYPE_CHANGE: PropagationMode.BREAK,
    FailureType.NULL_SPIKE: PropagationMode.CORRUPT,
    FailureType.DUPLICATE_SPIKE: PropagationMode.CORRUPT,
    FailureType.VOLUME_DROP: PropagationMode.CORRUPT,
}

# The state the *origin* node itself takes when the failure is injected.
ORIGIN_STATE = {
    FailureType.SOURCE_OUTAGE: HealthState.FAILED,
    FailureType.TRANSFORMATION_FAILURE: HealthState.FAILED,
    FailureType.SCHEMA_DRIFT: HealthState.FAILED,
    FailureType.DATATYPE_CHANGE: HealthState.DEGRADED,
    FailureType.NULL_SPIKE: HealthState.DEGRADED,
    FailureType.DUPLICATE_SPIKE: HealthState.DEGRADED,
    FailureType.VOLUME_DROP: HealthState.DEGRADED,
    FailureType.API_LATENCY: HealthState.DEGRADED,
    FailureType.STALE_DATA: HealthState.STALE,
    FailureType.WAREHOUSE_DELAY: HealthState.STALE,
}

# Human-readable one-liners used by the recovery planner & UI.
FAILURE_LABEL = {
    FailureType.SOURCE_OUTAGE: "Source outage",
    FailureType.SCHEMA_DRIFT: "Schema drift",
    FailureType.STALE_DATA: "Stale data",
    FailureType.VOLUME_DROP: "Volume drop",
    FailureType.NULL_SPIKE: "Null spike",
    FailureType.DUPLICATE_SPIKE: "Duplicate spike",
    FailureType.TRANSFORMATION_FAILURE: "Transformation failure",
    FailureType.WAREHOUSE_DELAY: "Warehouse delay",
    FailureType.API_LATENCY: "API latency",
    FailureType.DATATYPE_CHANGE: "Unexpected datatype change",
}


class ImpactSeverity(str, Enum):
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


IMPACT_RANK = {
    ImpactSeverity.NONE: 0,
    ImpactSeverity.LOW: 1,
    ImpactSeverity.MEDIUM: 2,
    ImpactSeverity.HIGH: 3,
    ImpactSeverity.CRITICAL: 4,
}
