/**
 * Design-system and formatting tests.
 *
 * These guard the places where a silent regression would change what the
 * product *communicates* — the state language, the discipline that keeps the
 * UI from drifting back toward generic dashboard styling, and the number
 * formatting a data engineer reads at a glance.
 */
import { describe, expect, it } from "vitest";

import {
  CRITICALITY_RANK,
  NODE_ABBR,
  NODE_LABEL,
  NODE_SHAPE,
  PIPELINE_STAGES,
  SEVERITY,
  STAGE_ORDER,
  STATE,
  formatAge,
  formatCount,
  formatDuration,
  scoreBand,
} from "../lib/visual";
import type { HealthState, ImpactSeverity, NodeType } from "../lib/types";

const STATES: HealthState[] = [
  "HEALTHY",
  "RECOVERING",
  "STALE",
  "DEGRADED",
  "FAILED",
];

describe("state language", () => {
  it("defines every health state", () => {
    for (const s of STATES) expect(STATE[s]).toBeDefined();
  });

  it("encodes the flow metaphor: healthy flows, failed does not", () => {
    // The product's core visual claim — guard it.
    expect(STATE.HEALTHY.flow).toBe(1);
    expect(STATE.HEALTHY.jitter).toBe(0);
    expect(STATE.FAILED.flow).toBe(0);
    // Degraded flows, but slower and irregularly.
    expect(STATE.DEGRADED.flow).toBeLessThan(STATE.HEALTHY.flow);
    expect(STATE.DEGRADED.jitter).toBeGreaterThan(0);
    // Stale is slower still.
    expect(STATE.STALE.flow).toBeLessThan(STATE.DEGRADED.flow);
    // Recovery is partial flow returning.
    expect(STATE.RECOVERING.flow).toBeGreaterThan(0);
    expect(STATE.RECOVERING.flow).toBeLessThan(STATE.HEALTHY.flow);
  });

  it("resolves colour through design tokens, never hard-coded hex", () => {
    // Hard-coded hex would break chaos mode, where every state re-tunes.
    for (const s of STATES) {
      expect(STATE[s].varName).toBeTruthy();
      expect(STATE[s].text).toMatch(/^text-/);
      expect(STATE[s].dot).toMatch(/^bg-/);
      expect(JSON.stringify(STATE[s])).not.toMatch(/#[0-9a-f]{6}/i);
    }
  });

  it("renders every state as a tint triad, not a solid block", () => {
    for (const s of STATES) {
      expect(STATE[s].chip).toMatch(/bg-/);
      expect(STATE[s].chip).toMatch(/border-/);
      expect(STATE[s].chip).toMatch(/text-/);
    }
  });

  it("keeps severity chips restrained and token-driven", () => {
    const severities: ImpactSeverity[] = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
    for (const s of severities) {
      expect(SEVERITY[s].label).toBeTruthy();
      expect(JSON.stringify(SEVERITY[s])).not.toMatch(/#[0-9a-f]{6}/i);
    }
    // Only the most severe level is allowed to use the failure colour.
    expect(SEVERITY.CRITICAL.text).toBe("text-failed");
    expect(SEVERITY.LOW.text).not.toBe("text-failed");
  });
});

describe("labels and geometry", () => {
  it("labels every node type in sentence case, not shouty caps", () => {
    for (const t of STAGE_ORDER) {
      expect(NODE_LABEL[t]).toBeTruthy();
      expect(NODE_ABBR[t]).toBeTruthy();
      // "Raw table", not "RAW TABLE".
      expect(NODE_LABEL[t]).not.toBe(NODE_LABEL[t].toUpperCase());
    }
  });

  it("assigns a distinct geometry to every node type", () => {
    for (const t of STAGE_ORDER) expect(NODE_SHAPE[t]).toBeTruthy();
    // Sources and dashboards must not look alike.
    expect(NODE_SHAPE.SOURCE).not.toBe(NODE_SHAPE.DASHBOARD);
  });

  it("covers every node type in the pipeline legend", () => {
    const covered = new Set<NodeType>();
    for (const s of PIPELINE_STAGES) s.types.forEach((t) => covered.add(t));
    for (const t of STAGE_ORDER) expect(covered.has(t)).toBe(true);
  });

  it("orders criticality correctly", () => {
    expect(CRITICALITY_RANK.CRITICAL).toBeGreaterThan(CRITICALITY_RANK.HIGH);
    expect(CRITICALITY_RANK.HIGH).toBeGreaterThan(CRITICALITY_RANK.MEDIUM);
    expect(CRITICALITY_RANK.MEDIUM).toBeGreaterThan(CRITICALITY_RANK.LOW);
  });
});

describe("formatting", () => {
  it("formats freshness ages", () => {
    expect(formatAge(45)).toBe("45s");
    expect(formatAge(300)).toBe("5m");
    expect(formatAge(7200)).toBe("2.0h");
    expect(formatAge(172800)).toBe("2.0d");
  });

  it("formats row counts", () => {
    expect(formatCount(842)).toBe("842");
    expect(formatCount(42000)).toBe("42.0k");
    expect(formatCount(2_500_000)).toBe("2.5M");
  });

  it("formats timeline durations", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(75)).toBe("01:15");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("bands the resilience score without implying false precision", () => {
    expect(scoreBand(92).label).toBe("Resilient");
    expect(scoreBand(65).label).toBe("Moderate"); // our actual demo score
    expect(scoreBand(30).label).toBe("Fragile");
  });
});
