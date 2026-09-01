"use client";

import { usePulse } from "@/lib/store";
import { NODE_LABEL, STATE } from "@/lib/visual";

/**
 * Screen-reader announcement for the current selection, plus a discoverable
 * hint for the keyboard lineage controls.
 *
 * The WebGL canvas is inert to assistive tech, so this is what tells a
 * non-visual user what they navigated to and how it connects.
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

      <div className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-1.5 xl:flex">
        <span className="text-caption text-quaternary">
          <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> lineage
        </span>
        <span className="text-caption text-quaternary">
          <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> branch
        </span>
        <span className="text-caption text-quaternary">
          <kbd className="font-mono">Home</kbd> sources
        </span>
        <span className="text-caption text-quaternary">
          <kbd className="font-mono">Esc</kbd> clear
        </span>
        <span className="ml-auto text-caption text-quaternary">
          <kbd className="font-mono">⌘K</kbd> commands
        </span>
      </div>
    </>
  );
}
