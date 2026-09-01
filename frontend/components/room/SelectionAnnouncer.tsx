"use client";

import { usePulse } from "@/lib/store";
import { NODE_LABEL, STATE } from "@/lib/visual";

/**
 * Screen-reader announcement for the current selection, plus a visible hint
 * for the keyboard lineage controls.
 *
 * The 3D canvas is inert to assistive tech, so this is what tells a
 * non-visual user what they just navigated to and how it is connected.
 */
export function SelectionAnnouncer() {
  const selectedId = usePulse((s) => s.selectedId);
  const assetById = usePulse((s) => s.assetById);
  const stateOf = usePulse((s) => s.stateOf);
  const topology = usePulse((s) => s.topology);

  const asset = selectedId ? assetById(selectedId) : undefined;

  const up = topology?.dependencies.filter((d) => d.downstream === selectedId).length ?? 0;
  const down = topology?.dependencies.filter((d) => d.upstream === selectedId).length ?? 0;

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {asset
          ? `${asset.name}. ${NODE_LABEL[asset.type]} in ${asset.system}. ` +
            `Health ${STATE[stateOf(asset.id)].label}. Criticality ${asset.criticality}. ` +
            `${up} direct upstream, ${down} direct downstream.`
          : "No asset selected."}
      </div>

      {/* Visible affordance for the keyboard controls. */}
      <div className="pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 xl:block">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          ← → lineage · ↑ ↓ siblings · home sources · esc clear
        </p>
      </div>
    </>
  );
}
