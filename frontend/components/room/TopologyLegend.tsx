"use client";

import { usePulse } from "@/lib/store";
import { STATE } from "@/lib/visual";
import type { HealthState } from "@/lib/types";

/**
 * Corner metadata overlaid on the map — editorial, unobtrusive.
 * Explains the state language and the flow metaphor.
 */
const STATES: HealthState[] = ["HEALTHY", "DEGRADED", "STALE", "FAILED", "RECOVERING"];

const FLOW_NOTE: Record<HealthState, string> = {
  HEALTHY: "steady flow",
  DEGRADED: "irregular flow",
  STALE: "flow slowed",
  FAILED: "flow stopped",
  RECOVERING: "flow returning",
};

export function TopologyLegend() {
  const topology = usePulse((s) => s.topology);
  const simulation = usePulse((s) => s.simulation);

  return (
    <>
      {/* Bottom-left: state legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 hidden sm:block">
        <ul className="space-y-1">
          {STATES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{ background: STATE[s].hex }}
              />
              <span
                className="font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{ color: STATE[s].hex }}
              >
                {STATE[s].label}
              </span>
              <span className="font-mono text-[9px] tracking-[0.1em] text-ink-faint">
                {FLOW_NOTE[s]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom-right: scale metadata */}
      <div className="pointer-events-none absolute bottom-4 right-4 hidden text-right sm:block">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          {topology?.assets.length ?? 0} assets · {topology?.dependencies.length ?? 0} dependencies
        </div>
        <div className="pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          Drag to orbit · scroll to zoom · click to inspect
        </div>
      </div>

      {/* Top-left: active simulation banner */}
      {simulation && (
        <div className="pointer-events-none absolute left-4 top-4 border border-failed/40 bg-base/90 px-3 py-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-failed">
            Simulating · {simulation.failure_label}
          </div>
          <div className="pt-0.5 font-mono text-[10px] text-ink-dim">
            {simulation.origin_name}
          </div>
          <div className="pt-1 font-mono text-[9px] tracking-[0.12em] text-ink-faint">
            {simulation.blast_radius.total_affected} downstream assets affected
          </div>
        </div>
      )}
    </>
  );
}
