/**
 * PULSE landing — camera path & story state.
 *
 * Pure math, deliberately separated from the R3F render code so the scroll
 * choreography can be unit-tested without a WebGL context.
 */

export interface CameraKey {
  at: number;
  pos: [number, number, number];
  look: [number, number, number];
}

/** Camera keyframes per scene, interpolated by scroll progress. */
export const CAMERA_KEYS: CameraKey[] = [
  { at: 0.0, pos: [0, 0, 26], look: [0, 0, 0] },          // 1 pinhole on one node
  { at: 0.12, pos: [-40, 14, 90], look: [-30, 4, 0] },    // 2 sources appear
  { at: 0.26, pos: [-14, 20, 96], look: [-6, 0, 0] },     // 3 flow along the pipe
  { at: 0.38, pos: [-6, 62, 196], look: [10, 0, 0] },     // 4 healthy whole system
  { at: 0.5, pos: [-46, 24, 74], look: [-42, 8, -34] },   // 5 failure at the source
  { at: 0.64, pos: [0, 78, 232], look: [10, 0, 0] },      // 6 blast radius pull-back
  { at: 0.76, pos: [30, 34, 130], look: [52, 0, -10] },   // 7 business impact
  { at: 0.88, pos: [-10, 56, 186], look: [10, 0, 0] },    // 8 recovery
  { at: 1.0, pos: [-6, 66, 210], look: [10, 0, 0] },      // 9 settle wide
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smoothstep — weighted, damped movement between beats (no bounce). */
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface CameraPose {
  pos: [number, number, number];
  look: [number, number, number];
}

/** Interpolated camera pose at scroll progress `p` (0..1). */
export function cameraAt(p: number, keys: CameraKey[] = CAMERA_KEYS): CameraPose {
  const clamped = Math.min(Math.max(p, 0), 1);
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (clamped >= keys[i].at && clamped <= keys[i + 1].at) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const span = b.at - a.at || 1;
  const e = smooth(Math.min(Math.max((clamped - a.at) / span, 0), 1));
  return {
    pos: [
      lerp(a.pos[0], b.pos[0], e),
      lerp(a.pos[1], b.pos[1], e),
      lerp(a.pos[2], b.pos[2], e),
    ],
    look: [
      lerp(a.look[0], b.look[0], e),
      lerp(a.look[1], b.look[1], e),
      lerp(a.look[2], b.look[2], e),
    ],
  };
}

export interface StoryState {
  /** How much of the topology has appeared (0..1, by pipeline stage). */
  reveal: number;
  /** How far the failure has propagated (0..1 across hops). */
  failure: number;
  /** How far recovery has swept back (0..1). */
  recovery: number;
}

/**
 * Story phases, aligned to the scene boundaries in `scenes.ts`:
 *
 *   reveal    0.08 → 0.34   scenes 2-3 build the system, complete as scene 4 opens
 *   failure   0.46 → 0.70   scenes 5-6 propagate, complete as scene 7 opens
 *   recovery  0.82 → 0.95   scene 8 heals, complete before scene 9
 *
 * Each phase finishes exactly when the scene that *depends* on it begins, so
 * the "healthy system", "full blast radius" and "recovered" beats are settled
 * while their copy is on screen — and floating-point dust near a boundary can
 * never leave the furthest node one epsilon short of affected.
 */
function phase(p: number, start: number, end: number): number {
  if (p <= start) return 0;
  if (p >= end) return 1;
  return (p - start) / (end - start);
}

export function storyState(p: number): StoryState {
  const clamped = Math.min(Math.max(p, 0), 1);
  return {
    reveal: phase(clamped, 0.08, 0.34),
    failure: phase(clamped, 0.46, 0.7),
    recovery: phase(clamped, 0.82, 0.95),
  };
}

/**
 * Health state of a node at a point in the story, given its hop distance from
 * the failure origin. `hops === undefined` means the node is outside the blast
 * radius and therefore never affected.
 */
export function storyNodeState(
  hops: number | undefined,
  maxHop: number,
  s: StoryState
): "HEALTHY" | "RECOVERING" | "AFFECTED" {
  if (hops === undefined) return "HEALTHY";
  const reachedAt = hops / Math.max(maxHop, 1);
  if (s.recovery > 0) {
    return s.recovery >= reachedAt * 0.9 + 0.1 ? "HEALTHY" : "RECOVERING";
  }
  return s.failure >= reachedAt ? "AFFECTED" : "HEALTHY";
}
