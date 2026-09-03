"use client";

import { useId, useMemo } from "react";

/**
 * Chart primitives — inline SVG, no dependency, design-system colours only.
 *
 * A data-reliability product without time-series reads as a diagram rather than
 * an operational tool. These are deliberately plain: thin strokes, one hue per
 * series, no gridlines unless they earn their place, no legend where a caption
 * will do. Same rule as everything else — colour carries state, not decoration.
 */

export interface Pt {
  t: number;
  value: number;
}

function buildPath(points: Pt[], w: number, h: number, pad = 1) {
  if (points.length === 0) return { line: "", area: "", min: 0, max: 0 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerH = h - pad * 2;

  const x = (i: number) => (i / Math.max(points.length - 1, 1)) * w;
  const y = (v: number) => pad + innerH - ((v - min) / span) * innerH;

  const line = points
    .map((p, i) => (i === 0 ? "M" : "L") + x(i).toFixed(2) + "," + y(p.value).toFixed(2))
    .join(" ");
  const area = line + " L" + w + "," + h + " L0," + h + " Z";
  return { line, area, min, max };
}

const STROKE_TONE = {
  neutral: "text-quaternary",
  healthy: "text-healthy",
  degraded: "text-degraded",
  failed: "text-failed",
  accent: "text-accent",
} as const;

/**
 * Sparkline — a trend at a glance, sized for a table cell.
 * `tone` maps to a semantic colour so a failing metric reads as failing.
 */
export function Sparkline({
  points,
  width = 64,
  height = 18,
  tone = "neutral",
  title,
}: {
  points: Pt[];
  width?: number;
  height?: number;
  tone?: keyof typeof STROKE_TONE;
  title?: string;
}) {
  const { line } = useMemo(
    () => buildPath(points, width, height),
    [points, width, height]
  );

  if (!line) return <span className="inline-block" style={{ width, height }} />;

  return (
    <svg
      width={width}
      height={height}
      viewBox={"0 0 " + width + " " + height}
      fill="none"
      className={"overflow-visible " + STROKE_TONE[tone]}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d={line}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Area chart with a soft fill and an optional reference line.
 * Used where the shape over time is the story: freshness, volume, score.
 */
export function AreaChart({
  points,
  height = 120,
  tone = "accent",
  formatValue = (v: number) => String(Math.round(v)),
  label,
  baseline,
  baselineLabel,
}: {
  points: Pt[];
  height?: number;
  tone?: "accent" | "healthy" | "degraded" | "failed";
  formatValue?: (v: number) => string;
  label?: string;
  /** Optional horizontal reference line, in data units. */
  baseline?: number;
  baselineLabel?: string;
}) {
  const id = useId();
  const W = 600;
  const { line, area, min, max } = useMemo(
    () => buildPath(points, W, height, 4),
    [points, height]
  );

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded border border-border bg-subtle"
        style={{ height }}
      >
        <span className="text-caption text-quaternary">No data</span>
      </div>
    );
  }

  const span = max - min || 1;
  const baseY =
    baseline !== undefined
      ? 4 + (height - 8) - ((baseline - min) / span) * (height - 8)
      : null;

  return (
    <figure className="w-full">
      {label && (
        <figcaption className="pb-1.5 text-caption text-tertiary">{label}</figcaption>
      )}
      <div className="relative">
        <svg
          width="100%"
          height={height}
          viewBox={"0 0 " + W + " " + height}
          preserveAspectRatio="none"
          fill="none"
          className={STROKE_TONE[tone]}
          role="img"
          aria-label={
            (label ?? "Trend") +
            ": ranges from " +
            formatValue(min) +
            " to " +
            formatValue(max)
          }
        >
          <defs>
            <linearGradient id={"fill-" + id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {baseY !== null && (
            <line
              x1="0"
              x2={W}
              y1={baseY}
              y2={baseY}
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <path d={area} fill={"url(#fill-" + id + ")"} />
          <path
            d={line}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Range labels sit outside the SVG so they never scale with it. */}
        <span className="pointer-events-none absolute right-0 top-0 text-caption tnum text-quaternary">
          {formatValue(max)}
        </span>
        <span className="pointer-events-none absolute bottom-0 right-0 text-caption tnum text-quaternary">
          {formatValue(min)}
        </span>
        {baselineLabel && baseY !== null && (
          <span
            className="pointer-events-none absolute left-0 text-caption text-quaternary"
            style={{ top: (baseY / height) * 100 + "%", transform: "translateY(-50%)" }}
          >
            {baselineLabel}
          </span>
        )}
      </div>
    </figure>
  );
}

/**
 * Discrete bar series — counts per bucket (incidents per day).
 * Empty buckets still render a faint tick so gaps stay legible.
 */
export function BarSeries({
  points,
  height = 56,
  tone = "failed",
  label,
}: {
  points: Pt[];
  height?: number;
  tone?: "failed" | "degraded" | "accent";
  label?: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const colour = { failed: "bg-failed", degraded: "bg-degraded", accent: "bg-accent" }[tone];

  return (
    <figure className="w-full">
      {label && (
        <figcaption className="pb-1.5 text-caption text-tertiary">{label}</figcaption>
      )}
      <div
        className="flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={label}
      >
        {points.map((p, i) => (
          <span key={i} className="flex flex-1 items-end" style={{ height: "100%" }}>
            <span
              className={"w-full rounded-[1px] " + (p.value > 0 ? colour : "bg-border")}
              style={{
                height: p.value > 0 ? Math.max((p.value / max) * 100, 12) + "%" : "2px",
              }}
              title={p.value + " incident" + (p.value === 1 ? "" : "s")}
            />
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * Stacked proportion bar — the estate's health composition at a glance.
 * Not a chart: it answers "how much of the system is healthy right now".
 */
export function StackedBar({
  segments,
  height = 6,
}: {
  segments: { value: number; className: string; label: string }[];
  height?: number;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-muted"
      style={{ height }}
      role="img"
      aria-label={segments.map((s) => s.label + " " + s.value).join(", ")}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.label}
            className={s.className}
            style={{ width: (s.value / total) * 100 + "%" }}
            title={s.label + ": " + s.value}
          />
        ))}
    </div>
  );
}
