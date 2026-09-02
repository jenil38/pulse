"use client";

import { Html } from "@react-three/drei";
import { usePulse } from "@/lib/store";
import type { Asset, HealthState } from "@/lib/types";
import { STATE } from "@/lib/visual";

/**
 * Selective node labels.
 *
 * Labelling all 43 nodes destroys the diagram; labelling none forces the user
 * to hover every node to understand anything. So we label only what earns it:
 *
 *   1. the selected node
 *   2. anything not healthy (the reason you're looking)
 *   3. sources and business consumers — the two ends of the story
 *
 * During a simulation the third rule is dropped, because the failure path is
 * then the only thing worth reading and the rest should recede.
 */
export function NodeLabels() {
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const hoveredId = usePulse((s) => s.hoveredId);
  const stateOf = usePulse((s) => s.stateOf);
  const simulation = usePulse((s) => s.simulation);
  const systemFilter = usePulse((s) => s.systemFilter);

  const shouldLabel = (a: Asset, state: HealthState): boolean => {
    if (a.id === selectedId) return true;
    // Hover already gets its own richer tooltip.
    if (a.id === hoveredId) return false;
    if (systemFilter && a.system !== systemFilter) return false;
    if (state !== "HEALTHY") return true;
    if (simulation) return false;
    return a.type === "SOURCE" || a.type === "TEAM";
  };

  return (
    <>
      {(topology?.assets ?? []).map((a) => {
        if (!a.position) return null;
        const state = stateOf(a.id);
        if (!shouldLabel(a, state)) return null;

        const selected = a.id === selectedId;
        const notable = state !== "HEALTHY";

        return (
          <Html
            key={a.id}
            position={[a.position.x, a.position.y + 4.2, a.position.z]}
            center
            distanceFactor={150}
            zIndexRange={[5, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span
              className={[
                "whitespace-nowrap rounded-xs px-1.5 py-[2px] text-[11px] leading-none",
                selected
                  ? "bg-primary font-medium text-canvas"
                  : notable
                    ? `${STATE[state].chip} border`
                    : "bg-canvas/85 text-tertiary",
              ].join(" ")}
            >
              {a.name}
            </span>
          </Html>
        );
      })}
    </>
  );
}
