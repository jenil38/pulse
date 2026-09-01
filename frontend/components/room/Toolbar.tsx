"use client";

import { usePulse } from "@/lib/store";
import { STATE, scoreBand } from "@/lib/visual";
import type { HealthState } from "@/lib/types";
import { SimulatedTag } from "@/components/ui/primitives";

/**
 * Toolbar — breadcrumb, health rollup, resilience.
 *
 * Compact (44px) and information-dense: counts are inline text with a status
 * dot, not five separate stat cards. Zero appears as a muted state rather than
 * being hidden, so the row's shape never jumps.
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
  const topology = usePulse((s) => s.topology);
  const systemFilter = usePulse((s) => s.systemFilter);
  const band = overview ? scoreBand(overview.resilience_score) : null;

  return (
    <header
      data-surface
      className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-canvas px-4"
    >
      {/* Breadcrumb */}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <h1 className="truncate text-body font-medium text-primary">{title}</h1>
        {systemFilter && (
          <>
            <span className="text-tertiary">/</span>
            <span className="truncate text-body text-secondary">{systemFilter}</span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4">
        {/* Health rollup — inline, not cards */}
        {overview && (
          <div className="hidden items-center gap-3 lg:flex">
            {ORDER.map((s) => {
              const n = overview.counts?.[s] ?? 0;
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
