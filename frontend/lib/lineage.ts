/**
 * PULSE — client-side lineage walks.
 *
 * The server is the authority on what a failure does; this is only about what
 * a user can be shown *before* they commit to running one. Asking the API for
 * a blast radius on every hover would be both slow and misleading — it would
 * imply a simulation had been run. The dependency graph is already in the
 * browser, so the reachable set can be walked here, and the Chaos Lab can say
 * "18 assets sit downstream of this" without pretending to know what state
 * they would end up in. That answer only ever comes from the engine.
 *
 * Traversal mirrors `backend/app/engine/graph.py`: breadth-first over sorted
 * adjacency, so the order is deterministic and matches the server's.
 */
import type { Asset, Dependency, NodeType } from "./types";

export interface Adjacency {
  downstream: Map<string, string[]>;
  upstream: Map<string, string[]>;
}

export function buildAdjacency(dependencies: Dependency[]): Adjacency {
  const downstream = new Map<string, string[]>();
  const upstream = new Map<string, string[]>();
  for (const d of dependencies) {
    downstream.set(d.upstream, [...(downstream.get(d.upstream) ?? []), d.downstream]);
    upstream.set(d.downstream, [...(upstream.get(d.downstream) ?? []), d.upstream]);
  }
  for (const map of [downstream, upstream]) {
    for (const [k, v] of map) map.set(k, [...new Set(v)].sort());
  }
  return { downstream, upstream };
}

/** Everything strictly downstream of `id` — the reach of a failure there. */
export function descendants(adj: Adjacency, id: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...(adj.downstream.get(id) ?? [])];
  while (queue.length) {
    const n = queue.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    queue.push(...(adj.downstream.get(n) ?? []));
  }
  seen.delete(id);
  return seen;
}

/** Hop distance from `id` to everything it reaches, `id` itself being 0. */
export function hopDistances(adj: Adjacency, id: string): Map<string, number> {
  const dist = new Map<string, number>([[id, 0]]);
  const queue = [id];
  while (queue.length) {
    const n = queue.shift()!;
    for (const next of adj.downstream.get(n) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, dist.get(n)! + 1);
      queue.push(next);
    }
  }
  return dist;
}

export interface Stake {
  /** Assets downstream of the target, excluding the target itself. */
  reach: number;
  /** Hops to the furthest thing it can reach. */
  depth: number;
  criticalConsumers: Asset[];
  teams: Asset[];
  processes: Asset[];
}

const CONSUMER_TYPES: NodeType[] = ["DASHBOARD", "ML_MODEL"];

/**
 * What is downstream of a candidate target.
 *
 * Deliberately structural, never predictive: these are counts of what depends
 * on the target, not a claim about what would break. The word "would" belongs
 * to the engine's answer, not to this one.
 */
export function stakeOf(
  assets: Asset[],
  adj: Adjacency,
  targetId: string | null
): Stake | null {
  if (!targetId) return null;
  const byId = new Map(assets.map((a) => [a.id, a]));
  if (!byId.has(targetId)) return null;

  const hops = hopDistances(adj, targetId);
  const reached = [...hops.keys()].filter((id) => id !== targetId);
  const resolve = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((a): a is Asset => !!a);

  const downstream = resolve(reached);
  return {
    reach: reached.length,
    depth: Math.max(0, ...hops.values()),
    criticalConsumers: downstream.filter(
      (a) =>
        CONSUMER_TYPES.includes(a.type) &&
        (a.criticality === "CRITICAL" || a.criticality === "HIGH")
    ),
    teams: downstream.filter((a) => a.type === "TEAM"),
    processes: downstream.filter((a) => a.type === "BUSINESS_PROCESS"),
  };
}
