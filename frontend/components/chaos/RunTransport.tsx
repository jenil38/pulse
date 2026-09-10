"use client";

import { useMemo } from "react";
import type { SimulationClock } from "@/hooks/useSimulationClock";
import { SPEEDS } from "@/hooks/useSimulationClock";
import type { Simulation } from "@/lib/types";
import { formatDuration } from "@/lib/visual";
import { Icon } from "@/components/ui/Icon";

/**
 * The run transport.
 *
 * A failure simulation has two halves and a hole in the middle: the blast
 * radius completes within minutes, but the engine does not schedule the first
 * recovery step until the failure has run for its configured duration. Drawn
 * to scale that is a scrubber which is mostly empty, so the axis here is
 * compressed — the two halves sit side by side, and the notch between them is
 * labelled with the real time it stands for. The gap is stated, not hidden.
 *
 * The boundary is also where playback stops. "What did this cost?" and "how do
 * we get it back?" are different questions, and the control that crosses
 * between them is a decision the user makes, not a beat that scrolls past.
 */
const KIND_TONE: Record<string, string> = {
  inject: "bg-failed",
  propagate: "bg-degraded",
  impact: "bg-failed",
  recover: "bg-recovering",
  resolve: "bg-healthy",
};

const PHASE_LABEL: Record<string, string> = {
  propagating: "Propagating",
  settled: "Blast radius settled",
  recovering: "Recovering",
  restored: "System restored",
};

export function RunTransport({
  clock,
  simulation,
  onReplay,
}: {
  clock: SimulationClock;
  simulation: Simulation;
  onReplay: () => void;
}) {
  const {
    t,
    playing,
    phase,
    progress,
    propagation,
    recovery,
    gap,
    hops,
    totalHops,
    recoveryStep,
    totalRecoverySteps,
  } = clock;

  // Where the blast radius finishes, in axis terms. Asked of the clock rather
  // than recomputed, so the seam, the fill and the ticks can never disagree.
  const boundary = clock.positionOf(propagation.settle) * 100;

  const ticks = useMemo(
    () =>
      simulation.timeline.map((e, i) => ({
        key: `${e.t}-${i}`,
        left: clock.positionOf(e.t) * 100,
        kind: e.kind,
        reached: e.t <= t,
      })),
    [simulation.timeline, clock, t]
  );

  const atSettle = phase === "settled";
  const restored = phase === "restored";

  return (
    <div role="group" aria-label="Simulation playback" className="px-3 pb-3 pt-2.5">
      {/* ---- controls ------------------------------------------------ */}
      <div className="flex items-center gap-2">
        {restored ? (
          <PrimaryAction onClick={onReplay} icon="reset" label="Replay" />
        ) : atSettle && recovery ? (
          <PrimaryAction
            onClick={clock.beginRecovery}
            icon="play"
            label="Run recovery"
            emphasis
          />
        ) : (
          <PrimaryAction
            onClick={clock.toggle}
            icon={playing ? "pause" : "play"}
            label={playing ? "Pause" : "Play"}
          />
        )}

        <div className="flex items-center">
          <IconButton
            onClick={() => clock.step(-1)}
            label="Previous step"
            glyph="arrowUp"
            rotate
          />
          <IconButton
            onClick={() => clock.step(1)}
            label="Next step"
            glyph="arrowDown"
            rotate
          />
          <IconButton onClick={onReplay} label="Restart" glyph="reset" />
        </div>

        <span className="pl-1 text-small tnum text-primary">
          {formatDuration(t)}
        </span>

        <span className="hidden min-w-0 items-baseline gap-2 sm:flex">
          <span className="truncate text-caption text-secondary">
            {PHASE_LABEL[phase] ?? ""}
          </span>
          <span className="whitespace-nowrap text-caption tnum text-quaternary">
            {phase === "recovering" || restored
              ? `step ${Math.min(restored ? totalRecoverySteps : recoveryStep + 1, totalRecoverySteps)} of ${totalRecoverySteps}`
              : `hop ${Math.min(hops, totalHops)} of ${totalHops}`}
          </span>
        </span>

        <div className="ml-auto hidden items-center gap-0.5 sm:flex">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => clock.setSpeed(s)}
              aria-pressed={clock.speed === s}
              className={[
                "h-6 rounded px-1.5 text-caption tnum transition-colors duration-instant",
                clock.speed === s
                  ? "bg-muted font-medium text-primary"
                  : "text-tertiary hover:bg-subtle hover:text-secondary",
              ].join(" ")}
            >
              {s}&times;
            </button>
          ))}
        </div>
      </div>

      {/* ---- track --------------------------------------------------- */}
      <div className="relative mt-2.5 h-5">
        {/* Segment beds */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-muted"
            style={{ width: `${boundary}%` }}
          />
          {recovery && (
            <div
              className="absolute top-0 h-full rounded-full bg-muted"
              style={{ left: `${boundary}%`, right: 0 }}
            />
          )}

          {/* Everything reached so far. */}
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-colors duration-slow ease-standard ${
              phase === "recovering" || restored ? "bg-recovering" : "bg-failed"
            }`}
            style={{ width: `${progress * 100}%` }}
          />

          {/* Event ticks — where the interesting moments are. */}
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className={`absolute top-1/2 h-2 w-px -translate-y-1/2 ${
                KIND_TONE[tick.kind] ?? "bg-border-strong"
              } ${tick.reached ? "opacity-80" : "opacity-25"}`}
              style={{ left: `${tick.left}%` }}
            />
          ))}

          {/* The boundary: real elapsed time the axis does not draw. */}
          {recovery && clock.compressed && (
            <span
              className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 bg-border-strong"
              style={{ left: `${boundary}%` }}
              aria-hidden
            />
          )}
        </div>

        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(progress * 1000)}
          onChange={(e) => clock.seekProgress(Number(e.target.value) / 1000)}
          aria-label="Scrub the simulation"
          aria-valuetext={`${PHASE_LABEL[phase]}, ${formatDuration(t)}`}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />

        {/* Playhead */}
        <span
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface bg-primary"
          style={{ left: `${progress * 100}%` }}
          aria-hidden
        />
      </div>

      {/* ---- axis captions ------------------------------------------- */}
      {recovery && (
        <div className="relative mt-0.5 h-3.5">
          <span className="absolute left-0 text-caption text-quaternary">
            Propagation
          </span>
          {/* Three captions do not fit a phone. The one that gets dropped is
              the gap, because the boundary notch on the track still shows a
              seam is there and the two segment names are what orient you. */}
          {clock.compressed && (
            <span
              className="absolute hidden -translate-x-1/2 whitespace-nowrap text-caption text-quaternary sm:inline"
              style={{ left: `${boundary}%` }}
            >
              + {formatDuration(gap)} elapsed
            </span>
          )}
          <span className="absolute right-0 text-caption text-quaternary">
            Recovery
          </span>
        </div>
      )}
    </div>
  );
}

function PrimaryAction({
  onClick,
  icon,
  label,
  emphasis,
}: {
  onClick: () => void;
  icon: "play" | "pause" | "reset";
  label: string;
  emphasis?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex h-control shrink-0 items-center gap-1.5 rounded-lg px-3 text-small font-medium",
        "transition-colors duration-instant ease-standard",
        emphasis
          ? "bg-accent text-accent-fg hover:bg-accent-hover"
          : "border border-border bg-surface/70 text-primary hover:border-border-strong",
      ].join(" ")}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
}

function IconButton({
  onClick,
  label,
  glyph,
  rotate,
}: {
  onClick: () => void;
  label: string;
  glyph: "arrowUp" | "arrowDown" | "reset";
  rotate?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded text-tertiary transition-colors duration-instant hover:bg-subtle hover:text-primary"
    >
      {/* arrowUp turned a quarter left points left; arrowDown, right. */}
      <span className={rotate ? "-rotate-90" : ""}>
        <Icon name={glyph} size={13} />
      </span>
    </button>
  );
}
