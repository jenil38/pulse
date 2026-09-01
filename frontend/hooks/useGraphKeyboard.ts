"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePulse } from "@/lib/store";
import type { Asset } from "@/lib/types";

/**
 * Keyboard navigation of the dependency graph (DESIGN.md §32).
 *
 * The 3D map is mouse-driven, so without this a keyboard user could read the
 * topology in the side panel but never *traverse lineage* — which is the actual
 * product interaction. Here the graph is navigated the way data flows:
 *
 *   ArrowRight / ArrowLeft   follow lineage downstream / upstream
 *   ArrowDown  / ArrowUp     cycle siblings within the same pipeline stage
 *   Home                     jump to the first source
 *   Escape                   clear the selection
 *
 * Ignored while the user is typing in an input, so filters keep working.
 */
export function useGraphKeyboard(enabled = true) {
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const select = usePulse((s) => s.select);

  const { downstream, upstream, byStage } = useMemo(() => {
    const down = new Map<string, string[]>();
    const up = new Map<string, string[]>();
    for (const d of topology?.dependencies ?? []) {
      down.set(d.upstream, [...(down.get(d.upstream) ?? []), d.downstream]);
      up.set(d.downstream, [...(up.get(d.downstream) ?? []), d.upstream]);
    }
    // Siblings = same node type, ordered stably by name.
    const stages = new Map<string, Asset[]>();
    for (const a of topology?.assets ?? []) {
      stages.set(a.type, [...(stages.get(a.type) ?? []), a]);
    }
    for (const [k, list] of stages) {
      stages.set(k, [...list].sort((x, y) => x.name.localeCompare(y.name)));
    }
    return { downstream: down, upstream: up, byStage: stages };
  }, [topology]);

  const firstSource = useMemo(
    () =>
      [...(topology?.assets ?? [])]
        .filter((a) => a.type === "SOURCE")
        .sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null,
    [topology]
  );

  /**
   * Cycle the alternatives at the current branch.
   *
   * True lineage siblings (nodes that share an upstream) are far more useful
   * than "every other node of the same type": from `daily_revenue` this moves
   * between the other models fed by `fact_orders`, which is exactly the choice
   * a user is making at a fan-out. Falls back to same-type nodes when a node
   * has no lineage siblings, so the key never feels dead.
   */
  const cycleSibling = useCallback(
    (id: string, dir: 1 | -1): string | null => {
      const asset = topology?.assets.find((a) => a.id === id);
      if (!asset) return null;

      const lineage = new Set<string>();
      for (const parent of upstream.get(id) ?? []) {
        for (const child of downstream.get(parent) ?? []) lineage.add(child);
      }
      lineage.delete(id);

      const pool =
        lineage.size > 0
          ? [...lineage, id].sort()
          : (byStage.get(asset.type) ?? []).map((s) => s.id);

      if (pool.length <= 1) return null;
      const idx = pool.indexOf(id);
      return pool[(idx + dir + pool.length) % pool.length];
    },
    [topology, byStage, upstream, downstream]
  );

  useEffect(() => {
    if (!enabled || !topology) return;

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Never hijack typing or native control interaction.
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return;
      }

      if (e.key === "Escape") {
        select(null);
        return;
      }

      if (e.key === "Home" && firstSource) {
        e.preventDefault();
        select(firstSource);
        return;
      }

      if (!e.key.startsWith("Arrow")) return;

      // With nothing selected, any arrow key enters the graph at a source.
      if (!selectedId) {
        if (firstSource) {
          e.preventDefault();
          select(firstSource);
        }
        return;
      }

      let next: string | null = null;
      switch (e.key) {
        case "ArrowRight":
          next = (downstream.get(selectedId) ?? []).slice().sort()[0] ?? null;
          break;
        case "ArrowLeft":
          next = (upstream.get(selectedId) ?? []).slice().sort()[0] ?? null;
          break;
        case "ArrowDown":
          next = cycleSibling(selectedId, 1);
          break;
        case "ArrowUp":
          next = cycleSibling(selectedId, -1);
          break;
      }

      if (next) {
        e.preventDefault();
        select(next);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    enabled,
    topology,
    selectedId,
    select,
    downstream,
    upstream,
    cycleSibling,
    firstSource,
  ]);
}
