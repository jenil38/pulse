"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { usePulse } from "@/lib/store";
import type { HealthState } from "@/lib/types";
import { STATE } from "@/lib/visual";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusDot } from "@/components/ui/primitives";

const TopologyScene = dynamic(
  () => import("@/components/three/TopologyScene").then((m) => m.TopologyScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <span className="text-small text-quaternary">Loading system map…</span>
      </div>
    ),
  }
);

/**
 * The Chaos Lab stage.
 *
 * The Control Room frames its map with chrome, a pipeline caption, a legend
 * rail, a selection card, because there the map is one panel among several.
 * Here the map is the subject, so the stage carries almost nothing: a vignette
 * that lights the centre, a legend that only names states actually on screen,
 * and a way back to the establishing shot. Everything else the lab needs is
 * floated over it by the page, in glass, so the graph continues underneath
 * rather than being boxed out by a sidebar.
 */
const LEGEND_ORDER: HealthState[] = [
  "FAILED",
  "DEGRADED",
  "STALE",
  "RECOVERING",
  "HEALTHY",
];

export function ChaosStage({ children }: { children?: ReactNode }) {
  const topology = usePulse((s) => s.topology);
  const stateOf = usePulse((s) => s.stateOf);
  const simulation = usePulse((s) => s.simulation);
  const propagationHops = usePulse((s) => s.propagationHops);
  const recoveryStep = usePulse((s) => s.recoveryStep);

  // Only the states present in THIS frame are named. A legend listing five
  // states when the system shows two is decoration; this one is a reading of
  // what is on screen, and it changes as the run moves.
  const present = useMemo(() => {
    const seen = new Set<HealthState>();
    for (const a of topology?.assets ?? []) seen.add(stateOf(a.id));
    return LEGEND_ORDER.filter((s) => seen.has(s));
    // `propagationHops` and `recoveryStep` are the clock: they are what makes
    // this recompute as the run advances.
  }, [topology, stateOf, simulation, propagationHops, recoveryStep]);

  const resetView = () =>
    window.dispatchEvent(new CustomEvent("pulse:reset-view"));

  return (
    <div className="stage-depth relative min-h-0 flex-1 bg-stage transition-colors duration-mode ease-standard">
      <TopologyScene />

      {/* Floating chrome the page supplies: composer, ledger, transport. */}
      {children}

      {/* Above the node labels the scene draws into the DOM (drei's <Html>
          tops out at z-index 5), so a name floating in the graph can never
          overdraw a panel that is being read. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-10">
        {/* Bottom-right: the top corners belong to the composer and the
            ledger, and a control the user reaches for rarely should not sit
            where the information is. */}
        <div className="pointer-events-auto absolute bottom-4 right-4">
          <Button
            size="xs"
            onClick={resetView}
            icon={<Icon name="reset" size={12} />}
            title="Reset the camera to frame the whole system"
          >
            Reset view
          </Button>
        </div>

        {present.length > 0 && (
          <div className="absolute bottom-4 left-4 hidden items-center gap-3.5 lg:flex">
            {present.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <StatusDot state={s} />
                <span className="text-caption text-tertiary">{STATE[s].label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
