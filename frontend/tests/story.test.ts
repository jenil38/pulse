/**
 * Landing camera-path & story-state tests.
 *
 * The browser could not be used to visually verify scenes 3–9 during
 * development, so these tests pin down the properties that would otherwise
 * break silently: a continuous camera path, no NaNs, and story phases that
 * actually reach their end states in the right order.
 */
import { describe, expect, it } from "vitest";

import {
  CAMERA_KEYS,
  cameraAt,
  storyNodeState,
  storyState,
} from "../lib/story";
import { SCENES } from "../components/marketing/scenes";

const dist = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("camera keyframes", () => {
  it("covers the full scroll range in ascending order", () => {
    expect(CAMERA_KEYS[0].at).toBe(0);
    expect(CAMERA_KEYS[CAMERA_KEYS.length - 1].at).toBe(1);
    for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
      expect(CAMERA_KEYS[i + 1].at).toBeGreaterThan(CAMERA_KEYS[i].at);
    }
  });

  it("has one keyframe per scene", () => {
    expect(CAMERA_KEYS).toHaveLength(SCENES.length);
  });

  it("never produces NaN across the whole scroll", () => {
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const { pos, look } = cameraAt(p);
      for (const v of [...pos, ...look]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("hits each keyframe exactly at its scroll position", () => {
    for (const k of CAMERA_KEYS) {
      const { pos } = cameraAt(k.at);
      expect(dist(pos, k.pos)).toBeLessThan(0.001);
    }
  });

  it("moves continuously — no camera teleports between frames", () => {
    // A large jump would read as a hard cut rather than a damped move. The
    // fastest legitimate move is the scene 5->6 blast-radius pull-back; this
    // threshold sits just above it so any *new* abrupt cut fails the test.
    let prev = cameraAt(0).pos;
    let maxStep = 0;
    for (let p = 0.005; p <= 1.0001; p += 0.005) {
      const cur = cameraAt(p).pos;
      maxStep = Math.max(maxStep, dist(prev, cur));
      prev = cur;
    }
    expect(maxStep).toBeLessThan(11);
  });

  it("makes the blast-radius pull-back the film's largest move", () => {
    // Scene 6 is the moment the consequence becomes visible — it should be the
    // biggest camera gesture in the story, not an incidental transition.
    const spans = CAMERA_KEYS.slice(0, -1).map((k, i) =>
      dist(k.pos, CAMERA_KEYS[i + 1].pos)
    );
    const biggest = spans.indexOf(Math.max(...spans));
    // Index 4 == the segment ending at the scene-6 keyframe (at: 0.64).
    expect(CAMERA_KEYS[biggest + 1].at).toBe(0.64);
  });

  it("starts close in and ends pulled back", () => {
    // Scene 1 is a pinhole; scene 9 is a wide settle.
    const start = cameraAt(0).pos;
    const end = cameraAt(1).pos;
    expect(Math.abs(start[2])).toBeLessThan(40);
    expect(end[2]).toBeGreaterThan(150);
  });

  it("pulls back for the blast-radius reveal", () => {
    // Scene 6 must be further out than scene 5 (the close-in failure shot).
    const failure = cameraAt(0.5).pos;
    const blast = cameraAt(0.64).pos;
    expect(blast[2]).toBeGreaterThan(failure[2]);
  });
});

describe("story state", () => {
  it("starts with nothing revealed, nothing broken", () => {
    const s = storyState(0);
    expect(s.reveal).toBe(0);
    expect(s.failure).toBe(0);
    expect(s.recovery).toBe(0);
  });

  it("fully reveals the system before the failure begins", () => {
    // Scene 4 shows a complete, healthy system.
    const atHealthy = storyState(0.4);
    expect(atHealthy.reveal).toBe(1);
    expect(atHealthy.failure).toBe(0);
  });

  it("propagates the failure fully before recovery starts", () => {
    const atBlast = storyState(0.72);
    expect(atBlast.failure).toBe(1);
    expect(atBlast.recovery).toBe(0);
  });

  it("completes recovery by the final scene", () => {
    const atEnd = storyState(1);
    expect(atEnd.recovery).toBe(1);
  });

  it("is monotonic in each phase", () => {
    let prev = storyState(0);
    for (let p = 0.01; p <= 1.0001; p += 0.01) {
      const cur = storyState(p);
      expect(cur.reveal).toBeGreaterThanOrEqual(prev.reveal - 1e-9);
      expect(cur.failure).toBeGreaterThanOrEqual(prev.failure - 1e-9);
      expect(cur.recovery).toBeGreaterThanOrEqual(prev.recovery - 1e-9);
      prev = cur;
    }
  });
});

describe("story node state", () => {
  const maxHop = 5;

  it("leaves nodes outside the blast radius healthy throughout", () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      expect(storyNodeState(undefined, maxHop, storyState(p))).toBe("HEALTHY");
    }
  });

  it("breaks the origin before distant nodes", () => {
    // Just after the failure begins, hop 0 is hit but hop 5 is not.
    const early = storyState(0.5);
    expect(storyNodeState(0, maxHop, early)).toBe("AFFECTED");
    expect(storyNodeState(5, maxHop, early)).toBe("HEALTHY");
  });

  it("affects the entire blast radius once propagation completes", () => {
    const settled = storyState(0.72);
    for (let h = 0; h <= maxHop; h++) {
      expect(storyNodeState(h, maxHop, settled)).toBe("AFFECTED");
    }
  });

  it("returns every affected node to healthy by the end", () => {
    const done = storyState(1);
    for (let h = 0; h <= maxHop; h++) {
      expect(storyNodeState(h, maxHop, done)).toBe("HEALTHY");
    }
  });

  it("passes through RECOVERING on the way back", () => {
    const mid = storyState(0.84);
    const states = Array.from({ length: maxHop + 1 }, (_, h) =>
      storyNodeState(h, maxHop, mid)
    );
    expect(states).toContain("RECOVERING");
  });
});
