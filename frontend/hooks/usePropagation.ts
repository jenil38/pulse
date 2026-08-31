"use client";

import { useEffect } from "react";
import { maxHops, usePulse } from "@/lib/store";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Drives the staged failure-propagation reveal.
 *
 * The blast radius is computed deterministically on the server; this only
 * controls *when* each hop becomes visible, so the user can watch the failure
 * travel outward one dependency at a time (DESIGN.md §21).
 */
const HOP_INTERVAL_MS = 620;

export function usePropagation() {
  const simulation = usePulse((s) => s.simulation);
  const simPhase = usePulse((s) => s.simPhase);
  const propagationHops = usePulse((s) => s.propagationHops);
  const advance = usePulse((s) => s.advancePropagation);
  const setPhase = usePulse((s) => s.setSimPhase);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!simulation || simPhase !== "propagating") return;
    const max = maxHops(simulation);

    // Reduced motion: reveal the full blast radius immediately.
    if (reduced) {
      advance(max);
      setPhase("settled");
      return;
    }

    if (propagationHops >= max) {
      setPhase("settled");
      return;
    }

    const id = setTimeout(() => advance(propagationHops + 1), HOP_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [simulation, simPhase, propagationHops, advance, setPhase, reduced]);

  return {
    simulation,
    phase: simPhase,
    hops: propagationHops,
    maxHops: maxHops(simulation),
    progress: simulation ? propagationHops / Math.max(maxHops(simulation), 1) : 0,
  };
}
