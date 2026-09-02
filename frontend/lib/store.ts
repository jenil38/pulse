/** PULSE — client state (topology, selection, filters, active simulation). */
"use client";

import { create } from "zustand";
import { api } from "./api";
import type {
  Asset,
  FailureType,
  HealthOverview,
  HealthState,
  NodeImpact,
  Simulation,
  Topology,
} from "./types";

/** Playback phase of an active simulation overlay. */
export type SimPhase = "idle" | "propagating" | "settled" | "recovering";

interface PulseState {
  topology: Topology | null;
  overview: HealthOverview | null;
  loading: boolean;
  error: unknown;

  selectedId: string | null;
  hoveredId: string | null;
  systemFilter: string | null;
  query: string;

  simulation: Simulation | null;
  simPhase: SimPhase;
  /** How far propagation has advanced, in hops. Drives the staged reveal. */
  propagationHops: number;
  /** Assets highlighted as a lineage trace (upstream+downstream of selection). */
  tracedIds: Set<string>;

  loadTopology: () => Promise<void>;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setSystemFilter: (s: string | null) => void;
  setQuery: (q: string) => void;
  trace: (ids: string[]) => void;
  clearTrace: () => void;

  runSimulation: (
    origin: string,
    failure: FailureType,
    minutes?: number,
    parameter?: string | null
  ) => Promise<Simulation | null>;
  /**
   * Load a simulation into the shared state.
   *
   * `immediate` reveals the whole blast radius at once. The hop-by-hop reveal
   * is a Chaos Lab affordance — it explains propagation while you watch it.
   * Everywhere else (scenario runs, deep links) the result should already be
   * complete, otherwise the summary counts under-report the real impact.
   */
  setSimulation: (sim: Simulation | null, immediate?: boolean) => void;
  advancePropagation: (hops: number) => void;
  setSimPhase: (p: SimPhase) => void;
  clearSimulation: () => void;

  /** Effective health state for a node, accounting for any active simulation. */
  stateOf: (id: string) => HealthState;
  assetById: (id: string) => Asset | undefined;
  /** Assets after the current system/query filters. */
  visibleAssets: () => Asset[];
  /**
   * THE source of truth for health counts.
   *
   * Derived from `stateOf`, so it automatically reflects an active simulation
   * (including how far propagation has advanced) rather than the baseline the
   * API reported at load. Toolbar, sidebar, mobile header and any summary all
   * read this, so they can never disagree with the topology.
   */
  healthCounts: () => Record<HealthState, number>;
  /** Assets impacted by the currently-revealed portion of a simulation. */
  impactedCount: () => number;

  /**
   * Lookup indexes, rebuilt whenever the topology or simulation changes.
   * These are read on every animation frame (camera focus, particle flow), so
   * they must not be linear scans.
   */
  _assetIndex: Map<string, Asset>;
  _impactIndex: Map<string, NodeImpact>;
}

function indexAssets(t: Topology | null): Map<string, Asset> {
  const m = new Map<string, Asset>();
  for (const a of t?.assets ?? []) m.set(a.id, a);
  return m;
}

function indexImpacts(sim: Simulation | null): Map<string, NodeImpact> {
  const m = new Map<string, NodeImpact>();
  for (const n of sim?.blast_radius.nodes ?? []) m.set(n.id, n);
  return m;
}

export const usePulse = create<PulseState>((set, get) => ({
  topology: null,
  overview: null,
  loading: false,
  error: null,

  selectedId: null,
  hoveredId: null,
  systemFilter: null,
  query: "",

  simulation: null,
  simPhase: "idle",
  propagationHops: 0,
  tracedIds: new Set<string>(),
  _assetIndex: new Map<string, Asset>(),
  _impactIndex: new Map<string, NodeImpact>(),

  loadTopology: async () => {
    set({ loading: true, error: null });
    try {
      const [topology, overview] = await Promise.all([
        api.topology(),
        api.healthOverview(),
      ]);
      set({
        topology,
        overview,
        loading: false,
        _assetIndex: indexAssets(topology),
      });
    } catch (e) {
      // Keep the ApiError itself so the UI can distinguish network from auth.
      set({ error: e, loading: false });
    }
  },

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setSystemFilter: (s) => set({ systemFilter: s }),
  setQuery: (q) => set({ query: q }),
  trace: (ids) => set({ tracedIds: new Set(ids) }),
  clearTrace: () => set({ tracedIds: new Set<string>() }),

  runSimulation: async (origin, failure, minutes = 30, parameter = null) => {
    try {
      const sim = await api.simulate({
        origin,
        failure_type: failure,
        duration_minutes: minutes,
        parameter,
      });
      set({
        simulation: sim,
        simPhase: "propagating",
        propagationHops: 0,
        _impactIndex: indexImpacts(sim),
      });
      return sim;
    } catch (e) {
      set({ error: e });
      return null;
    }
  },

  setSimulation: (sim, immediate = false) =>
    set({
      simulation: sim,
      simPhase: sim ? (immediate ? "settled" : "propagating") : "idle",
      propagationHops: sim && immediate ? maxHops(sim) : 0,
      _impactIndex: indexImpacts(sim),
    }),

  advancePropagation: (hops) => set({ propagationHops: hops }),
  setSimPhase: (p) => set({ simPhase: p }),
  clearSimulation: () =>
    set({
      simulation: null,
      simPhase: "idle",
      propagationHops: 0,
      _impactIndex: new Map(),
    }),

  stateOf: (id) => {
    const { simulation, propagationHops, _impactIndex, _assetIndex } = get();
    if (simulation) {
      const impact = _impactIndex.get(id);
      // Only reveal nodes the propagation wave has reached yet.
      if (impact && impact.hops <= propagationHops) return impact.state;
    }
    return _assetIndex.get(id)?.health_state ?? "HEALTHY";
  },

  assetById: (id) => get()._assetIndex.get(id),

  healthCounts: () => {
    const { topology, stateOf } = get();
    const counts: Record<HealthState, number> = {
      HEALTHY: 0,
      RECOVERING: 0,
      STALE: 0,
      DEGRADED: 0,
      FAILED: 0,
    };
    for (const a of topology?.assets ?? []) counts[stateOf(a.id)] += 1;
    return counts;
  },

  impactedCount: () => {
    const { simulation, propagationHops } = get();
    if (!simulation) return 0;
    return simulation.blast_radius.nodes.filter(
      (n) => n.id !== simulation.origin && n.hops <= propagationHops
    ).length;
  },

  visibleAssets: () => {
    const { topology, systemFilter, query } = get();
    const q = query.trim().toLowerCase();
    return (topology?.assets ?? []).filter((a) => {
      if (systemFilter && a.system !== systemFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.owner.toLowerCase().includes(q)
      );
    });
  },
}));

/** Max hop distance in the current simulation (propagation completion target). */
export function maxHops(sim: Simulation | null): number {
  if (!sim) return 0;
  return sim.blast_radius.nodes.reduce((m, n) => Math.max(m, n.hops), 0);
}
