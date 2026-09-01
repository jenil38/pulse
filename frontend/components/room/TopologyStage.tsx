"use client";

import dynamic from "next/dynamic";
import { usePulse } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { PIPELINE_STAGES, STATE } from "@/lib/visual";
import type { HealthState } from "@/lib/types";
import { Button } from "@/components/ui/Button";

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
 * The topology as a first-class product surface — not a widget inside a card.
 *
 * The stage owns the full width of the main column; its chrome is a thin
 * caption bar rather than a floating overlay. In chaos mode a status strip
 * appears explaining what is being simulated and offering the exit.
 */
const LEGEND: HealthState[] = ["HEALTHY", "DEGRADED", "STALE", "FAILED", "RECOVERING"];

export function TopologyStage() {
  const [mode] = useMode();
  const simulation = usePulse((s) => s.simulation);
  const clearSimulation = usePulse((s) => s.clearSimulation);
  const chaos = mode === "chaos";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Pipeline caption — explains the left-to-right reading order */}
      <div
        data-surface
        className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-canvas px-4"
      >
        <span className="text-micro uppercase text-quaternary">Flow</span>
        <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {PIPELINE_STAGES.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-quaternary">→</span>}
              <span className="whitespace-nowrap text-caption text-tertiary">{s.label}</span>
            </li>
          ))}
        </ol>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          {LEGEND.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-[6px] w-[6px] rounded-full ${STATE[s].dot}`} aria-hidden />
              <span className="text-caption text-tertiary">{STATE[s].label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div className="relative min-h-0 flex-1 bg-stage transition-colors duration-mode ease-standard">
        <TopologyScene />

        {/* Chaos status strip — only present while simulating */}
        {chaos && simulation && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
            <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-failed-border bg-surface px-3 py-2 shadow-overlay">
              <span className="flex items-center gap-2">
                <span className="h-[6px] w-[6px] rounded-full bg-failed" aria-hidden />
                <span className="text-small font-medium text-primary">
                  {simulation.origin_name}
                </span>
              </span>
              <span className="text-small text-tertiary">{simulation.failure_label}</span>
              <span className="text-small tnum text-tertiary">
                {simulation.blast_radius.total_affected} affected
              </span>
              <Button size="xs" variant="ghost" onClick={clearSimulation}>
                Exit simulation
              </Button>
            </div>
          </div>
        )}

        {/* Interaction hint — quiet, bottom-right, non-blocking */}
        <p className="pointer-events-none absolute bottom-3 right-4 hidden text-caption text-quaternary lg:block">
          Drag to orbit · scroll to zoom · click a node to inspect
        </p>
      </div>
    </div>
  );
}
