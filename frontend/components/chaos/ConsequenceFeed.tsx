"use client";

import { useMemo } from "react";
import type { Simulation } from "@/lib/types";
import { formatDuration } from "@/lib/visual";

/**
 * The consequence feed: subtitles for the map.
 *
 * The brief for this surface was that the causal chain should be readable
 * without a wall of text, so this is deliberately not a log. It shows the
 * event just reached, with the one before it held as a ghost for continuity,
 * and it never scrolls. Three lines was one too many: a stack tall enough to
 * need scanning stops being a subtitle and starts being console output. The
 * complete ordered record lives in the ledger; this is the line you read
 * while watching.
 *
 * Every line is an engine event verbatim, `simulation.timeline`, so what is
 * narrated here and what is drawn on the map are the same fact.
 */
const KIND_TONE: Record<string, string> = {
  inject: "bg-failed",
  propagate: "bg-degraded",
  impact: "bg-failed",
  recover: "bg-recovering",
  resolve: "bg-healthy",
};

/** The current line, plus one behind it for continuity. */
const TRAIL = 2;

export function ConsequenceFeed({
  simulation,
  t,
}: {
  simulation: Simulation;
  t: number;
}) {
  const recent = useMemo(() => {
    const reached = simulation.timeline.filter((e) => e.t <= t);
    return reached.slice(-TRAIL);
  }, [simulation.timeline, t]);

  if (recent.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none flex w-full min-w-0 flex-col items-center gap-1"
    >
      {recent.map((event, i) => {
        // The newest line is the one being read; the one behind it is context
        // and falls back rather than competing. Below a wide viewport the
        // region is too narrow to carry two lines without truncating both, so
        // the ghost is dropped rather than crushed.
        const ghost = i < recent.length - 1;
        return (
          <p
            key={`${event.t}-${event.label}`}
            className={[
              "reveal flex min-w-0 max-w-full items-center gap-2 rounded-pill border border-border-subtle bg-surface/85 px-2.5 py-1",
              ghost ? "hidden opacity-45 xl:flex" : "",
            ].join(" ")}
          >
            <span
              className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                KIND_TONE[event.kind] ?? "bg-border-strong"
              }`}
              aria-hidden
            />
            <span className="shrink-0 text-caption tnum text-quaternary">
              {formatDuration(event.t)}
            </span>
            <span className="truncate text-small text-primary">{event.label}</span>
          </p>
        );
      })}
    </div>
  );
}
