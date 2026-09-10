"use client";

import { useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePulse } from "@/lib/store";
import type { Asset, HealthState } from "@/lib/types";
import { STATE } from "@/lib/visual";
import { labelSize, placeWithoutOverlap, type ScreenLabel } from "@/lib/labels";

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
 *
 * Earning a label is still not enough to get one. Two nodes far apart in the
 * graph can sit on top of each other on screen, and overlapping labels are
 * worse than no label — they misattribute a name to the wrong node. So the
 * candidates are placed greedily in priority order and any that would collide
 * with one already placed is dropped. See `useVisibleLabels`.
 */

/** Lower sorts first, and is kept when two labels cannot both be drawn. */
const STATE_PRIORITY: Record<HealthState, number> = {
  FAILED: 1,
  DEGRADED: 2,
  STALE: 3,
  RECOVERING: 4,
  HEALTHY: 5,
};

/** How often the screen-space pass re-runs, in ms. */
const CULL_INTERVAL = 120;

/** Breathing room between two labels, in screen pixels. */
const GAP = 4;

/** Matches the `distanceFactor` passed to each label's <Html>. */
const DISTANCE_FACTOR = 150;

interface Candidate {
  asset: Asset;
  state: HealthState;
  priority: number;
  /** False for a node the running simulation has not touched. */
  inRun: boolean;
  anchor: THREE.Vector3;
}

/**
 * The subset of candidates that can be drawn without overlapping each other.
 *
 * Runs on the render loop rather than in React state per frame: the set only
 * changes when the camera has actually moved enough to change which labels
 * collide, so it is recomputed on an interval and committed only when the
 * answer differs from what is on screen.
 */
function useVisibleLabels(candidates: Candidate[]): Set<string> | null {
  const { camera, size } = useThree();
  // null means "the pass has not run yet" — draw everything, so a scene that
  // never renders a frame (reduced motion, offscreen) still shows its labels.
  const [visible, setVisible] = useState<Set<string> | null>(null);
  // -Infinity so the very first frame always computes. Under reduced motion the
  // canvas renders on demand, and frames can be rare — the pass must not sit
  // behind a throttle waiting for a second one that never arrives.
  const last = useRef(-Infinity);
  const ndc = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime() * 1000;
    if (now - last.current < CULL_INTERVAL) return;
    last.current = now;

    const cam = camera as THREE.PerspectiveCamera;
    const vFov = (cam.fov * Math.PI) / 180;
    const boxes: ScreenLabel[] = [];

    for (const c of candidates) {
      const p = ndc.current.copy(c.anchor).project(cam);
      // Behind the camera, or outside the frame with a margin for its own box.
      if (p.z > 1 || Math.abs(p.x) > 1.35 || Math.abs(p.y) > 1.35) continue;

      // The same scale drei applies to an <Html distanceFactor> element:
      // distanceFactor / (2 * tan(vFov / 2) * distance). See its objectScale.
      const dist = cam.position.distanceTo(c.anchor);
      const scale = DISTANCE_FACTOR / (2 * Math.tan(vFov / 2) * dist);
      const [w, h] = labelSize(c.asset.name);

      boxes.push({
        id: c.asset.id,
        x: (p.x * 0.5 + 0.5) * size.width,
        y: (-p.y * 0.5 + 0.5) * size.height,
        hw: (w * scale) / 2 + GAP,
        hh: (h * scale) / 2 + GAP,
      });
    }

    const keep = placeWithoutOverlap(boxes);

    setVisible((prev) => {
      if (prev && prev.size === keep.size && [...keep].every((id) => prev.has(id))) {
        return prev;
      }
      return keep;
    });
  });

  return visible;
}

export function NodeLabels() {
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const hoveredId = usePulse((s) => s.hoveredId);
  const aimedId = usePulse((s) => s.aimedId);
  const stateOf = usePulse((s) => s.stateOf);
  const isRevealed = usePulse((s) => s.isRevealed);
  const simulation = usePulse((s) => s.simulation);
  const systemFilter = usePulse((s) => s.systemFilter);
  // Subscribed so the labels re-resolve as the run moves. Without these the
  // candidate list is computed once and then frozen, and a node that has been
  // repaired keeps wearing the chip of the state it used to be in.
  const propagationHops = usePulse((s) => s.propagationHops);
  const recoveryStep = usePulse((s) => s.recoveryStep);

  // The component a failure is aimed at, or the one it was injected into.
  // It is the subject of the whole screen and always carries its name.
  const markedId = simulation ? simulation.origin : aimedId;

  const shouldLabel = (a: Asset, state: HealthState): boolean => {
    if (a.id === selectedId || a.id === markedId) return true;
    // Hover already gets its own richer tooltip.
    if (a.id === hoveredId) return false;
    if (systemFilter && a.system !== systemFilter) return false;
    if (state !== "HEALTHY") return true;
    if (simulation) return false;
    return a.type === "SOURCE" || a.type === "TEAM";
  };

  // Ordered best-first, so the screen-space pass keeps what matters when two
  // labels cannot both be drawn. The id tiebreak keeps the order stable, so a
  // label does not flicker between two equal claimants as the camera drifts.
  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    for (const a of topology?.assets ?? []) {
      if (!a.position) continue;
      const state = stateOf(a.id);
      if (!shouldLabel(a, state)) continue;
      // A demo system carries a few assets that were already unhealthy before
      // anyone injected anything. They are real and stay labelled, but while a
      // failure is travelling they are not the story, so they lose every
      // collision to a node the run has actually reached.
      const inRun = !simulation || isRevealed(a.id);
      out.push({
        asset: a,
        state,
        inRun,
        priority:
          a.id === selectedId || a.id === markedId
            ? 0
            : inRun
              ? STATE_PRIORITY[state]
              : 9,
        anchor: new THREE.Vector3(a.position.x, a.position.y + 4.2, a.position.z),
      });
    }
    return out.sort((p, q) => p.priority - q.priority || p.asset.id.localeCompare(q.asset.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    topology,
    selectedId,
    hoveredId,
    markedId,
    systemFilter,
    simulation,
    stateOf,
    isRevealed,
    propagationHops,
    recoveryStep,
  ]);

  const visible = useVisibleLabels(candidates);

  return (
    <>
      {candidates.map(({ asset: a, state, inRun }) => {
        // A marked node is drawn like a selected one while it is still
        // healthy — that is the "you are about to break this" reading. Once
        // it is failing, its state chip says more, so the state wins.
        const selected = a.id === selectedId || a.id === markedId;
        // The selection is drawn immediately rather than waiting for the next
        // culling pass, so clicking a node never has a frame of latency before
        // its name appears. It sorts first, so a pass would keep it anyway.
        if (visible && !visible.has(a.id) && !selected) return null;

        const notable = state !== "HEALTHY";
        const asSelected = selected && !notable;

        return (
          <Html
            key={a.id}
            position={[a.position!.x, a.position!.y + 4.2, a.position!.z]}
            center
            distanceFactor={DISTANCE_FACTOR}
            zIndexRange={[5, 0]}
            style={{ pointerEvents: "none", opacity: inRun ? 1 : 0.45 }}
          >
            <span
              className={[
                "whitespace-nowrap rounded-xs px-1.5 py-[2px] text-[11px] leading-none",
                asSelected
                  ? "bg-primary font-medium text-canvas"
                  : // A state chip is a claim that this node is part of what
                    // you are watching. An asset that was already degraded
                    // before the run began is real, and keeps its label, but
                    // it takes the neutral treatment so it cannot be mistaken
                    // for the failure travelling. Its own colour on the map
                    // still says what state it is in.
                    notable && inRun
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
