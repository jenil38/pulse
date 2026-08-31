"use client";

import type { Simulation } from "@/lib/types";
import type { SimPhase } from "@/lib/store";

/**
 * Overlay showing the propagation wave travelling outward from the origin,
 * hop by hop. Sits at the bottom of the map — cinematic but readable.
 */
export function PropagationBar({
  simulation,
  hops,
  maxHops,
  phase,
}: {
  simulation: Simulation | null;
  hops: number;
  maxHops: number;
  phase: SimPhase;
}) {
  if (!simulation) return null;

  const pct = maxHops > 0 ? Math.min(hops / maxHops, 1) * 100 : 0;
  const revealed = simulation.blast_radius.nodes.filter(
    (n) => n.id !== simulation.origin && n.hops <= hops
  ).length;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
      <div className="border border-line bg-base/92 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-failed">
              {phase === "propagating" ? "Propagating" : "Blast radius settled"}
            </span>
            <span className="font-mono text-[10px] text-ink-dim">
              {simulation.origin_name} · {simulation.failure_label}
            </span>
          </div>
          <span className="font-mono text-[9px] tabular-nums text-ink-mute">
            {revealed} / {simulation.blast_radius.total_affected} affected · hop{" "}
            {Math.min(hops, maxHops)} of {maxHops}
          </span>
        </div>

        {/* Propagation progress — the wave front. */}
        <div className="mt-2.5 h-px w-full bg-line">
          <div
            className="h-px bg-failed transition-[width] duration-500 ease-pulse"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Business consequence, stated plainly. */}
        {phase === "settled" && (
          <p className="animate-fade-up pt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
            {simulation.blast_radius.critical_dashboards.length > 0 && (
              <>
                {simulation.blast_radius.critical_dashboards.length} critical dashboard
                {simulation.blast_radius.critical_dashboards.length > 1 ? "s" : ""} untrustworthy
              </>
            )}
            {simulation.business_impact.teams.length > 0 && (
              <> · {simulation.business_impact.teams.join(", ")} impacted</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
