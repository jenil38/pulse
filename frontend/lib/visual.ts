/**
 * PULSE — visual language.
 *
 * One source of truth for the state colours, shared by DOM (Tailwind classes)
 * and WebGL (hex values). The metaphor is the product itself:
 *
 *   HEALTHY     smooth flowing data      mineral cyan
 *   RECOVERING  flow gradually returning cool blue
 *   STALE       flow slowed / paused     neutral drift grey
 *   DEGRADED    irregular, slower flow   muted amber
 *   FAILED      broken, stopped flow     restrained red
 */
import type { HealthState, ImpactSeverity, NodeType } from "./types";

export interface StateVisual {
  hex: string;
  dim: string;
  label: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
  /** Particle speed multiplier along edges — the core metaphor. */
  flow: number;
  /** Flow irregularity: 0 = perfectly even, 1 = very stuttery. */
  jitter: number;
}

export const STATE: Record<HealthState, StateVisual> = {
  HEALTHY: {
    hex: "#3FC8BC",
    dim: "#2A8A82",
    label: "Healthy",
    text: "text-healthy",
    bg: "bg-healthy/10",
    border: "border-healthy/30",
    dot: "bg-healthy",
    flow: 1,
    jitter: 0,
  },
  RECOVERING: {
    hex: "#5FA8C8",
    dim: "#3E7189",
    label: "Recovering",
    text: "text-recovering",
    bg: "bg-recovering/10",
    border: "border-recovering/30",
    dot: "bg-recovering",
    flow: 0.55,
    jitter: 0.25,
  },
  STALE: {
    hex: "#7E8A93",
    dim: "#59636A",
    label: "Stale",
    text: "text-stale",
    bg: "bg-stale/10",
    border: "border-stale/30",
    dot: "bg-stale",
    flow: 0.15,
    jitter: 0.5,
  },
  DEGRADED: {
    hex: "#C8933F",
    dim: "#8A6529",
    label: "Degraded",
    text: "text-degraded",
    bg: "bg-degraded/10",
    border: "border-degraded/30",
    dot: "bg-degraded",
    flow: 0.4,
    jitter: 0.8,
  },
  FAILED: {
    hex: "#C85A4E",
    dim: "#8A3E36",
    label: "Failed",
    text: "text-failed",
    bg: "bg-failed/10",
    border: "border-failed/30",
    dot: "bg-failed",
    flow: 0,
    jitter: 0,
  },
};

export const SEVERITY: Record<ImpactSeverity, { label: string; text: string; hex: string }> = {
  NONE: { label: "None", text: "text-ink-mute", hex: "#646E75" },
  LOW: { label: "Low", text: "text-stale", hex: "#7E8A93" },
  MEDIUM: { label: "Medium", text: "text-degraded", hex: "#C8933F" },
  HIGH: { label: "High", text: "text-degraded", hex: "#C8933F" },
  CRITICAL: { label: "Critical", text: "text-failed", hex: "#C85A4E" },
};

/** Short, human labels for node types. */
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

/** Pipeline stage index — used for ordering and layout reasoning. */
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

/** Node geometry treatment (see DESIGN.md §H). */
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

/** Format seconds as a compact freshness string. */
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

/** Resilience score band — never implies false precision. */
export function scoreBand(score: number): { label: string; text: string; hex: string } {
  if (score >= 80) return { label: "Resilient", text: "text-healthy", hex: "#3FC8BC" };
  if (score >= 60) return { label: "Moderate", text: "text-degraded", hex: "#C8933F" };
  return { label: "Fragile", text: "text-failed", hex: "#C85A4E" };
}
