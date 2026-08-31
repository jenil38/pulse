/**
 * Frontend logic tests.
 *
 * These cover the pure functions that drive the visual language and the scroll
 * choreography — the parts where a silent regression would change what the
 * product *communicates* (a wrong state colour, a scene that never appears).
 *
 * Run:  npm test
 */
import { describe, expect, it } from "vitest";

import { envelope, sceneProgress } from "../hooks/useScrollProgress";
import {
  CRITICALITY_RANK,
  NODE_SHAPE,
  STAGE_ORDER,
  STATE,
  formatAge,
  formatCount,
  scoreBand,
} from "../lib/visual";
import { SCENES } from "../components/marketing/scenes";
import type { HealthState } from "../lib/types";

// --------------------------------------------------------------------------
//  Visual language
// --------------------------------------------------------------------------
describe("state visual language", () => {
  const states: HealthState[] = [
    "HEALTHY",
    "RECOVERING",
    "STALE",
    "DEGRADED",
    "FAILED",
  ];

  it("defines every health state", () => {
    for (const s of states) expect(STATE[s]).toBeDefined();
  });

  it("encodes the flow metaphor: healthy flows, failed does not", () => {
    // This is the product's core visual claim — guard it.
    expect(STATE.HEALTHY.flow).toBe(1);
    expect(STATE.HEALTHY.jitter).toBe(0);
    expect(STATE.FAILED.flow).toBe(0);
    // Degraded flows, but irregularly and slower than healthy.
    expect(STATE.DEGRADED.flow).toBeLessThan(STATE.HEALTHY.flow);
    expect(STATE.DEGRADED.jitter).toBeGreaterThan(0);
    // Stale is slower still than degraded.
    expect(STATE.STALE.flow).toBeLessThan(STATE.DEGRADED.flow);
    // Recovery is partial flow returning.
    expect(STATE.RECOVERING.flow).toBeGreaterThan(0);
    expect(STATE.RECOVERING.flow).toBeLessThan(STATE.HEALTHY.flow);
  });

  it("uses the confirmed PULSE palette, not the reference site's", () => {
    expect(STATE.HEALTHY.hex).toBe("#3FC8BC"); // mineral cyan
    expect(STATE.DEGRADED.hex).toBe("#C8933F"); // muted amber
    expect(STATE.FAILED.hex).toBe("#C85A4E"); // restrained red
  });

  it("assigns a distinct geometry to every node type", () => {
    for (const t of STAGE_ORDER) expect(NODE_SHAPE[t]).toBeTruthy();
    // Sources and dashboards must not look alike.
    expect(NODE_SHAPE.SOURCE).not.toBe(NODE_SHAPE.DASHBOARD);
  });

  it("orders criticality correctly", () => {
    expect(CRITICALITY_RANK.CRITICAL).toBeGreaterThan(CRITICALITY_RANK.HIGH);
    expect(CRITICALITY_RANK.HIGH).toBeGreaterThan(CRITICALITY_RANK.MEDIUM);
    expect(CRITICALITY_RANK.MEDIUM).toBeGreaterThan(CRITICALITY_RANK.LOW);
  });
});

// --------------------------------------------------------------------------
//  Formatting
// --------------------------------------------------------------------------
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

  it("bands the resilience score without implying false precision", () => {
    expect(scoreBand(92).label).toBe("Resilient");
    expect(scoreBand(65).label).toBe("Moderate"); // our actual demo score
    expect(scoreBand(30).label).toBe("Fragile");
  });
});

// --------------------------------------------------------------------------
//  Scroll choreography
// --------------------------------------------------------------------------
describe("scroll choreography", () => {
  it("maps global progress into a scene window", () => {
    expect(sceneProgress(0.0, 0.2, 0.4)).toBe(0);
    expect(sceneProgress(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(sceneProgress(0.9, 0.2, 0.4)).toBe(1);
  });

  it("keeps the opening scene visible before any scrolling", () => {
    // Regression guard: with a fade-in the hero was invisible at progress 0.
    expect(envelope(0, 0, 0.72)).toBe(1);
  });

  it("fades later scenes in and out", () => {
    expect(envelope(0, 0.22, 0.72)).toBe(0);
    expect(envelope(0.5, 0.22, 0.72)).toBe(1);
    expect(envelope(1, 0.22, 0.72)).toBe(0);
  });

  it("covers the whole scroll range with contiguous scenes", () => {
    expect(SCENES).toHaveLength(9);
    expect(SCENES[0].start).toBe(0);
    expect(SCENES[SCENES.length - 1].end).toBe(1);
    for (let i = 0; i < SCENES.length - 1; i++) {
      // No gaps: a scene ends exactly where the next begins.
      expect(SCENES[i].end).toBeCloseTo(SCENES[i + 1].start);
      expect(SCENES[i].end).toBeGreaterThan(SCENES[i].start);
    }
  });

  it("gives every scene something to say", () => {
    for (const s of SCENES) {
      expect(s.title || s.statement).toBeTruthy();
    }
  });
});
