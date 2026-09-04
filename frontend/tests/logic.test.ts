/**
 * Design-system and formatting tests.
 *
 * These guard the places where a silent regression would change what the
 * product *communicates* — the state language, the discipline that keeps the
 * UI from drifting back toward generic dashboard styling, and the number
 * formatting a data engineer reads at a glance.
 */
import { describe, expect, it } from "vitest";

import { resolveAsyncState } from "../components/ui/AsyncState";
import {
  MAX_LABELS,
  labelSize,
  placeWithoutOverlap,
  type ScreenLabel,
} from "../lib/labels";

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

// ---------------------------------------------------------------------------
//  Async state precedence
// ---------------------------------------------------------------------------
describe("async state precedence", () => {
  it("shows an error rather than an empty state when a request failed", () => {
    // The regression this guards: a failed /incidents call rendering
    // "No incidents", which tells the user their system is fine when it is not.
    expect(
      resolveAsyncState({ loading: false, hasError: true, hasData: false, isEmpty: false })
    ).toBe("error");
    // Even if data arrived earlier and is now empty, a live error still wins.
    expect(
      resolveAsyncState({ loading: false, hasError: true, hasData: true, isEmpty: true })
    ).toBe("error");
  });

  it("shows empty only when the request genuinely succeeded with no rows", () => {
    expect(
      resolveAsyncState({ loading: false, hasError: false, hasData: true, isEmpty: true })
    ).toBe("empty");
  });

  it("shows loading before any data has arrived", () => {
    expect(
      resolveAsyncState({ loading: true, hasError: false, hasData: false, isEmpty: false })
    ).toBe("loading");
  });

  it("keeps showing content while a background refresh is in flight", () => {
    expect(
      resolveAsyncState({ loading: true, hasError: false, hasData: true, isEmpty: false })
    ).toBe("content");
  });

  it("keeps content on screen when a refresh fails but data is still good", () => {
    // The page should not be wiped; the failure surfaces as a banner instead.
    expect(
      resolveAsyncState({ loading: false, hasError: true, hasData: true, isEmpty: false })
    ).toBe("content");
  });
});

/**
 * Topology label placement.
 *
 * Two nodes far apart in the graph can land on top of each other on screen.
 * Overlapping labels are worse than a missing one: the text sits between two
 * nodes and reads as belonging to whichever the eye picks. So the placement
 * pass drops the less important label rather than drawing both.
 */
describe("topology label placement", () => {
  const box = (id: string, x: number, y: number, hw = 30, hh = 10): ScreenLabel => ({
    id,
    x,
    y,
    hw,
    hh,
  });

  it("keeps labels that do not touch", () => {
    const kept = placeWithoutOverlap([box("a", 0, 0), box("b", 200, 0), box("c", 0, 200)]);
    expect([...kept].sort()).toEqual(["a", "b", "c"]);
  });

  it("drops the later label when two would overlap", () => {
    // 10px apart horizontally with 30px half-widths — they collide.
    const kept = placeWithoutOverlap([box("first", 0, 0), box("second", 10, 0)]);
    expect(kept.has("first")).toBe(true);
    expect(kept.has("second")).toBe(false);
  });

  it("resolves a collision in favour of the more important label", () => {
    // The caller sorts by importance, so order IS priority. The same pair in
    // the opposite order must keep the other one — nothing else decides it.
    expect(placeWithoutOverlap([box("selected", 0, 0), box("healthy", 8, 0)])).toEqual(
      new Set(["selected"])
    );
    expect(placeWithoutOverlap([box("healthy", 8, 0), box("selected", 0, 0)])).toEqual(
      new Set(["healthy"])
    );
  });

  it("separates labels that clash on one axis but clear on the other", () => {
    // Same x, far apart in y: no collision, because the boxes are rectangles
    // and not radii.
    const kept = placeWithoutOverlap([box("top", 0, 0), box("bottom", 0, 100)]);
    expect(kept.size).toBe(2);
  });

  it("never draws more than the cap, however sparse the graph", () => {
    // 60 labels spread far enough apart that none of them collide.
    const many = Array.from({ length: 60 }, (_, i) => box(`n${i}`, i * 500, 0));
    expect(placeWithoutOverlap(many).size).toBe(MAX_LABELS);
  });

  it("asks for more room for a longer name", () => {
    const [short] = labelSize("DB");
    const [long] = labelSize("Marketing Attribution Model");
    expect(long).toBeGreaterThan(short);
  });

  it("clamps the width a very long name can claim", () => {
    // Otherwise one pathological name would suppress every label near it.
    const [capped] = labelSize("x".repeat(200));
    const [atLimit] = labelSize("x".repeat(28));
    expect(capped).toBe(atLimit);
  });
});
