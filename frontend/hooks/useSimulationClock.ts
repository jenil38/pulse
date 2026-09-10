"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SECONDS_PER_HOP,
  SECONDS_PER_RECOVERY_STEP,
  maxHops,
  propagationEnd,
  recoveryWindow,
  usePulse,
  type SimPhase,
} from "@/lib/store";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The Chaos Lab transport.
 *
 * One clock, measured in the engine's own simulated seconds, drives the whole
 * run: the map, the impact ledger, the consequence feed and the recovery
 * track all read the store fields this hook writes, so every surface is
 * showing the same instant by construction rather than by convention.
 *
 * WHY TWO SEGMENTS. A run has two halves separated by dead time: propagation
 * finishes after `maxHops × 180s`, but the engine does not schedule the first
 * recovery step until the failure has run for its configured duration — up to
 * 24 hours later. A single linear scrubber would therefore be mostly empty.
 * So the axis is compressed: the two halves sit side by side and the gap
 * between them is labelled with the real time it represents. Nothing is
 * invented and nothing is hidden; the axis just stops wasting space on a
 * period in which, by the engine's own account, nothing happens.
 *
 * The boundary is also a story beat. Playback stops when the blast radius
 * settles and waits to be told to recover, because "what does it cost?" and
 * "how do we get it back?" are two different questions and the user should be
 * allowed to finish reading the first.
 */

/** Simulated seconds advanced per real second at 1x. A hop takes 0.6s. */
const PACE = 300;

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export type Segment = "propagation" | "recovery";

export interface Span {
  start: number;
  end: number;
  length: number;
}

export interface PropagationSpan extends Span {
  /**
   * When the last hop lands, and where playback stops.
   *
   * The span runs one hop PAST this so the settled blast radius occupies a
   * real stretch of the axis instead of a single instant that a scrubber can
   * only hit by luck — the same beat the final recovery step gets.
   */
  settle: number;
}

export interface SimulationClock {
  /** Position in simulated seconds. */
  t: number;
  playing: boolean;
  speed: Speed;
  phase: SimPhase;
  segment: Segment;
  /** Position along the compressed axis, 0..1. */
  progress: number;

  propagation: PropagationSpan;
  /** Null for a run the engine gave no recovery plan. */
  recovery: Span | null;
  /** Real seconds skipped between the two segments; 0 when none is skipped. */
  gap: number;
  /**
   * True when the axis elides dead time between the halves. False for a short
   * failure whose recovery begins before the blast radius has even finished
   * spreading — there the timeline really is continuous, and drawing it as two
   * segments would invent a seam that is not there.
   */
  compressed: boolean;

  hops: number;
  totalHops: number;
  recoveryStep: number;
  totalRecoverySteps: number;

  /** True once the blast radius is complete and recovery has not started. */
  atSettle: boolean;
  canRecover: boolean;

  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (s: Speed) => void;
  /** Seek in simulated seconds. */
  seek: (t: number) => void;
  /** Seek along the compressed axis, 0..1. */
  seekProgress: (p: number) => void;
  /** Where a simulated second sits on the compressed axis, 0..1. */
  positionOf: (t: number) => number;
  /** Move one beat — a hop, or a recovery step. */
  step: (direction: 1 | -1) => void;
  /** Replay the failure from the injection. */
  restart: () => void;
  /** Cross the boundary and walk the recovery plan. */
  beginRecovery: () => void;
}

function phaseFor(
  t: number,
  settle: number,
  recovery: Span | null
): SimPhase {
  if (recovery) {
    if (t >= recovery.end) return "restored";
    if (t >= recovery.start) return "recovering";
  }
  return t >= settle ? "settled" : "propagating";
}

export function useSimulationClock(): SimulationClock {
  const simulation = usePulse((s) => s.simulation);
  const seekStore = usePulse((s) => s.seek);
  const setSimPhase = usePulse((s) => s.setSimPhase);
  const hops = usePulse((s) => s.propagationHops);
  const recoveryStep = usePulse((s) => s.recoveryStep);
  const phase = usePulse((s) => s.simPhase);
  const reduced = useReducedMotion();

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);

  const runId = simulation?.id ?? null;

  const { propagation, recovery, gap, compressed } = useMemo(() => {
    const settle = propagationEnd(simulation);
    const end = settle + SECONDS_PER_HOP;
    const prop: PropagationSpan = { start: 0, end, length: end, settle };
    const raw = recoveryWindow(simulation);
    if (!raw) {
      return { propagation: prop, recovery: null, gap: 0, compressed: false };
    }
    // The final step needs a beat of its own to complete, or the plan would
    // end with its last action still in flight.
    const stop = raw.end + SECONDS_PER_RECOVERY_STEP;
    return {
      propagation: prop,
      recovery: { start: raw.start, end: stop, length: stop - raw.start },
      gap: Math.max(0, raw.start - settle),
      // Only worth eliding when the halves genuinely do not touch.
      compressed: raw.start > end,
    };
  }, [simulation]);

  const total = compressed
    ? propagation.length + (recovery?.length ?? 0)
    : (recovery?.end ?? propagation.end);

  /** Axis position -> simulated seconds. */
  const fromProgress = useCallback(
    (p: number): number => {
      const v = Math.max(0, Math.min(1, p)) * total;
      if (!compressed || !recovery || v <= propagation.length) return v;
      return recovery.start + (v - propagation.length);
    },
    [compressed, propagation.length, recovery, total]
  );

  /** Simulated seconds -> axis position. */
  const toProgress = useCallback(
    (seconds: number): number => {
      if (total <= 0) return 0;
      const v =
        compressed && recovery && seconds > propagation.end
          ? propagation.length + Math.max(0, seconds - recovery.start)
          : Math.min(seconds, total);
      return Math.max(0, Math.min(1, v / total));
    },
    [compressed, propagation.end, propagation.length, recovery, total]
  );

  // A new run always starts from the injection.
  useEffect(() => {
    setT(0);
    setPlaying(false);
    setSpeed(1);
  }, [runId]);

  // The clock is the only writer of playback state, so the map can never be
  // showing a different instant from the transport under it.
  useEffect(() => {
    if (!simulation) return;
    seekStore(t);
    setSimPhase(phaseFor(t, propagation.settle, recovery));
  }, [t, simulation, seekStore, setSimPhase, propagation.settle, recovery]);

  /** Where playback must stop if it keeps running from here. */
  const stopAt = useCallback(
    (from: number): number =>
      recovery && from >= recovery.start ? recovery.end : propagation.settle,
    [propagation.settle, recovery]
  );

  const raf = useRef<number | null>(null);
  /** Wall-clock and story-clock readings taken when playback last started. */
  const anchor = useRef<{ wall: number; t: number } | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  /*
   * Playback is measured against the wall clock, never accumulated frame
   * deltas. Summing deltas ties the speed of the story to the frame rate: on a
   * machine rendering the graph at fifteen frames a second the failure would
   * spread in slow motion, and a per-frame clamp (needed so a backgrounded tab
   * does not leap) makes that worse rather than better. Anchoring to real time
   * means the frame rate decides how smooth the reveal looks and nothing else,
   * which is the only thing it should decide.
   */
  useEffect(() => {
    if (!playing || !simulation) {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      anchor.current = null;
      return;
    }

    anchor.current = { wall: performance.now(), t: tRef.current };

    const tick = (now: number) => {
      const from = anchor.current;
      if (from) {
        const elapsed = (now - from.wall) / 1000;
        setT(Math.min(from.t + elapsed * PACE * speed, stopAt(from.t)));
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      anchor.current = null;
    };
    // Re-anchoring on a speed change is what keeps the new rate from being
    // applied retroactively to time already played.
  }, [playing, simulation, speed, stopAt]);

  // Playback halts at the end of the segment it is in — which at the settle
  // boundary is the story beat, not a technicality.
  useEffect(() => {
    if (playing && t >= stopAt(t)) setPlaying(false);
  }, [playing, t, stopAt]);

  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      const ceiling = recovery ? recovery.end : propagation.end;
      setT(Math.max(0, Math.min(next, ceiling)));
    },
    [propagation.end, recovery]
  );

  const play = useCallback(() => {
    // Reduced motion keeps the information and drops the travelling: the
    // segment resolves to its finished state at once rather than animating.
    if (reduced) {
      setT((prev) => stopAt(prev));
      return;
    }
    setPlaying(true);
  }, [reduced, stopAt]);

  const pause = useCallback(() => setPlaying(false), []);

  const restart = useCallback(() => {
    // Reduced motion keeps the whole story and drops only the travelling: the
    // blast radius arrives complete instead of unfolding, and every control —
    // scrubbing, stepping, the recovery walk — still works from there.
    if (reduced) {
      setT(propagation.settle);
      return;
    }
    setT(0);
    setPlaying(true);
  }, [reduced, propagation.settle]);

  const beginRecovery = useCallback(() => {
    if (!recovery) return;
    if (reduced) {
      setT(recovery.end);
      return;
    }
    setT(recovery.start);
    setPlaying(true);
  }, [recovery, reduced]);

  const step = useCallback(
    (direction: 1 | -1) => {
      setPlaying(false);
      setT((prev) => {
        if (recovery && prev >= recovery.start) {
          const index = Math.round((prev - recovery.start) / SECONDS_PER_RECOVERY_STEP);
          const next = recovery.start + (index + direction) * SECONDS_PER_RECOVERY_STEP;
          if (next < recovery.start) return propagation.settle;
          return Math.min(next, recovery.end);
        }
        const index = Math.round(prev / SECONDS_PER_HOP);
        const next = (index + direction) * SECONDS_PER_HOP;
        if (next > propagation.settle && recovery) return recovery.start;
        return Math.max(0, Math.min(next, propagation.settle));
      });
    },
    [propagation.settle, recovery]
  );

  const segment: Segment =
    recovery && t >= recovery.start ? "recovery" : "propagation";

  return {
    t,
    playing,
    speed,
    phase,
    segment,
    progress: toProgress(t),
    propagation,
    recovery,
    gap,
    compressed,
    hops,
    totalHops: maxHops(simulation),
    recoveryStep,
    totalRecoverySteps: simulation?.recovery.length ?? 0,
    atSettle: phase === "settled",
    canRecover: !!recovery,
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    setSpeed,
    seek,
    seekProgress: (p) => seek(fromProgress(p)),
    positionOf: toProgress,
    step,
    restart,
    beginRecovery,
  };
}
