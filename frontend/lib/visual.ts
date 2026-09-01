/**
 * PULSE — state visual language.
 *
 * THE RULE: interface chrome is neutral. Hue appears only for system state or
 * the single accent on a primary action. So when a row turns amber, that colour
 * carries meaning rather than decoration.
 *
 * Each state is a TRIAD (text/dot · border · tint background) rather than a
 * solid colour block — the pattern that keeps status legible and quiet at the
 * same time. Class names resolve to CSS variables, so every state automatically
 * re-tunes for chaos mode without a second definition here.
 *
 * The metaphor stays the product itself:
 *   HEALTHY     smooth flowing data       steady
 *   RECOVERING  flow gradually returning  resuming
 *   STALE       flow slowed / paused      faded
 *   DEGRADED    irregular, slower flow    stuttering
 *   FAILED      broken, stopped flow      halted
 */
import type { HealthState, ImpactSeverity, NodeType } from "./types";

export interface StateVisual {
  label: string;
  /** Text + dot colour. */
  text: string;
  dot: string;
  /** Tint background + border, for chips and inline status. */
  chip: string;
  /** CSS variable name, for WebGL colour resolution. */
  varName: string;
  /** Particle speed multiplier along edges — the core metaphor. */
  flow: number;
  /** Flow irregularity: 0 = perfectly even, 1 = very stuttery. */
  jitter: number;
}

export const STATE: Record<HealthState, StateVisual> = {
  HEALTHY: {
    label: "Healthy",
    text: "text-healthy",
    dot: "bg-healthy",
    chip: "bg-healthy-bg border-healthy-border text-healthy",
    varName: "healthy",
    flow: 1,
    jitter: 0,
  },
  RECOVERING: {
    label: "Recovering",
    text: "text-recovering",
    dot: "bg-recovering",
    chip: "bg-recovering-bg border-recovering-border text-recovering",
    varName: "recovering",
    flow: 0.55,
    jitter: 0.25,
  },
  STALE: {
    label: "Stale",
    text: "text-stale",
    dot: "bg-stale",
    chip: "bg-stale-bg border-stale-border text-stale",
    varName: "stale",
    flow: 0.15,
    jitter: 0.5,
  },
  DEGRADED: {
    label: "Degraded",
    text: "text-degraded",
    dot: "bg-degraded",
    chip: "bg-degraded-bg border-degraded-border text-degraded",
    varName: "degraded",
    flow: 0.4,
    jitter: 0.8,
  },
  FAILED: {
    label: "Failed",
    text: "text-failed",
    dot: "bg-failed",
    chip: "bg-failed-bg border-failed-border text-failed",
    varName: "failed",
    flow: 0,
    jitter: 0,
  },
};

export const SEVERITY: Record<
  ImpactSeverity,
  { label: string; text: string; chip: string }
> = {
  NONE: { label: "None", text: "text-quaternary", chip: "bg-subtle border-border text-tertiary" },
  LOW: { label: "Low", text: "text-tertiary", chip: "bg-stale-bg border-stale-border text-stale" },
  MEDIUM: {
    label: "Medium",
    text: "text-degraded",
    chip: "bg-degraded-bg border-degraded-border text-degraded",
  },
  HIGH: {
    label: "High",
    text: "text-degraded",
    chip: "bg-degraded-bg border-degraded-border text-degraded",
  },
  CRITICAL: {
    label: "Critical",
    text: "text-failed",
    chip: "bg-failed-bg border-failed-border text-failed",
  },
};

/** Sentence case — labels inform, they don't shout. */
export const NODE_LABEL: Record<NodeType, string> = {
  SOURCE: "Source",
  INGESTION: "Ingestion",
  RAW_TABLE: "Raw table",
  TRANSFORMATION: "Transformation",
  WAREHOUSE_TABLE: "Warehouse table",
  DATA_MODEL: "Data model",
  DASHBOARD: "Dashboard",
  ML_MODEL: "ML model",
  BUSINESS_PROCESS: "Business process",
  TEAM: "Team",
};

/** Compact form for dense table cells. */
export const NODE_ABBR: Record<NodeType, string> = {
  SOURCE: "Source",
  INGESTION: "Ingest",
  RAW_TABLE: "Raw",
  TRANSFORMATION: "Transform",
  WAREHOUSE_TABLE: "Warehouse",
  DATA_MODEL: "Model",
  DASHBOARD: "Dashboard",
  ML_MODEL: "ML",
  BUSINESS_PROCESS: "Process",
  TEAM: "Team",
};

/** Pipeline stage order — data flows in this direction. */
export const STAGE_ORDER: NodeType[] = [
  "SOURCE",
  "INGESTION",
  "RAW_TABLE",
  "TRANSFORMATION",
  "WAREHOUSE_TABLE",
  "DATA_MODEL",
  "DASHBOARD",
  "ML_MODEL",
  "BUSINESS_PROCESS",
  "TEAM",
];

/** The six stages shown in the topology's flow legend. */
export const PIPELINE_STAGES: { label: string; types: NodeType[] }[] = [
  { label: "Source", types: ["SOURCE"] },
  { label: "Ingestion", types: ["INGESTION"] },
  { label: "Transformation", types: ["RAW_TABLE", "TRANSFORMATION"] },
  { label: "Warehouse", types: ["WAREHOUSE_TABLE"] },
  { label: "Model", types: ["DATA_MODEL"] },
  { label: "Consumer", types: ["DASHBOARD", "ML_MODEL", "BUSINESS_PROCESS", "TEAM"] },
];

export type NodeShape =
  | "octahedron"
  | "connector"
  | "block"
  | "slab"
  | "lens"
  | "plane"
  | "sphere"
  | "marker";

export const NODE_SHAPE: Record<NodeType, NodeShape> = {
  SOURCE: "octahedron",
  INGESTION: "connector",
  RAW_TABLE: "block",
  TRANSFORMATION: "connector",
  WAREHOUSE_TABLE: "slab",
  DATA_MODEL: "lens",
  DASHBOARD: "plane",
  ML_MODEL: "sphere",
  BUSINESS_PROCESS: "marker",
  TEAM: "marker",
};

export const CRITICALITY_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;

export const CRITICALITY_LABEL = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
} as const;

/** Compact freshness string. */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Relative time for incident lists. */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

/** Resilience band — never implies false precision. */
export function scoreBand(score: number): { label: string; text: string } {
  if (score >= 80) return { label: "Resilient", text: "text-healthy" };
  if (score >= 60) return { label: "Moderate", text: "text-degraded" };
  return { label: "Fragile", text: "text-failed" };
}
