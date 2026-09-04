/**
 * PULSE — label placement.
 *
 * Which node labels the topology can actually afford to draw.
 *
 * Deciding a node *deserves* a label is a data question and lives with the
 * scene. Deciding whether there is *room* for it is pure geometry over screen
 * rectangles, so it lives here where it can be tested without a WebGL context.
 */

/** A label's box on screen: centre, half-width, half-height, all in pixels. */
export interface ScreenLabel {
  id: string;
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/** Never draw more than this many at once, however sparse the graph looks. */
export const MAX_LABELS = 24;

/**
 * Approximate a label's unscaled size in CSS pixels.
 *
 * Measuring the real DOM node would mean a layout read per label per frame.
 * The labels are one line of 11px text in a known box, so deriving the width
 * from the character count is both cheap and close enough — collision culling
 * only needs to know roughly how much room a name asks for. Long names are
 * clamped because the label itself is capped by the layout.
 */
export function labelSize(name: string): [width: number, height: number] {
  return [Math.min(name.length, 28) * 6.4 + 12, 16];
}

/**
 * Greedy non-overlapping placement, best-first.
 *
 * `labels` must already be ordered by importance: the first entry always gets
 * drawn, and any later one that would overlap something already placed is
 * dropped. Overlapping labels are worse than a missing label — they sit
 * between two nodes and misattribute a name to the wrong one — so when two
 * cannot both be drawn, the more important one wins outright rather than both
 * being nudged into a compromise position.
 */
export function placeWithoutOverlap(
  labels: ScreenLabel[],
  max: number = MAX_LABELS
): Set<string> {
  const placed: ScreenLabel[] = [];
  const keep = new Set<string>();

  for (const l of labels) {
    if (keep.size >= max) break;
    const clashes = placed.some(
      (o) => Math.abs(o.x - l.x) < o.hw + l.hw && Math.abs(o.y - l.y) < o.hh + l.hh
    );
    if (clashes) continue;
    placed.push(l);
    keep.add(l.id);
  }

  return keep;
}
