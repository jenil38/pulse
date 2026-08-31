"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import type { HealthState, Simulation, Topology } from "@/lib/types";
import { SceneChrome, SceneOverlay } from "@/components/marketing/SceneOverlay";
import { STORY_ORIGIN } from "@/components/marketing/CinematicScene";
import { MobileStory } from "@/components/marketing/MobileStory";

const CinematicScene = dynamic(
  () => import("@/components/marketing/CinematicScene").then((m) => m.CinematicScene),
  { ssr: false }
);

/**
 * PULSE landing — a scroll-driven film about one data system failing and
 * recovering. The blast radius shown is the REAL engine output for a Payments
 * source outage, not a scripted animation.
 */
export default function Landing() {
  const { progress, ref } = useScrollProgress();
  const reduced = useReducedMotion();
  const [topology, setTopology] = useState<Topology | null>(null);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);

  // Keep a ref of progress so the render loop reads it without re-rendering R3F.
  const progressRef = useRef(0);
  progressRef.current = progress;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const set = () => setIsDesktop(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    api.topology().then(setTopology).catch(() => setTopology(null));
    api
      .simulate({ origin: STORY_ORIGIN, failure_type: "SOURCE_OUTAGE", duration_minutes: 30 })
      .then(setSim)
      .catch(() => setSim(null));
  }, []);

  const { blastHops, blastStates } = useMemo(() => {
    const hops = new Map<string, number>();
    const states = new Map<string, HealthState>();
    for (const n of sim?.blast_radius.nodes ?? []) {
      hops.set(n.id, n.hops);
      states.set(n.id, n.state);
    }
    return { blastHops: hops, blastStates: states };
  }, [sim]);

  // Mobile / reduced-motion: a 2D-first narrative, no forced WebGL.
  if (!isDesktop || reduced) {
    return <MobileStory topology={topology} simulation={sim} />;
  }

  return (
    <>
      {/* Fixed film canvas */}
      <div className="fixed inset-0 z-0">
        {topology && (
          <CinematicScene
            topology={topology}
            blastHops={blastHops}
            blastStates={blastStates}
            progress={progressRef}
            reducedMotion={reduced}
          />
        )}
      </div>

      {/* Atmospheric lift over the canvas */}
      <div className="haze pointer-events-none fixed inset-0 z-10" />

      <SceneOverlay progress={progress} />
      <SceneChrome progress={progress} />

      {/* The scroll track that drives everything above. */}
      <div ref={ref} style={{ height: "900vh" }} aria-hidden />

      {/* Accessible, non-visual narrative for screen readers & no-JS. */}
      <div className="sr-only">
        <h1>PULSE — Data Resilience Digital Twin</h1>
        <p>See failure before it spreads.</p>
        <p>
          A digital twin for understanding how data failures propagate through
          your business. Model your data system as a dependency graph, simulate
          failures, and see the blast radius before it happens.
        </p>
        <a href="/control-room">Enter the control room</a>
      </div>
    </>
  );
}
