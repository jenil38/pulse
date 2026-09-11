"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePulse } from "@/lib/store";
import type { RecoveryStep, Simulation } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";

/**
 * The recovery plan, and then the recovery itself.
 *
 * Every line here is a step the engine generated from the topology, see
 * `backend/app/engine/recovery.py`. Nothing is scripted for the UI: the order
 * is the reverse of the order the failure travelled, because you cannot
 * rebuild a table before the thing that feeds it, and that constraint is the
 * whole point the playback exists to make visible.
 *
 * The plan's `kind` values group into the five phases an operator actually
 * thinks in. A run with no backfill (anything that is not a STARVE failure)
 * simply has no steps under that phase, and the phase is not drawn, the shape
 * of the plan is itself information about the kind of failure that happened.
 */
const PHASES: { key: string; label: string; kinds: RecoveryStep["kind"][] }[] = [
  { key: "restore", label: "Restore the origin", kinds: ["restore"] },
  { key: "validate", label: "Validate what lands", kinds: ["validate"] },
  { key: "rebuild", label: "Backfill and rebuild", kinds: ["backfill", "rebuild"] },
  { key: "verify", label: "Verify consumers", kinds: ["verify"] },
  { key: "resolve", label: "Resolve", kinds: ["resolve"] },
];

type StepState = "done" | "active" | "pending";

export function RecoveryTrack({ simulation }: { simulation: Simulation }) {
  const recoveryStep = usePulse((s) => s.recoveryStep);
  const phase = usePulse((s) => s.simPhase);
  const listRef = useRef<HTMLOListElement>(null);

  const running = phase === "recovering";
  const activeOrder = running ? recoveryStep + 1 : null;

  const groups = useMemo(
    () =>
      PHASES.map((p) => ({
        ...p,
        steps: simulation.recovery.filter((s) => p.kinds.includes(s.kind)),
      })).filter((p) => p.steps.length > 0),
    [simulation.recovery]
  );

  // Follow the step being performed, so a long plan does not walk off screen.
  useEffect(() => {
    if (activeOrder === null) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-order="${activeOrder}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeOrder]);

  const stateOf = (step: RecoveryStep): StepState => {
    if (recoveryStep >= step.order) return "done";
    if (activeOrder === step.order) return "active";
    return "pending";
  };

  return (
    <div className="pb-1">
      {phase === "settled" && (
        <p className="border-b border-border-subtle px-3.5 py-2.5 text-caption leading-relaxed text-tertiary">
          {simulation.recovery.length} steps, generated from this system&rsquo;s
          dependency order. Play the recovery to watch it run.
        </p>
      )}

      <ol ref={listRef}>
        {groups.map((group) => {
          const done = group.steps.filter(
            (s) => recoveryStep >= s.order
          ).length;
          // Where the plan has got to. The phase being worked is the only one
          // that should read as live; finished phases settle back rather than
          // staying lit, and phases still ahead stay quiet.
          const complete = done === group.steps.length;
          const live =
            activeOrder !== null &&
            group.steps.some((s) => s.order === activeOrder);
          return (
            <li key={group.key}>
              <div
                className={[
                  "flex items-center justify-between gap-2 border-b border-border-subtle px-3.5 py-1.5",
                  "transition-colors duration-slow ease-standard",
                  live ? "bg-recovering-bg" : "bg-subtle/40",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-micro uppercase transition-colors duration-slow ease-standard",
                    live
                      ? "text-recovering"
                      : complete
                        ? "text-tertiary"
                        : "text-quaternary",
                  ].join(" ")}
                >
                  {group.label}
                </span>
                <span
                  className={`flex items-center gap-1 text-caption tnum ${
                    complete ? "text-tertiary" : "text-quaternary"
                  }`}
                >
                  {complete && <Icon name="check" size={10} className="text-healthy" />}
                  {done}/{group.steps.length}
                </span>
              </div>

              <ol>
                {group.steps.map((step) => (
                  <Step key={step.order} step={step} state={stateOf(step)} />
                ))}
              </ol>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Step({ step, state }: { step: RecoveryStep; state: StepState }) {
  return (
    <li
      data-order={step.order}
      aria-current={state === "active" ? "step" : undefined}
      className={[
        "flex gap-2.5 border-b border-border-subtle px-3.5 py-2 transition-colors duration-slow ease-standard",
        state === "active" ? "bg-recovering-bg" : "",
      ].join(" ")}
    >
      <span className="grid w-5 shrink-0 justify-center pt-[3px]">
        {state === "done" ? (
          <Icon name="check" size={12} className="text-healthy" />
        ) : state === "active" ? (
          <span
            className="mt-[3px] h-[6px] w-[6px] rounded-full bg-recovering"
            aria-hidden
          />
        ) : (
          <span className="font-mono text-caption tnum text-quaternary">
            {String(step.order).padStart(2, "0")}
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={[
            "text-small leading-snug transition-colors duration-slow ease-standard",
            state === "pending" ? "text-tertiary" : "text-primary",
            state === "done" ? "text-secondary" : "",
          ].join(" ")}
        >
          {step.action}
        </p>
        <p className="pt-0.5 text-caption text-quaternary">
          {state === "active"
            ? "running…"
            : state === "done"
              ? "complete"
              : step.kind}
        </p>
      </div>
    </li>
  );
}
