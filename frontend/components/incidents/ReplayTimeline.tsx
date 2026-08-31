"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IncidentDetail } from "@/lib/types";
import { STATE } from "@/lib/visual";
import { Button } from "@/components/ui/primitives";

/**
 * Incident replay scrubber.
 *
 * The timeline is generated from the same deterministic engine output as the
 * blast radius, so scrubbing replays the real propagation sequence rather than
 * a scripted animation.
 */
const KIND_COLOR: Record<string, string> = {
  inject: STATE.FAILED.hex,
  propagate: STATE.DEGRADED.hex,
  impact: STATE.FAILED.hex,
  recover: STATE.RECOVERING.hex,
  resolve: STATE.HEALTHY.hex,
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
  const last = useRef<number>(0);

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

  const active = events.filter((e) => e.t <= t);
  const current = active[active.length - 1];

  return (
    <div className="border-t border-line bg-panel">
      {/* Controls */}
      <div className="flex items-center gap-4 border-b border-line px-4 py-2.5">
        <Button
          onClick={() => {
            if (t >= maxT) onScrub(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "Pause" : t >= maxT ? "Replay" : "Play"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPlaying(false);
            onScrub(0);
          }}
        >
          Reset
        </Button>

        <span className="font-mono text-[11px] tabular-nums text-ink">
          {fmt(t)}
        </span>
        <span className="font-mono text-[9px] text-ink-faint">/ {fmt(maxT)}</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint">
            Speed
          </span>
          {[30, 60, 180].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
                speed === s ? "text-healthy" : "text-ink-faint hover:text-ink-dim"
              }`}
            >
              {s / 60}×
            </button>
          ))}
        </div>
      </div>

      {/* Scrubber with event ticks */}
      <div className="px-4 py-4">
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
            className="w-full accent-healthy"
          />
          {/* Event markers */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
            {events.map((e, i) => (
              <span
                key={i}
                className="absolute top-1/2 h-2 w-px -translate-y-1/2"
                style={{
                  left: `${maxT ? (e.t / maxT) * 100 : 0}%`,
                  background: KIND_COLOR[e.kind] ?? "#3D464C",
                  opacity: e.t <= t ? 0.9 : 0.3,
                }}
              />
            ))}
          </div>
        </div>

        {current && (
          <p className="pt-3 font-mono text-[10px] text-ink-dim">
            <span
              className="mr-2 font-mono text-[9px] uppercase tracking-[0.14em]"
              style={{ color: KIND_COLOR[current.kind] }}
            >
              {fmt(current.t)}
            </span>
            {current.label}
          </p>
        )}
      </div>
    </div>
  );
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
