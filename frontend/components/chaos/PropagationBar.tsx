"use client";

import type { Simulation } from "@/lib/types";
import type { SimPhase } from "@/lib/store";

/**
 * Propagation progress — a thin status strip under the stage.
 *
 * It exists to answer "how far has this travelled, and what did it cost?"
 * while the wave is still moving. Once settled it states the business
 * consequence in plain language, which is the whole point of the product.
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
  const settled = phase === "settled";
  const dashboards = simulation.blast_radius.critical_dashboards.length;
  const teams = simulation.business_impact.teams;

  return (
    <div
      data-surface
      className="shrink-0 border-t border-border bg-subtle px-4 py-2.5"
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-baseline gap-2">
          <span className="text-small font-medium text-primary">
            {settled ? "Blast radius settled" : "Propagating"}
          </span>
          <span className="text-caption text-tertiary">
            hop {Math.min(hops, maxHops)} of {maxHops}
          </span>
        </span>
        <span className="text-caption tnum text-tertiary">
          {revealed} / {simulation.blast_radius.total_affected} affected
        </span>
      </div>

      {/* Wave front */}
      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-failed transition-[width] duration-slow ease-standard"
          style={{ width: `${pct}%` }}
        />
      </div>

      {settled && (dashboards > 0 || teams.length > 0) && (
        <p className="animate-fade-in pt-2 text-caption text-secondary">
          {dashboards > 0 && (
            <>
              {dashboards} critical dashboard{dashboards > 1 ? "s" : ""}{" "}
              {dashboards > 1 ? "become" : "becomes"} untrustworthy
            </>
          )}
          {dashboards > 0 && teams.length > 0 && " · "}
          {teams.length > 0 && <>{teams.join(", ")} impacted</>}
        </p>
      )}
    </div>
  );
}
