"use client";

import dynamic from "next/dynamic";
import { usePulse } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { NODE_LABEL, PIPELINE_STAGES, STATE } from "@/lib/visual";
import type { HealthState } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Icon, NodeGlyph } from "@/components/ui/Icon";
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
 * The topology as a first-class product surface.
 *
 * Stage chrome is a thin caption bar plus two persistent affordances the map
 * previously lacked: a reset control (so a lost camera is always recoverable)
 * and a selected-node readout (so the current focus is identifiable without
 * hovering or opening the inspector).
 */
const LEGEND: HealthState[] = ["HEALTHY", "DEGRADED", "STALE", "FAILED", "RECOVERING"];

export function TopologyStage() {
  const [mode] = useMode();
  const simulation = usePulse((s) => s.simulation);
  const clearSimulation = usePulse((s) => s.clearSimulation);
  const selectedId = usePulse((s) => s.selectedId);
  const assetById = usePulse((s) => s.assetById);
  const stateOf = usePulse((s) => s.stateOf);
  const select = usePulse((s) => s.select);
  const tracedIds = usePulse((s) => s.tracedIds);
  const clearTrace = usePulse((s) => s.clearTrace);

  const chaos = mode === "chaos";
  const selected = selectedId ? assetById(selectedId) : undefined;

  const resetView = () => window.dispatchEvent(new CustomEvent("pulse:reset-view"));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Pipeline caption */}
      <div
        data-surface
        className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-subtle px-4"
      >
        <span className="hidden text-micro uppercase text-quaternary sm:inline">Flow</span>
        <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {PIPELINE_STAGES.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-quaternary" aria-hidden>→</span>}
              <span className="whitespace-nowrap text-caption text-tertiary">{s.label}</span>
            </li>
          ))}
        </ol>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {LEGEND.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <StatusDot state={s} />
              <span className="text-caption text-tertiary">{STATE[s].label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div className="relative min-h-0 flex-1 bg-stage transition-colors duration-mode ease-standard">
        <TopologyScene />

        {/* View controls — always available, top-right */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {tracedIds.size > 0 && (
            <Button size="xs" onClick={clearTrace}>
              Clear trace
            </Button>
          )}
          <Button
            size="xs"
            onClick={resetView}
            icon={<Icon name="reset" size={12} />}
            title="Reset the camera to frame the whole system"
          >
            Reset view
          </Button>
        </div>

        {/* Chaos status strip */}
        {chaos && simulation && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
            <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-failed-border bg-surface px-3 py-2 shadow-overlay">
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

        {/* Persistent selected-node context, bottom-left */}
        {selected && (
          <div className="absolute bottom-3 left-3 max-w-[min(320px,calc(100%-24px))] rounded-lg border border-border bg-surface px-3 py-2 shadow-raised">
            <div className="flex items-start gap-2.5">
              <span className="mt-[2px] grid h-6 w-6 shrink-0 place-items-center rounded border border-border bg-subtle text-tertiary">
                <NodeGlyph type={selected.type} size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-primary">{selected.name}</p>
                <p className="flex items-center gap-1.5 pt-0.5 text-caption text-tertiary">
                  <StatusDot state={stateOf(selected.id)} />
                  {STATE[stateOf(selected.id)].label} · {NODE_LABEL[selected.type]}
                </p>
              </div>
              <button
                onClick={() => select(null)}
                aria-label="Clear selection"
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-quaternary transition-colors hover:bg-subtle hover:text-primary"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Interaction hint — only when nothing is selected */}
        {!selected && (
          <p className="pointer-events-none absolute bottom-3 left-4 hidden text-caption text-quaternary lg:block">
            Drag to orbit · scroll to zoom · click a node to inspect
          </p>
        )}
      </div>
    </div>
  );
}
