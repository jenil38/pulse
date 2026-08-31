/**
 * The nine-scene landing story (DESIGN.md §I).
 * `start`/`end` are scroll-progress windows; text fades within its own window.
 */
export interface Scene {
  id: number;
  start: number;
  end: number;
  eyebrow?: string;
  title?: string;
  body?: string;
  /** Large centred statement instead of a titled block. */
  statement?: string;
  align: "center" | "left" | "right";
}

export const SCENES: Scene[] = [
  {
    id: 1,
    start: 0.0,
    end: 0.1,
    eyebrow: "Data Resilience Digital Twin",
    title: "PULSE",
    body: "See failure before it spreads.",
    align: "center",
  },
  {
    id: 2,
    start: 0.1,
    end: 0.22,
    eyebrow: "Scene 02 — Sources",
    statement: "Every business runs on data it did not write.",
    body: "Orders · Payments · Inventory · Customers · Marketing",
    align: "left",
  },
  {
    id: 3,
    start: 0.22,
    end: 0.34,
    eyebrow: "Scene 03 — Flow",
    statement: "Ingested. Landed. Transformed. Modelled.",
    body: "Data moves through dependencies most teams never see.",
    align: "left",
  },
  {
    id: 4,
    start: 0.34,
    end: 0.46,
    eyebrow: "Scene 04 — Healthy",
    statement: "Your business runs on invisible dependencies.",
    body: "43 assets. 47 dependencies. One system.",
    align: "center",
  },
  {
    id: 5,
    start: 0.46,
    end: 0.58,
    eyebrow: "Scene 05 — Failure",
    statement: "Then one source stops answering.",
    body: "Payments API — source outage. The flow stops at the origin.",
    align: "right",
  },
  {
    id: 6,
    start: 0.58,
    end: 0.7,
    eyebrow: "Scene 06 — Blast radius",
    statement: "Failure does not stay where it starts.",
    body: "11 downstream assets affected. Staleness travels the graph.",
    align: "center",
  },
  {
    id: 7,
    start: 0.7,
    end: 0.82,
    eyebrow: "Scene 07 — Business impact",
    statement: "A broken column can become a broken decision.",
    body: "Executive Revenue Dashboard → Finance Team.",
    align: "right",
  },
  {
    id: 8,
    start: 0.82,
    end: 0.93,
    eyebrow: "Scene 08 — Recovery",
    statement: "Recovery has an order. PULSE computes it.",
    body: "Restore the source. Validate. Backfill. Rebuild. Verify.",
    align: "left",
  },
  {
    id: 9,
    start: 0.93,
    end: 1.0,
    eyebrow: "PULSE",
    statement: "Map. Break. Understand. Recover.",
    body: "Break your data system before reality does.",
    align: "center",
  },
];
