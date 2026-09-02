"use client";

import { useMemo } from "react";
import { usePulse } from "@/lib/store";
import { STATE, scoreBand } from "@/lib/visual";
import type { HealthState } from "@/lib/types";
import { SimulatedTag } from "@/components/ui/primitives";

/**
 * Toolbar — breadcrumb, live health rollup, resilience.
 *
 * The counts come from `healthCounts()`, which derives from the same `stateOf`
 * the topology uses. During a simulation they therefore move with the
 * propagation wave instead of continuing to report the baseline the API
 * returned at page load.
 */
const ORDER: HealthState[] = ["FAILED", "DEGRADED", "STALE", "RECOVERING", "HEALTHY"];

export function Toolbar({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  const overview = usePulse((s) => s.overview);
  const systemFilter = usePulse((s) => s.systemFilter);
  const simulation = usePulse((s) => s.simulation);
  const propagationHops = usePulse((s) => s.propagationHops);
  const clearSimulation = usePulse((s) => s.clearSimulation);
  const healthCounts = usePulse((s) => s.healthCounts);
  const impactedCount = usePulse((s) => s.impactedCount);

  // `propagationHops` is subscribed to deliberately: it is what re-runs these
  // selectors as the wave advances, keeping the rollup in step with the map.
  const counts = useMemo(
    () => healthCounts(),
    [healthCounts, simulation, propagationHops]
  );
  const impacted = useMemo(
    () => impactedCount(),
    [impactedCount, simulation, propagationHops]
  );
  const band = overview ? scoreBand(overview.resilience_score) : null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <header
      data-surface
      className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-canvas px-4"
    >
      <div className="flex min-w-0 items-baseline gap-1.5">
        <h1 className="truncate text-body font-medium text-primary">{title}</h1>
        {systemFilter && (
          <>
            <span className="text-tertiary">/</span>
            <span className="truncate text-body text-secondary">{systemFilter}</span>
          </>
        )}
      </div>

      {/* Active-simulation indicator: states plainly that counts are simulated */}
      {simulation && (
        <span className="flex shrink-0 items-center gap-1.5 rounded border border-failed-border bg-failed-bg px-2 py-[3px]">
          <span className="h-[6px] w-[6px] rounded-full bg-failed" aria-hidden />
          <span className="hidden text-caption text-failed sm:inline">
            Simulating · {impacted} impacted
          </span>
          <button
            onClick={clearSimulation}
            className="text-caption text-failed underline-offset-2 hover:underline"
          >
            Exit
          </button>
        </span>
      )}

      <div className="ml-auto flex items-center gap-4">
        {total > 0 && (
          <div className="hidden items-center gap-3 lg:flex" aria-live="polite">
            {ORDER.map((s) => {
              const n = counts[s] ?? 0;
              return (
                <span key={s} className="flex items-center gap-1.5" title={STATE[s].label}>
                  <span
                    className={`h-[6px] w-[6px] rounded-full ${STATE[s].dot} ${n === 0 ? "opacity-30" : ""}`}
                    aria-hidden
                  />
                  <span
                    className={`tnum text-caption ${n === 0 ? "text-quaternary" : "text-secondary"}`}
                  >
                    {n}
                  </span>
                  <span className="sr-only">{STATE[s].label}</span>
                </span>
              );
            })}
          </div>
        )}

        {overview && band && (
          <div className="hidden items-baseline gap-1.5 md:flex">
            <span className="text-caption text-tertiary">Resilience</span>
            <span className={`tnum text-body font-medium ${band.text}`}>
              {overview.resilience_score}
            </span>
            <span className="text-caption text-quaternary">/100</span>
          </div>
        )}

        <div className="hidden xl:block">
          <SimulatedTag text="Demo data" />
        </div>

        {children}
      </div>
    </header>
  );
}
