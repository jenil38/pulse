/**
 * Chaos Lab playback guardrails.
 *
 * The lab's whole claim is that what you watch is what the engine computed.
 * That claim only holds if the clock's derivation of "how far has this got"
 * matches the engine's own event cadence exactly, so these tests run against a
 * fixture captured from the real engine — `stg_payments` schema drift over the
 * NOVA COMMERCE topology, verbatim from `run_simulation`.
 *
 * The invariant worth protecting above all others is the recovery order: an
 * asset must never come back before the thing that feeds it. That is the
 * engineering the recovery playback exists to show, and a regression there
 * would make the animation a lie rather than a bug.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  SECONDS_PER_HOP,
  SECONDS_PER_RECOVERY_STEP,
  maxHops,
  propagationEnd,
  recoveryWindow,
  usePulse,
} from "../lib/store";
import {
  buildAdjacency,
  descendants,
  hopDistances,
  stakeOf,
} from "../lib/lineage";
import type {
  Asset,
  Dependency,
  NodeImpact,
  RecoveryStep,
  Simulation,
  TimelineEvent,
} from "../lib/types";

/* ------------------------------------------------------------- fixture */

/** Verbatim from `compute_blast_radius(stg_payments, SCHEMA_DRIFT)`. */
const NODES: NodeImpact[] = [
  { id: "stg_payments", name: "stg_payments", type: "TRANSFORMATION", state: "FAILED", severity: "MEDIUM", hops: 0, untrustworthy: false, impacted: false },
  { id: "fact_payments", name: "fact_payments", type: "WAREHOUSE_TABLE", state: "DEGRADED", severity: "HIGH", hops: 1, untrustworthy: false, impacted: false },
  { id: "daily_revenue", name: "daily_revenue", type: "DATA_MODEL", state: "DEGRADED", severity: "CRITICAL", hops: 2, untrustworthy: false, impacted: false },
  { id: "ml_fraud", name: "Fraud Detection Model", type: "ML_MODEL", state: "DEGRADED", severity: "CRITICAL", hops: 2, untrustworthy: true, impacted: false },
  { id: "bp_fraud_review", name: "Fraud Review Queue", type: "BUSINESS_PROCESS", state: "DEGRADED", severity: "HIGH", hops: 3, untrustworthy: false, impacted: true },
  { id: "dash_exec_revenue", name: "Executive Revenue Dashboard", type: "DASHBOARD", state: "DEGRADED", severity: "CRITICAL", hops: 3, untrustworthy: true, impacted: false },
  { id: "bp_board_report", name: "Board Revenue Reporting", type: "BUSINESS_PROCESS", state: "DEGRADED", severity: "CRITICAL", hops: 4, untrustworthy: false, impacted: true },
  { id: "team_finance", name: "Finance Team", type: "TEAM", state: "DEGRADED", severity: "CRITICAL", hops: 4, untrustworthy: false, impacted: true },
  { id: "team_risk", name: "Risk Team", type: "TEAM", state: "DEGRADED", severity: "HIGH", hops: 4, untrustworthy: false, impacted: true },
];

/** Verbatim from `generate_recovery_plan`. */
const RECOVERY: RecoveryStep[] = [
  { order: 1, action: "Reject the drifted schema and restore the data contract at stg_payments", target_id: "stg_payments", target_name: "stg_payments", kind: "restore" },
  { order: 2, action: "Rebuild fact_payments", target_id: "fact_payments", target_name: "fact_payments", kind: "rebuild" },
  { order: 3, action: "Rebuild daily_revenue", target_id: "daily_revenue", target_name: "daily_revenue", kind: "rebuild" },
  { order: 4, action: "Verify model Fraud Detection Model is trustworthy again", target_id: "ml_fraud", target_name: "Fraud Detection Model", kind: "verify" },
  { order: 5, action: "Verify dashboard Executive Revenue Dashboard is trustworthy again", target_id: "dash_exec_revenue", target_name: "Executive Revenue Dashboard", kind: "verify" },
  { order: 6, action: "Notify Finance Team, Risk Team and mark incident resolved", target_id: null, target_name: null, kind: "resolve" },
];

const DURATION_MINUTES = 30;

/** Built the way `_build_timeline` builds it: hops x 180, then the plan. */
const TIMELINE: TimelineEvent[] = [
  {
    t: 0,
    node_id: "stg_payments",
    label: "stg_payments — Schema drift injected",
    kind: "inject" as TimelineEvent["kind"],
  },
  ...NODES.filter((n) => n.hops > 0).map<TimelineEvent>((n) => ({
    t: n.hops * SECONDS_PER_HOP,
    node_id: n.id,
    label: `${n.name} -> ${n.state}`,
    kind: (n.impacted || n.untrustworthy
      ? "impact"
      : "propagate") as TimelineEvent["kind"],
  })),
  ...RECOVERY.map<TimelineEvent>((s) => ({
    t: DURATION_MINUTES * 60 + (s.order - 1) * SECONDS_PER_RECOVERY_STEP,
    node_id: s.target_id,
    label: s.action,
    kind: (s.kind === "resolve" ? "resolve" : "recover") as TimelineEvent["kind"],
  })),
].sort((a, b) => a.t - b.t);

const SIM: Simulation = {
  id: "sim_test",
  simulated: true,
  origin: "stg_payments",
  origin_name: "stg_payments",
  failure_type: "SCHEMA_DRIFT",
  failure_label: "Schema drift",
  parameter: "amount: DECIMAL → STRING",
  duration_minutes: DURATION_MINUTES,
  blast_radius: {
    origin: "stg_payments",
    origin_name: "stg_payments",
    failure_type: "SCHEMA_DRIFT",
    failure_label: "Schema drift",
    mode: "BREAK",
    total_affected: 8,
    blast_score: 96,
    nodes: NODES,
    affected_ids: NODES.filter((n) => n.hops > 0).map((n) => n.id),
    critical_dashboards: ["dash_exec_revenue"],
    ml_models: ["ml_fraud"],
    business_processes: ["bp_board_report", "bp_fraud_review"],
    teams: ["team_finance", "team_risk"],
    counts_by_type: {},
    counts_by_severity: {},
  },
  recovery: RECOVERY,
  timeline: TIMELINE,
  business_impact: {
    affected_assets: 8,
    critical_dashboards: ["Executive Revenue Dashboard"],
    ml_models: ["Fraud Detection Model"],
    business_processes: ["Board Revenue Reporting", "Fraud Review Queue"],
    teams: ["Finance Team", "Risk Team"],
    blast_score: 96,
  },
};

/** The payments lineage, mirroring backend/app/engine/topology.py. */
const DEPS: Dependency[] = [
  { upstream: "src_payments", downstream: "ing_payments", kind: "data" },
  { upstream: "ing_payments", downstream: "raw_payments", kind: "data" },
  { upstream: "raw_payments", downstream: "stg_payments", kind: "data" },
  { upstream: "stg_payments", downstream: "fact_payments", kind: "data" },
  { upstream: "fact_payments", downstream: "daily_revenue", kind: "data" },
  { upstream: "fact_payments", downstream: "ml_fraud", kind: "data" },
  { upstream: "daily_revenue", downstream: "dash_exec_revenue", kind: "data" },
  { upstream: "dash_exec_revenue", downstream: "team_finance", kind: "data" },
];

const store = () => usePulse.getState();

beforeEach(() => {
  store().clearSimulation();
  store().setSimulation(SIM);
});

/* ------------------------------------------------------- engine cadence */

describe("engine cadence", () => {
  it("reads propagation length from the blast radius, not a guess", () => {
    expect(maxHops(SIM)).toBe(4);
    expect(propagationEnd(SIM)).toBe(4 * SECONDS_PER_HOP);
    expect(propagationEnd(SIM)).toBe(720);
  });

  it("finds the recovery window in the engine's own events", () => {
    const w = recoveryWindow(SIM);
    // Recovery does not begin until the failure has run its configured
    // duration — 30 minutes here — which is the gap the transport labels.
    expect(w).toEqual({ start: 1800, end: 1800 + 5 * SECONDS_PER_RECOVERY_STEP });
    expect(w!.start).toBe(DURATION_MINUTES * 60);
    expect(w!.start).toBeGreaterThan(propagationEnd(SIM));
  });

  it("has no recovery window for a run without a plan", () => {
    expect(recoveryWindow({ ...SIM, recovery: [], timeline: [] })).toBeNull();
    expect(recoveryWindow(null)).toBeNull();
  });
});

/* ------------------------------------------------------------ the axis */

describe("the playback axis", () => {
  it("gives the settled blast radius room of its own", () => {
    // The last hop lands exactly at propagationEnd. If the segment stopped
    // there too, the finished blast radius would occupy a single instant that
    // a scrubber could only hit by luck, and the final hop would be all but
    // unreachable. The segment therefore runs one hop past the last event —
    // the same beat the closing recovery step gets.
    const settle = propagationEnd(SIM);
    store().seek(settle);
    expect(store().propagationHops).toBe(maxHops(SIM));

    store().seek(settle + SECONDS_PER_HOP - 1);
    expect(store().propagationHops).toBe(maxHops(SIM));
  });

  it("elides the dead time between the halves", () => {
    const w = recoveryWindow(SIM)!;
    // 30 minutes of configured failure duration sit between the last hop and
    // the first repair, and nothing at all happens in them.
    expect(w.start - propagationEnd(SIM)).toBe(1080);
  });

  it("has no gap to elide when recovery starts before propagation ends", () => {
    // A five-minute failure over a four-hop graph: the engine schedules the
    // first recovery step at t=300, while the wave is still travelling. The
    // timeline is genuinely continuous there, and an axis that drew a seam
    // would be inventing one.
    const short: Simulation = {
      ...SIM,
      duration_minutes: 5,
      timeline: SIM.timeline.map((e) =>
        e.kind === "recover" || e.kind === "resolve"
          ? { ...e, t: e.t - 1500 }
          : e
      ),
    };
    const w = recoveryWindow(short)!;
    expect(w.start).toBe(300);
    expect(w.start).toBeLessThan(propagationEnd(short));
  });
});

/* -------------------------------------------------------------- seeking */

describe("seeking the run", () => {
  it("advances the propagation front one hop per 180 simulated seconds", () => {
    for (const [t, hops] of [
      [0, 0],
      [179, 0],
      [180, 1],
      [540, 3],
      [720, 4],
      // Past the end of propagation the front cannot advance further.
      [1700, 4],
    ] as const) {
      store().seek(t);
      expect(store().propagationHops, `t=${t}`).toBe(hops);
    }
  });

  it("completes no recovery step before the first one is scheduled", () => {
    store().seek(1799);
    expect(store().recoveryStep).toBe(0);
  });

  it("completes one recovery step per 300 simulated seconds", () => {
    for (const [t, done] of [
      [1800, 0], // step 1 is starting, not finished
      [2100, 1],
      [2400, 2],
      [3300, 5],
      [3600, 6], // the final step has had its own beat
      [9999, 6], // and never overruns the plan
    ] as const) {
      store().seek(t);
      expect(store().recoveryStep, `t=${t}`).toBe(done);
    }
  });

  it("holds the blast radius complete once recovery has begun", () => {
    store().seek(2400);
    expect(store().propagationHops).toBe(maxHops(SIM));
  });
});

/* --------------------------------------------------------------- states */

describe("what the map shows", () => {
  it("reveals a node only once the wave has reached its hop", () => {
    store().seek(0);
    expect(store().isRevealed("stg_payments")).toBe(true);
    expect(store().isRevealed("fact_payments")).toBe(false);
    expect(store().stateOf("fact_payments")).toBe("HEALTHY");

    store().seek(180);
    expect(store().isRevealed("fact_payments")).toBe(true);
    expect(store().stateOf("fact_payments")).toBe("DEGRADED");
  });

  it("never reveals anything outside the blast radius", () => {
    store().seek(720);
    expect(store().isRevealed("src_marketing")).toBe(false);
    expect(store().stateOf("src_marketing")).toBe("HEALTHY");
  });

  it("walks an asset from broken, through recovering, to healthy", () => {
    store().setSimPhase("recovering");

    // Step 2 rebuilds fact_payments.
    store().seek(1800); // step 1 running
    expect(store().stateOf("fact_payments")).toBe("DEGRADED");

    store().seek(2100); // step 1 done, step 2 running
    expect(store().stateOf("fact_payments")).toBe("RECOVERING");

    store().seek(2400); // step 2 done
    expect(store().stateOf("fact_payments")).toBe("HEALTHY");
  });

  it("shows the origin recovering while its own step is in flight", () => {
    store().setSimPhase("recovering");
    store().seek(1800);
    expect(store().stateOf("stg_payments")).toBe("RECOVERING");
    store().seek(2100);
    expect(store().stateOf("stg_payments")).toBe("HEALTHY");
  });

  it("restores teams and processes only when the incident is resolved", () => {
    store().setSimPhase("recovering");
    // The plan names no step for a team — nothing is "rebuilt" about people.
    // They are whole again when the incident closes, and not one step before.
    store().seek(3300);
    expect(store().stateOf("team_finance")).toBe("RECOVERING");
    expect(store().stateOf("bp_board_report")).toBe("RECOVERING");

    store().seek(3600);
    expect(store().stateOf("team_finance")).toBe("HEALTHY");
    expect(store().stateOf("bp_board_report")).toBe("HEALTHY");
  });

  it("ends with every affected asset healthy", () => {
    store().setSimPhase("recovering");
    store().seek(3600);
    for (const n of NODES) {
      expect(store().stateOf(n.id), n.id).toBe("HEALTHY");
    }
    expect(store().impactedCount()).toBe(0);
  });

  it("counts impact up as it spreads and back down as it is repaired", () => {
    store().seek(0);
    expect(store().impactedCount()).toBe(0); // the origin is not "downstream"
    store().seek(180);
    expect(store().impactedCount()).toBe(1);
    store().seek(720);
    expect(store().impactedCount()).toBe(8);

    store().setSimPhase("recovering");
    store().seek(2400); // fact_payments repaired
    expect(store().impactedCount()).toBeLessThan(8);
    store().seek(3600);
    expect(store().impactedCount()).toBe(0);
  });
});

/* ------------------------------------------------------------ the order */

describe("recovery respects dependency order", () => {
  const adj = buildAdjacency(DEPS);
  const orderOf = new Map(
    RECOVERY.filter((s) => s.target_id).map((s) => [s.target_id!, s.order])
  );

  it("never restores an asset before something it depends on", () => {
    // This is the claim the playback makes visible: you cannot rebuild a table
    // before the thing that feeds it.
    for (const [id, order] of orderOf) {
      for (const parent of adj.upstream.get(id) ?? []) {
        const parentOrder = orderOf.get(parent);
        if (parentOrder === undefined) continue;
        expect(parentOrder, `${parent} must precede ${id}`).toBeLessThan(order);
      }
    }
  });

  it("restores the origin first and resolves last", () => {
    expect(RECOVERY[0].kind).toBe("restore");
    expect(RECOVERY[0].target_id).toBe(SIM.origin);
    expect(RECOVERY[RECOVERY.length - 1].kind).toBe("resolve");
  });

  it("repairs in the reverse of the order things broke", () => {
    // Every step that names a target does so in non-decreasing hop distance.
    const hopOf = new Map(NODES.map((n) => [n.id, n.hops]));
    const hops = RECOVERY.filter((s) => s.target_id).map(
      (s) => hopOf.get(s.target_id!) ?? 0
    );
    expect(hops).toEqual([...hops].sort((a, b) => a - b));
  });
});

/* -------------------------------------------------------------- lineage */

describe("what is at stake, before anything runs", () => {
  const adj = buildAdjacency(DEPS);

  it("walks everything downstream of a component", () => {
    expect(descendants(adj, "stg_payments")).toEqual(
      new Set([
        "fact_payments",
        "daily_revenue",
        "ml_fraud",
        "dash_exec_revenue",
        "team_finance",
      ])
    );
  });

  it("reports nothing downstream of a leaf", () => {
    expect(descendants(adj, "team_finance").size).toBe(0);
  });

  it("measures hop distance the way the engine does", () => {
    const hops = hopDistances(adj, "stg_payments");
    expect(hops.get("stg_payments")).toBe(0);
    expect(hops.get("fact_payments")).toBe(1);
    expect(hops.get("daily_revenue")).toBe(2);
    expect(hops.get("dash_exec_revenue")).toBe(3);
    // Matches the blast radius the engine computed for the same origin.
    for (const n of NODES) {
      if (hops.has(n.id)) expect(hops.get(n.id), n.id).toBe(n.hops);
    }
  });

  it("counts structure without claiming to know what would break", () => {
    const assets: Asset[] = [
      asset("stg_payments", "TRANSFORMATION", "MEDIUM"),
      asset("fact_payments", "WAREHOUSE_TABLE", "HIGH"),
      asset("daily_revenue", "DATA_MODEL", "CRITICAL"),
      asset("ml_fraud", "ML_MODEL", "HIGH"),
      asset("dash_exec_revenue", "DASHBOARD", "CRITICAL"),
      asset("team_finance", "TEAM", "CRITICAL"),
    ];
    const stake = stakeOf(assets, adj, "stg_payments")!;
    expect(stake.reach).toBe(5);
    expect(stake.depth).toBe(4);
    expect(stake.criticalConsumers.map((a) => a.id).sort()).toEqual([
      "dash_exec_revenue",
      "ml_fraud",
    ]);
    expect(stake.teams.map((a) => a.id)).toEqual(["team_finance"]);
  });

  it("has nothing to say about a component that was never chosen", () => {
    expect(stakeOf([], adj, null)).toBeNull();
  });
});

function asset(
  id: string,
  type: Asset["type"],
  criticality: Asset["criticality"]
): Asset {
  return {
    id,
    name: id,
    type,
    system: "Payments",
    criticality,
    owner: "data-eng",
    description: "",
    health_state: "HEALTHY",
    position: null,
  };
}
