"""PULSE deterministic failure-simulation engine."""
from .blast_radius import BlastRadius, NodeImpact, compute_blast_radius
from .graph import Asset, Dependency, DependencyGraph
from .recovery import RecoveryStep, generate_recovery_plan
from .resilience import ResilienceScore, compute_resilience, find_spofs
from .scenarios import DEMO_SCENARIOS, ScenarioComparison, compare, run_scenario
from .simulation import SimulationResult, TimelineEvent, run_simulation
from .states import (
    Criticality,
    FailureType,
    HealthState,
    ImpactSeverity,
    NodeType,
    PropagationMode,
)
from .topology import ORGANIZATION, build_topology

__all__ = [
    "BlastRadius", "NodeImpact", "compute_blast_radius",
    "Asset", "Dependency", "DependencyGraph",
    "RecoveryStep", "generate_recovery_plan",
    "ResilienceScore", "compute_resilience", "find_spofs",
    "DEMO_SCENARIOS", "ScenarioComparison", "compare", "run_scenario",
    "SimulationResult", "TimelineEvent", "run_simulation",
    "Criticality", "FailureType", "HealthState", "ImpactSeverity",
    "NodeType", "PropagationMode",
    "ORGANIZATION", "build_topology",
]
