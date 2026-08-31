"use client";

import Link from "next/link";
import { usePulse } from "@/lib/store";
import { STATE, scoreBand } from "@/lib/visual";
import { SimulatedTag } from "@/components/ui/primitives";
import type { HealthState } from "@/lib/types";

/** Top strip — system-wide vitals. Always visible, never noisy. */
export function StatusBar() {
  const overview = usePulse((s) => s.overview);
  const topology = usePulse((s) => s.topology);
  const simulation = usePulse((s) => s.simulation);
  const clearSimulation = usePulse((s) => s.clearSimulation);

  const band = overview ? scoreBand(overview.resilience_score) : null;
  const order: HealthState[] = ["HEALTHY", "STALE", "DEGRADED", "FAILED"];

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-line bg-panel px-5 py-3">
      {/* Identity */}
      <div className="flex items-center gap-5">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="font-mono text-[13px] font-medium tracking-[0.28em] text-ink">
            PULSE
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint sm:inline">
            Control Room
          </span>
        </Link>
        <span className="hidden h-3 w-px bg-line md:block" />
        <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute md:inline">
          {topology?.organization ?? "—"}
        </span>
      </div>

      {/* Vitals */}
      <div className="flex items-center gap-5">
        {simulation && (
          <button
            onClick={clearSimulation}
            className="border border-failed/40 bg-failed/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-failed transition-colors hover:bg-failed/20"
          >
            Simulation active — clear
          </button>
        )}

        <div className="hidden items-center gap-3.5 lg:flex">
          {order.map((s) => {
            const n = overview?.counts?.[s] ?? 0;
            if (!n) return null;
            return (
              <span key={s} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1 w-1 rounded-full"
                  style={{ background: STATE[s].hex }}
                />
                <span className="font-mono text-[10px] tabular-nums text-ink-dim">
                  {n}
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint">
                  {STATE[s].label}
                </span>
              </span>
            );
          })}
        </div>

        <span className="hidden items-center gap-1.5 md:flex">
          <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint">
            Incidents
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink-dim">
            {overview?.active_incidents ?? 0}
          </span>
        </span>

        {overview && band && (
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint">
              Resilience
            </span>
            <span
              className="font-mono text-[13px] tabular-nums leading-none"
              style={{ color: band.hex }}
            >
              {overview.resilience_score}
            </span>
            <span className="font-mono text-[9px] text-ink-faint">/100</span>
          </span>
        )}

        <SimulatedTag text="Demo data" />
      </div>
    </header>
  );
}
