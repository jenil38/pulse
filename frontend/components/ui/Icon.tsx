"use client";

import type { NodeType } from "@/lib/types";

/**
 * Icon set — inline SVG, no dependency.
 *
 * 16px grid, 1.5px strokes, round caps, `currentColor`. Geometric and
 * technical rather than playful: these are instrument markings, not stickers.
 * Node-type icons deliberately echo the 3D geometry so the map and the lists
 * read as the same system.
 */
export type IconName =
  | "room"
  | "chaos"
  | "incident"
  | "compare"
  | "search"
  | "close"
  | "chevronRight"
  | "chevronDown"
  | "arrowRight"
  | "arrowUp"
  | "arrowDown"
  | "play"
  | "pause"
  | "reset"
  | "trace"
  | "check"
  | "warning"
  | "filter"
  | "external";

const PATHS: Record<IconName, React.ReactNode> = {
  // Layered plates — the system map
  room: (
    <>
      <path d="M2 5.5 8 2.5l6 3-6 3-6-3Z" />
      <path d="m2 10.5 6 3 6-3" />
      <path d="m2 8 6 3 6-3" />
    </>
  ),
  // A break in a line — failure injection
  chaos: (
    <>
      <path d="M1.5 8h4" />
      <path d="M10.5 8h4" />
      <path d="m8.5 3.5-2 4h3l-2 5" />
    </>
  ),
  // Alert diamond
  incident: (
    <>
      <path d="M8 1.75 14.25 8 8 14.25 1.75 8 8 1.75Z" />
      <path d="M8 5.5v3" />
      <path d="M8 10.75h.01" />
    </>
  ),
  // Two bars, side by side
  compare: (
    <>
      <path d="M4 13V6" />
      <path d="M8 13V3" />
      <path d="M12 13V8" />
    </>
  ),
  search: (
    <>
      <circle cx="7.25" cy="7.25" r="4.25" />
      <path d="m10.5 10.5 3 3" />
    </>
  ),
  close: (
    <>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </>
  ),
  chevronRight: <path d="m6.5 4 4 4-4 4" />,
  chevronDown: <path d="m4 6.5 4 4 4-4" />,
  arrowRight: (
    <>
      <path d="M2.5 8h11" />
      <path d="m9.5 4 4 4-4 4" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M8 13V3" />
      <path d="m4 7 4-4 4 4" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M8 3v10" />
      <path d="m4 9 4 4 4-4" />
    </>
  ),
  play: <path d="M5 3.5 12.5 8 5 12.5v-9Z" />,
  pause: (
    <>
      <path d="M5.75 3.5v9" />
      <path d="M10.25 3.5v9" />
    </>
  ),
  reset: (
    <>
      <path d="M3 8a5 5 0 1 0 1.6-3.67" />
      <path d="M3 2.5V5.5h3" />
    </>
  ),
  // Lineage: a node with branches
  trace: (
    <>
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="12.5" cy="4.5" r="1.5" />
      <circle cx="12.5" cy="11.5" r="1.5" />
      <path d="M5 7.4 11 5" />
      <path d="m5 8.6 6 2.4" />
    </>
  ),
  check: <path d="m3.5 8.5 3 3 6-7" />,
  warning: (
    <>
      <path d="M8 2.5 14.5 13.5h-13L8 2.5Z" />
      <path d="M8 6.75v3" />
      <path d="M8 11.75h.01" />
    </>
  ),
  filter: (
    <>
      <path d="M2.5 4h11" />
      <path d="M4.5 8h7" />
      <path d="M6.5 12h3" />
    </>
  ),
  external: (
    <>
      <path d="M9 3h4v4" />
      <path d="m13 3-6 6" />
      <path d="M12 9.5V13H3V4h3.5" />
    </>
  ),
};

export function Icon({
  name,
  className = "",
  size = 16,
}: {
  name: IconName;
  className?: string;
  size?: number;
}) {
  const filled = name === "play";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * Node-type glyph — echoes the 3D geometry so a table row and a node on the
 * map are recognisably the same thing.
 */
export function NodeGlyph({
  type,
  className = "",
  size = 14,
}: {
  type: NodeType;
  className?: string;
  size?: number;
}) {
  const shapes: Record<NodeType, React.ReactNode> = {
    // diamond — external origin
    SOURCE: <path d="M7 1.5 12.5 7 7 12.5 1.5 7 7 1.5Z" />,
    // narrow connector
    INGESTION: <path d="M5 2h4v10H5z" />,
    // solid block
    RAW_TABLE: <path d="M2 3.5h10v7H2z" />,
    // connector with a notch
    TRANSFORMATION: <path d="M5 2h4v4l-2 2 2 2v2H5z" />,
    // stacked slab
    WAREHOUSE_TABLE: (
      <>
        <path d="M2 4h10v3H2z" />
        <path d="M2 8.5h10v3H2z" />
      </>
    ),
    // lens
    DATA_MODEL: <ellipse cx="7" cy="7" rx="5.5" ry="3.5" />,
    // display plane
    DASHBOARD: (
      <>
        <path d="M1.5 2.5h11v7h-11z" />
        <path d="M7 9.5v2.5" />
      </>
    ),
    // faceted sphere
    ML_MODEL: (
      <>
        <circle cx="7" cy="7" r="5.25" />
        <path d="M1.75 7h10.5" />
        <path d="M7 1.75c1.6 1.6 1.6 8.9 0 10.5" />
      </>
    ),
    // process marker
    BUSINESS_PROCESS: <path d="M7 1.75 12.25 12.25h-10.5L7 1.75Z" />,
    // team
    TEAM: (
      <>
        <circle cx="7" cy="5" r="2.25" />
        <path d="M2.75 12.25a4.25 4.25 0 0 1 8.5 0" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {shapes[type]}
    </svg>
  );
}
