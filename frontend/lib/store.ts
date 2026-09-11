/** PULSE: client state (topology, selection, filters, active simulation). */
"use client";

import { create } from "zustand";
import { api } from "./api";
import type {
  Asset,
  FailureType,
  HealthOverview,
  HealthState,
  NodeImpact,
  RecoveryStep,
  Simulation,
  Topology,
} from "./types";

/**
 * Playback phase of an active simulation overlay.
 *
 * The story the Chaos Lab tells runs through these in order: the failure
 * spreads (`propagating`), stops (`settled`), the recovery plan is walked
 * (`recovering`), and the system is whole again (`restored`). Every other
 * surface only ever sees `propagating`/`settled`, exactly as before.
 */
export type SimPhase =
  | "idle"
  | "propagating"
  | "settled"
  | "recovering"
  | "restored";

interface PulseState {
  topology: Topology | null;
  overview: HealthOverview | null;
  loading: boolean;
  error: unknown;

  selectedId: string | null;
  hoveredId: string | null;
  /**
   * The component a failure is currently aimed at, before one is run.
   *
   * Distinct from `selectedId` on purpose. Selecting a node also tells the
   * camera to look at it, which is right when you click something on the map
   * and wrong when you pick a target from a list, there the view should hold
   * still and the node should simply be marked. Once a run starts, the
   * simulation's own origin takes over this role.
   */
  aimedId: string | null;
  systemFilter: string | null;
  query: string;

  simulation: Simulation | null;
  simPhase: SimPhase;
  /** How far propagation has advanced, in hops. Drives the staged reveal. */
  propagationHops: number;
  /**
   * Recovery steps COMPLETED, counted against the engine's own plan.
   *
   * Zero while the failure is spreading or settled. Walking it upward returns
   * assets to health in the plan's order, which is the reverse of the order
   * they broke in, the point the recovery playback exists to make.
   */
  recoveryStep: number;
  /** Assets highlighted as a lineage trace (upstream+downstream of selection). */
  tracedIds: Set<string>;

  loadTopology: () => Promise<void>;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  aim: (id: string | null) => void;
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
   * is a Chaos Lab affordance, it explains propagation while you watch it.
   * Everywhere else (scenario runs, deep links) the result should already be
   * complete, otherwise the summary counts under-report the real impact.
   */
  setSimulation: (sim: Simulation | null, immediate?: boolean) => void;
  advancePropagation: (hops: number) => void;
  setSimPhase: (p: SimPhase) => void;
  /** Recovery steps completed so far. */
  setRecoveryStep: (n: number) => void;
  /**
   * Move the whole run to `t` simulated seconds.
   *
   * Both the propagation front and the recovery progress are derived from the
   * engine's own event cadence, so a scrubbed frame can never disagree with
   * the timeline being scrubbed.
   */
  seek: (t: number) => void;
  clearSimulation: () => void;

  /** Effective health state for a node, accounting for any active simulation. */
  stateOf: (id: string) => HealthState;
  /**
   * Has the run reached this node yet?
   *
   * True for anything the propagation wave has touched, and for everything
   * once recovery has begun, the map dims what the story has not reached,
   * and by recovery time the story has reached all of it.
   */
  isRevealed: (id: string) => boolean;
  /** The recovery step being performed right now, or null. */
  activeRecoveryStep: () => RecoveryStep | null;
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
  /** Asset id -> the recovery step that returns it to health. */
  _recoveryIndex: Map<string, number>;
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

/**
 * Asset id -> the recovery step after which it is healthy again.
 *
 * The engine's plan names a target for every step that has one; teams and
 * business processes never do, because nothing is "rebuilt" about them, they
 * are whole again when the incident is resolved, which is the final step. So
 * anything absent from this map recovers last, and `recoveryOrderOf` says so
 * rather than leaving those nodes broken forever.
 */
function indexRecovery(sim: Simulation | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const step of sim?.recovery ?? []) {
    if (step.target_id) m.set(step.target_id, step.order);
  }
  return m;
}

export const usePulse = create<PulseState>((set, get) => ({
  topology: null,
  overview: null,
  loading: false,
  error: null,

  selectedId: null,
  hoveredId: null,
  aimedId: null,
  systemFilter: null,
  query: "",

  simulation: null,
  simPhase: "idle",
  propagationHops: 0,
  recoveryStep: 0,
  tracedIds: new Set<string>(),
  _assetIndex: new Map<string, Asset>(),
  _impactIndex: new Map<string, NodeImpact>(),
  _recoveryIndex: new Map<string, number>(),

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
  aim: (id) => set({ aimedId: id }),
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
        recoveryStep: 0,
        _impactIndex: indexImpacts(sim),
        _recoveryIndex: indexRecovery(sim),
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
      recoveryStep: 0,
      _impactIndex: indexImpacts(sim),
      _recoveryIndex: indexRecovery(sim),
    }),

  advancePropagation: (hops) => set({ propagationHops: hops }),
  setSimPhase: (p) => set({ simPhase: p }),
  setRecoveryStep: (n) => {
    const { simulation } = get();
    const total = simulation?.recovery.length ?? 0;
    set({ recoveryStep: Math.max(0, Math.min(n, total)) });
  },

  seek: (t) => {
    const { simulation } = get();
    if (!simulation) return;
    const window = recoveryWindow(simulation);
    const hops = Math.min(
      Math.floor(Math.max(t, 0) / SECONDS_PER_HOP),
      maxHops(simulation)
    );
    // Before the first recovery event nothing has been restored; after it,
    // one step completes every SECONDS_PER_RECOVERY_STEP.
    const done =
      window === null || t < window.start
        ? 0
        : Math.min(
            Math.floor((t - window.start) / SECONDS_PER_RECOVERY_STEP),
            simulation.recovery.length
          );
    set({
      // Recovery only ever runs after the blast radius is complete, so the
      // propagation front cannot retreat once the plan has started.
      propagationHops: done > 0 ? maxHops(simulation) : hops,
      recoveryStep: done,
    });
  },

  clearSimulation: () =>
    set({
      simulation: null,
      simPhase: "idle",
      propagationHops: 0,
      recoveryStep: 0,
      _impactIndex: new Map(),
      _recoveryIndex: new Map(),
    }),

  stateOf: (id) => {
    const {
      simulation,
      simPhase,
      propagationHops,
      recoveryStep,
      _impactIndex,
      _assetIndex,
      _recoveryIndex,
    } = get();
    const baseline = _assetIndex.get(id)?.health_state ?? "HEALTHY";
    if (!simulation) return baseline;

    const impact = _impactIndex.get(id);
    if (!impact) return baseline;

    // Recovery reads the engine's plan rather than the blast radius: an asset
    // is broken until the step that repairs it runs, RECOVERING while that
    // step is in flight, and healthy afterwards.
    if (recoveryStep > 0 || simPhase === "recovering") {
      const order = _recoveryIndex.get(id) ?? simulation.recovery.length;
      if (recoveryStep >= order) return "HEALTHY";
      if (recoveryStep + 1 === order) return "RECOVERING";
      return impact.state;
    }

    // Only reveal nodes the propagation wave has reached yet.
    if (impact.hops <= propagationHops) return impact.state;
    return baseline;
  },

  isRevealed: (id) => {
    const { simulation, simPhase, propagationHops, recoveryStep, _impactIndex } =
      get();
    if (!simulation) return true;
    const impact = _impactIndex.get(id);
    if (!impact) return false;
    if (recoveryStep > 0 || simPhase === "recovering") return true;
    return impact.hops <= propagationHops;
  },

  activeRecoveryStep: () => {
    const { simulation, simPhase, recoveryStep } = get();
    if (!simulation || simPhase !== "recovering") return null;
    return simulation.recovery[recoveryStep] ?? null;
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
    const { simulation, isRevealed, stateOf } = get();
    if (!simulation) return 0;
    // Counts what is broken *now*, so the figure climbs as the failure spreads
    // and falls again as the recovery plan repairs each asset.
    return simulation.blast_radius.nodes.filter(
      (n) =>
        n.id !== simulation.origin &&
        isRevealed(n.id) &&
        stateOf(n.id) !== "HEALTHY"
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

/**
 * The engine's own cadence, mirrored so playback and the timeline agree.
 * See `backend/app/engine/simulation.py`: a hop of propagation is 180
 * simulated seconds, and a recovery step is 300.
 */
export const SECONDS_PER_HOP = 180;
export const SECONDS_PER_RECOVERY_STEP = 300;

/** Simulated second at which the blast radius is complete. */
export function propagationEnd(sim: Simulation | null): number {
  return maxHops(sim) * SECONDS_PER_HOP;
}

/**
 * The recovery half of the timeline, read from the events themselves.
 *
 * Recovery does not begin until the failure has run for its configured
 * duration, so this window starts far after propagation ends, the gap is real
 * elapsed time, and the transport shows it as a gap rather than pretending the
 * two phases are adjacent.
 */
export function recoveryWindow(
  sim: Simulation | null
): { start: number; end: number } | null {
  if (!sim || sim.recovery.length === 0) return null;
  const ts = sim.timeline
    .filter((e) => e.kind === "recover" || e.kind === "resolve")
    .map((e) => e.t);
  if (ts.length === 0) return null;
  return { start: Math.min(...ts), end: Math.max(...ts) };
}
