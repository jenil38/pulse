"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IncidentDetail } from "@/lib/types";
import { formatDuration } from "@/lib/visual";
import { Button } from "@/components/ui/Button";

/**
 * Incident replay scrubber.
 *
 * The timeline comes from the same deterministic engine output as the blast
 * radius, so scrubbing replays the real propagation sequence rather than a
 * scripted animation. Event ticks are rendered on the track so the user can see
 * where the interesting moments are before dragging to them.
 */
const KIND_CLASS: Record<string, string> = {
  inject: "bg-failed",
  propagate: "bg-degraded",
  impact: "bg-failed",
  recover: "bg-recovering",
  resolve: "bg-healthy",
};

export function ReplayTimeline({
  incident,
  t,
  onScrub,
}: {
  incident: IncidentDetail;
  t: number;
  onScrub: (t: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60); // simulated seconds per real second
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  const events = incident.timeline;
  const maxT = events.length ? events[events.length - 1].t : 0;

  const tick = useCallback(
    (now: number) => {
      if (!last.current) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      onScrub(Math.min(t + dt * speed, maxT));
      raf.current = requestAnimationFrame(tick);
    },
    [t, speed, maxT, onScrub]
  );

  useEffect(() => {
    if (!playing) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      last.current = 0;
      return;
    }
    if (t >= maxT) {
      setPlaying(false);
      return;
    }
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, tick, t, maxT]);

  const current = events.filter((e) => e.t <= t).slice(-1)[0];

  return (
    <div data-surface className="shrink-0 border-t border-border bg-canvas">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Button
          size="sm"
          variant={playing ? "secondary" : "primary"}
          onClick={() => {
            if (t >= maxT) onScrub(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "Pause" : t >= maxT ? "Replay" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setPlaying(false);
            onScrub(0);
          }}
        >
          Reset
        </Button>

        <span className="font-mono text-small tnum text-primary">{formatDuration(t)}</span>
        <span className="font-mono text-caption tnum text-quaternary">
          / {formatDuration(maxT)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <span className="pr-1 text-caption text-tertiary">Speed</span>
          {[30, 60, 180].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={`h-6 rounded px-1.5 font-mono text-caption transition-colors duration-instant ${
                speed === s
                  ? "bg-muted font-medium text-primary"
                  : "text-tertiary hover:bg-subtle hover:text-secondary"
              }`}
            >
              {s / 60}×
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={maxT}
            step={1}
            value={t}
            onChange={(e) => {
              setPlaying(false);
              onScrub(Number(e.target.value));
            }}
            aria-label="Scrub incident timeline"
            className="w-full accent-accent"
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-full -translate-y-1/2">
            {events.map((e, i) => (
              <span
                key={i}
                className={`absolute top-1/2 h-2 w-px -translate-y-1/2 ${KIND_CLASS[e.kind] ?? "bg-border-strong"} ${
                  e.t <= t ? "opacity-90" : "opacity-30"
                }`}
                style={{ left: `${maxT ? (e.t / maxT) * 100 : 0}%` }}
              />
            ))}
          </div>
        </div>

        {current && (
          <p className="flex items-baseline gap-2 pt-2">
            <span className="font-mono text-caption tnum text-quaternary">
              {formatDuration(current.t)}
            </span>
            <span className="text-small text-secondary">{current.label}</span>
          </p>
        )}
      </div>
    </div>
  );
}
