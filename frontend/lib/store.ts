/** PULSE — client state (topology, selection, active simulation). */
"use client";

import { create } from "zustand";
import { api } from "./api";
import type {
  Asset,
  FailureType,
  HealthOverview,
  HealthState,
  Simulation,
  Topology,
} from "./types";

/** Playback phase of an active simulation overlay. */
export type SimPhase = "idle" | "propagating" | "settled" | "recovering";

interface PulseState {
  topology: Topology | null;
  overview: HealthOverview | null;
  loading: boolean;
  error: string | null;

  selectedId: string | null;
  hoveredId: string | null;

  simulation: Simulation | null;
  simPhase: SimPhase;
  /** How far propagation has advanced, in hops. Drives the staged reveal. */
  propagationHops: number;
  /** Assets highlighted as a lineage trace (upstream+downstream of selection). */
  tracedIds: Set<string>;

  loadTopology: () => Promise<void>;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  trace: (ids: string[]) => void;
  clearTrace: () => void;

  runSimulation: (origin: string, failure: FailureType, minutes?: number,
                  parameter?: string | null) => Promise<Simulation | null>;
  setSimulation: (sim: Simulation | null) => void;
  advancePropagation: (hops: number) => void;
  setSimPhase: (p: SimPhase) => void;
  clearSimulation: () => void;

  /** Effective health state for a node, accounting for any active simulation. */
  stateOf: (id: string) => HealthState;
  assetById: (id: string) => Asset | undefined;
}

export const usePulse = create<PulseState>((set, get) => ({
  topology: null,
  overview: null,
  loading: false,
  error: null,

  selectedId: null,
  hoveredId: null,

  simulation: null,
  simPhase: "idle",
  propagationHops: 0,
  tracedIds: new Set<string>(),

  loadTopology: async () => {
    set({ loading: true, error: null });
    try {
      const [topology, overview] = await Promise.all([
        api.topology(),
        api.healthOverview(),
      ]);
      set({ topology, overview, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
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
      set({ simulation: sim, simPhase: "propagating", propagationHops: 0 });
      return sim;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  setSimulation: (sim) =>
    set({
      simulation: sim,
      simPhase: sim ? "propagating" : "idle",
      propagationHops: 0,
    }),

  advancePropagation: (hops) => set({ propagationHops: hops }),
  setSimPhase: (p) => set({ simPhase: p }),
  clearSimulation: () =>
    set({ simulation: null, simPhase: "idle", propagationHops: 0 }),

  stateOf: (id) => {
    const { simulation, propagationHops, topology } = get();
    if (simulation) {
      const impact = simulation.blast_radius.nodes.find((n) => n.id === id);
      // Only reveal nodes the propagation wave has reached yet.
      if (impact && impact.hops <= propagationHops) return impact.state;
    }
    const asset = topology?.assets.find((a) => a.id === id);
    return asset?.health_state ?? "HEALTHY";
  },

  assetById: (id) => get().topology?.assets.find((a) => a.id === id),
}));

/** Max hop distance in the current simulation (propagation completion target). */
export function maxHops(sim: Simulation | null): number {
  if (!sim) return 0;
  return sim.blast_radius.nodes.reduce((m, n) => Math.max(m, n.hops), 0);
}
