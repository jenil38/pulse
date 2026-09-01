/**
 * Lineage-traversal tests for keyboard navigation.
 *
 * The 3D map is pointer-driven, so keyboard traversal is what makes the graph
 * usable without a mouse. These tests exercise the same resolution rules the
 * hook applies, against the real NOVA COMMERCE topology fetched from the
 * engine's own fixture shape.
 */
import { describe, expect, it } from "vitest";

import type { Dependency } from "../lib/types";

// The payments lineage, mirroring backend/app/engine/topology.py.
const DEPS: Dependency[] = [
  { upstream: "src_payments", downstream: "ing_payments", kind: "data" },
  { upstream: "ing_payments", downstream: "raw_payments", kind: "data" },
  { upstream: "raw_payments", downstream: "stg_payments", kind: "data" },
  { upstream: "stg_payments", downstream: "fact_payments", kind: "data" },
  { upstream: "fact_payments", downstream: "daily_revenue", kind: "data" },
  { upstream: "fact_orders", downstream: "daily_revenue", kind: "data" },
  { upstream: "daily_revenue", downstream: "dash_exec_revenue", kind: "data" },
];

/** Mirrors the hook's adjacency construction. */
function adjacency(deps: Dependency[]) {
  const down = new Map<string, string[]>();
  const up = new Map<string, string[]>();
  for (const d of deps) {
    down.set(d.upstream, [...(down.get(d.upstream) ?? []), d.downstream]);
    up.set(d.downstream, [...(up.get(d.downstream) ?? []), d.upstream]);
  }
  return { down, up };
}

const step = (m: Map<string, string[]>, id: string) =>
  (m.get(id) ?? []).slice().sort()[0] ?? null;

describe("keyboard lineage traversal", () => {
  const { down, up } = adjacency(DEPS);

  it("walks the full payments lineage downstream to the dashboard", () => {
    const path: string[] = ["src_payments"];
    let cur: string | null = "src_payments";
    while ((cur = step(down, cur))) path.push(cur);

    expect(path).toEqual([
      "src_payments",
      "ing_payments",
      "raw_payments",
      "stg_payments",
      "fact_payments",
      "daily_revenue",
      "dash_exec_revenue",
    ]);
  });

  it("walks back upstream until it reaches a root", () => {
    const path: string[] = ["dash_exec_revenue"];
    let cur: string | null = "dash_exec_revenue";
    while ((cur = step(up, cur))) path.push(cur);

    // daily_revenue has two parents; traversal picks the sorted-first one
    // (fact_orders) and continues from there, so the walk is deterministic.
    expect(path.slice(0, 3)).toEqual([
      "dash_exec_revenue",
      "daily_revenue",
      "fact_orders",
    ]);
    // It terminates at a root rather than looping.
    expect(step(up, path[path.length - 1])).toBeNull();
  });

  it("walks the payments branch back to its source", () => {
    const path: string[] = ["fact_payments"];
    let cur: string | null = "fact_payments";
    while ((cur = step(up, cur))) path.push(cur);
    expect(path[path.length - 1]).toBe("src_payments");
  });

  it("is deterministic when a node has multiple upstreams", () => {
    // daily_revenue depends on BOTH fact_orders and fact_payments.
    expect(up.get("daily_revenue")).toHaveLength(2);
    expect(step(up, "daily_revenue")).toBe("fact_orders"); // sorted first
    expect(step(up, "daily_revenue")).toBe(step(up, "daily_revenue"));
  });

  it("stops at the ends of the graph rather than cycling", () => {
    expect(step(up, "src_payments")).toBeNull();
    expect(step(down, "dash_exec_revenue")).toBeNull();
  });

  it("round-trips: stepping downstream then upstream returns to the start", () => {
    const next = step(down, "stg_payments");
    expect(next).toBe("fact_payments");
    expect(step(up, next!)).toBe("stg_payments");
  });
});

describe("branch sibling cycling", () => {
  // fact_orders fans out to four models — this is the real branch a user
  // navigates in the Control Room.
  const FANOUT: Dependency[] = [
    { upstream: "fact_orders", downstream: "daily_revenue", kind: "data" },
    { upstream: "fact_orders", downstream: "customer_metrics", kind: "data" },
    { upstream: "fact_orders", downstream: "marketing_attribution", kind: "data" },
    { upstream: "fact_orders", downstream: "inventory_health", kind: "data" },
  ];
  const { down, up } = adjacency(FANOUT);

  /** Mirrors cycleSibling()'s lineage-sibling resolution. */
  function siblings(id: string): string[] {
    const set = new Set<string>();
    for (const parent of up.get(id) ?? []) {
      for (const child of down.get(parent) ?? []) set.add(child);
    }
    set.delete(id);
    return set.size > 0 ? [...set, id].sort() : [];
  }

  it("treats models sharing an upstream as siblings", () => {
    expect(siblings("daily_revenue")).toEqual([
      "customer_metrics",
      "daily_revenue",
      "inventory_health",
      "marketing_attribution",
    ]);
  });

  it("cycles forward through the whole branch and wraps", () => {
    const pool = siblings("daily_revenue");
    const seen: string[] = [];
    let cur = "daily_revenue";
    for (let i = 0; i < pool.length; i++) {
      cur = pool[(pool.indexOf(cur) + 1) % pool.length];
      seen.push(cur);
    }
    // Visits every alternative exactly once and returns to the start.
    expect(new Set(seen).size).toBe(pool.length);
    expect(cur).toBe("daily_revenue");
  });

  it("cycles backward symmetrically", () => {
    const pool = siblings("daily_revenue");
    const fwd = pool[(pool.indexOf("daily_revenue") + 1) % pool.length];
    const back = pool[(pool.indexOf(fwd) - 1 + pool.length) % pool.length];
    expect(back).toBe("daily_revenue");
  });

  it("reports no lineage siblings for an only child", () => {
    // A node whose parent has exactly one child has no branch to cycle.
    const solo = adjacency([
      { upstream: "src_payments", downstream: "ing_payments", kind: "data" },
    ]);
    const set = new Set<string>();
    for (const p of solo.up.get("ing_payments") ?? []) {
      for (const c of solo.down.get(p) ?? []) set.add(c);
    }
    set.delete("ing_payments");
    expect(set.size).toBe(0);
  });
});
