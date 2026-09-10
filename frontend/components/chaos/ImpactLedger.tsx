"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePulse } from "@/lib/store";
import { useWorkspace } from "@/lib/workspace";
import type { Simulation } from "@/lib/types";
import { NODE_ABBR, STATE, formatDuration } from "@/lib/visual";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SeverityBadge, StatusDot, Tabs } from "@/components/ui/primitives";
import { RecoveryTrack } from "./RecoveryTrack";

/**
 * The impact ledger.
 *
 * Every figure comes from the deterministic blast radius; the UI never invents
 * a number. What it does control is WHEN each figure is allowed to appear.
 *
 * The old panel printed the final total the instant the request returned,
 * while the rows underneath it revealed one hop at a time — so the headline
 * gave away the ending of the story the map was still telling. Here the
 * headline counts what is broken *right now*: it climbs as the failure
 * spreads, holds while the blast radius is read, and falls again as the
 * recovery plan repairs each asset. The totals arrive when the run settles,
 * which is the moment they mean something.
 */
type View = "impact" | "recovery";

export function ImpactLedger({
  simulation,
  onExit,
  onCompare,
  recoverySpan,
}: {
  simulation: Simulation;
  /** Leave the run and reopen the composer. */
  onExit: () => void;
  onCompare: () => void;
  /** The recovery half of the clock, for the elapsed figure at the close. */
  recoverySpan: { start: number; end: number; length: number } | null;
}) {
  const stateOf = usePulse((s) => s.stateOf);
  const isRevealed = usePulse((s) => s.isRevealed);
  const impactedCount = usePulse((s) => s.impactedCount);
  const phase = usePulse((s) => s.simPhase);
  const propagationHops = usePulse((s) => s.propagationHops);
  const recoveryStep = usePulse((s) => s.recoveryStep);

  const [view, setView] = useState<View>("impact");
  // The ledger follows the story: once the plan starts walking, the plan is
  // what the user is watching.
  useEffect(() => {
    if (phase === "recovering" || phase === "restored") setView("recovery");
    else setView("impact");
  }, [phase]);

  const br = simulation.blast_radius;
  const settled = phase !== "propagating";
  const restored = phase === "restored";

  const rows = useMemo(
    () =>
      br.nodes
        .filter((n) => n.id !== br.origin)
        .map((n) => ({
          impact: n,
          revealed: isRevealed(n.id),
          state: stateOf(n.id),
        })),
    // The clock fields are the dependency that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [br, isRevealed, stateOf, propagationHops, recoveryStep]
  );

  const visible = rows.filter((r) => r.revealed);
  const broken = impactedCount();
  // Restored is counted the same way broken is — from the states the map is
  // actually showing — so the two figures can never sum to something other
  // than the blast radius.
  const restoredCount = rows.filter(
    (r) => r.revealed && r.state === "HEALTHY"
  ).length;
  const recovering = phase === "recovering" || restored;

  // Aggregates are counted over what has actually been revealed, so none of
  // them can run ahead of the map.
  const countRevealed = (ids: string[]) =>
    ids.filter((id) => isRevealed(id)).length;

  return (
    <aside
      aria-label="Predicted impact"
      className="glass flex min-h-0 flex-col overflow-hidden rounded-xl"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-3.5 pb-2 pt-3">
        <h2 className="text-micro uppercase text-quaternary">
          {restored
            ? "System restored"
            : phase === "recovering"
              ? "Recovery"
              : settled
                ? "Blast radius"
                : "Impact"}
        </h2>
        <button
          onClick={onExit}
          className="rounded px-1.5 py-0.5 text-caption text-tertiary transition-colors duration-instant hover:bg-subtle hover:text-primary"
        >
          Exit
        </button>
      </header>

      {/* Which failure this is. At xl the composer chip on the left already
          says so; below it, that chip is gone and the panel has to. */}
      <p className="shrink-0 truncate px-3.5 pb-2 text-caption text-tertiary xl:hidden">
        <span className="text-secondary">{br.origin_name}</span> ·{" "}
        {br.failure_label}
      </p>

      {/*
        * The headline is one figure whose meaning turns over with the run: it
        * counts damage while the failure spreads, and repair once the plan is
        * walking. That turn is the moment the screen stops being about what
        * broke and starts being about getting it back, so it is the headline
        * that carries it rather than a second panel appearing.
        */}
      <div className="shrink-0 border-b border-border-subtle px-3.5 pb-3">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-title-lg tnum ${
              recovering ? "text-healthy" : "text-failed"
            } transition-colors duration-slow ease-standard`}
          >
            {recovering ? restoredCount : broken}
          </span>
          {recovering && (
            <span className="text-title tnum text-quaternary">
              / {br.total_affected}
            </span>
          )}
          <span className="min-w-0 text-small leading-snug text-tertiary">
            {recovering
              ? "restored"
              : settled
                ? "downstream assets affected"
                : "affected so far"}
          </span>
        </div>

        {/* A proportional rule, not a chart — the same quiet device the
            sidebar uses for the resilience score. */}
        {recovering && (
          <div
            className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={restoredCount}
            aria-valuemin={0}
            aria-valuemax={br.total_affected}
            aria-label="Assets restored"
          >
            <div
              className="h-full rounded-full bg-healthy transition-[width] duration-slow ease-standard"
              style={{
                width: `${br.total_affected ? (restoredCount / br.total_affected) * 100 : 0}%`,
              }}
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-3">
          <Stat
            label="Dashboards"
            value={countRevealed(br.critical_dashboards)}
          />
          <Stat label="ML models" value={countRevealed(br.ml_models)} />
          <Stat label="Teams" value={countRevealed(br.teams)} />
        </div>

        {/* The consequence, in a sentence, once there is one to state. */}
        {settled && <Consequence simulation={simulation} />}

        {restored && (
          <RunOutcome
            simulation={simulation}
            recoverySpan={recoverySpan}
            onRunAnother={onExit}
            onCompare={onCompare}
          />
        )}
      </div>

      <div className="shrink-0">
        <Tabs<View>
          value={view}
          onChange={setView}
          label="Impact and recovery"
          tabs={[
            { value: "impact", label: "Impact", count: visible.length },
            {
              value: "recovery",
              label: "Recovery",
              count: simulation.recovery.length,
            },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "impact" ? (
          <ul>
            {visible.map(({ impact, state }, i) => (
              <li
                key={impact.id}
                className="reveal flex items-center gap-2.5 border-b border-border-subtle px-3.5 py-2"
                style={{
                  // Only the rows arriving on this hop stagger; the ones
                  // already on screen must not re-animate.
                  "--reveal-delay": `${Math.min(i, 6) * 26}ms`,
                } as React.CSSProperties}
              >
                <StatusDot state={state} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-small text-primary">
                    {impact.name}
                  </div>
                  <div className="truncate text-caption text-tertiary">
                    {NODE_ABBR[impact.type]} · hop {impact.hops} ·{" "}
                    {STATE[state].label}
                    {impact.untrustworthy && state !== "HEALTHY"
                      ? " · untrustworthy"
                      : ""}
                  </div>
                </div>
                <SeverityBadge severity={impact.severity} />
              </li>
            ))}
          </ul>
        ) : (
          <RecoveryTrack simulation={simulation} />
        )}
      </div>

      <KeepRun simulation={simulation} />
    </aside>
  );
}

/* ------------------------------------------------------------ consequence */

/**
 * The business consequence, in one sentence.
 *
 * This is the product's actual claim — not "18 assets degraded" but "the board
 * revenue number is wrong and Finance is the last to know". It is assembled
 * from the engine's own aggregates, never written ahead of time.
 */
function Consequence({ simulation }: { simulation: Simulation }) {
  const br = simulation.blast_radius;
  const dashboards = br.critical_dashboards.length;
  const teams = simulation.business_impact.teams;

  if (dashboards === 0 && teams.length === 0) {
    return (
      <p className="pt-3 text-caption leading-relaxed text-secondary">
        No critical consumer or team sits downstream of this failure. It is
        contained inside the platform.
      </p>
    );
  }

  return (
    <p className="pt-3 text-caption leading-relaxed text-secondary">
      {dashboards > 0 && (
        <>
          {dashboards} critical dashboard{dashboards > 1 ? "s" : ""}{" "}
          {dashboards > 1 ? "become" : "becomes"} untrustworthy
        </>
      )}
      {dashboards > 0 && teams.length > 0 && ", and "}
      {teams.length > 0 && (
        <>
          {teams.join(", ")} {teams.length > 1 ? "are" : "is"} working from it
        </>
      )}
      . Blast score{" "}
      <span className="tnum text-primary">{br.blast_score}</span>.
    </p>
  );
}

/* ----------------------------------------------------------------- outcome */

/**
 * How the run closes.
 *
 * Deliberately NOT a new resilience score. Resilience is a property of the
 * system's shape, not of a simulation that was run against it — the engine
 * recomputes it from the graph, and a failure that has been fully recovered
 * has not changed the graph. Claiming a number moved here would be inventing
 * telemetry. What can honestly be stated is what this run cost and what it
 * took to undo, so that is what it says, with a route to the score itself.
 */
function RunOutcome({
  simulation,
  recoverySpan,
  onRunAnother,
  onCompare,
}: {
  simulation: Simulation;
  recoverySpan: { start: number; end: number; length: number } | null;
  onRunAnother: () => void;
  onCompare: () => void;
}) {
  const steps = simulation.recovery.length;

  return (
    <div className="pt-3">
      <p className="text-caption leading-relaxed text-secondary">
        Incident resolved. {steps} recovery {steps === 1 ? "step" : "steps"}
        {recoverySpan ? ` over ${formatDuration(recoverySpan.length)}` : ""}, run
        in dependency order. Nothing outside the blast radius was touched.
      </p>
      {/*
       * Two actions, and they do different things. Replaying this run lives on
       * the transport, where the rest of the playback controls are; what
       * belongs here is where you go NEXT — break something else, or weigh
       * this failure against another one.
       */}
      <div className="flex flex-wrap gap-2 pt-2.5">
        <Button size="sm" variant="primary" onClick={onRunAnother}>
          Run another failure
        </Button>
        <Button size="sm" variant="ghost" onClick={onCompare}>
          Compare with another
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- keep run */

/**
 * Turning a run into something that outlives it.
 *
 * A simulation is a pure computation — closing the tab loses it. Saving it as
 * a scenario keeps the configuration so it can be re-run against this system
 * later; recording it as an incident keeps it as an event with a replay and a
 * recovery plan. Neither is offered against the demo, which belongs to nobody.
 */
function KeepRun({ simulation }: { simulation: Simulation }) {
  const active = useWorkspace((s) => s.active);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "recorded">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  if (!active || active.kind === "demo") {
    return (
      <p className="shrink-0 border-t border-border-subtle px-3.5 py-2.5 text-caption leading-relaxed text-quaternary">
        Runs against the sample system are not kept. Open one of your own
        systems to save this as a scenario.
      </p>
    );
  }

  const br = simulation.blast_radius;

  const saveScenario = async () => {
    setState("saving");
    setError(null);
    try {
      await api.saveScenario(active.id, {
        name: `${br.failure_label} — ${br.origin_name}`,
        origin: br.origin,
        failure_type: br.failure_type,
        duration_minutes: simulation.duration_minutes,
        parameter: simulation.parameter ?? null,
      });
      setState("saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the scenario.");
      setState("idle");
    }
  };

  const recordIncident = async () => {
    setState("saving");
    setError(null);
    try {
      await api.recordIncident({
        origin: br.origin,
        failure_type: br.failure_type,
        duration_minutes: simulation.duration_minutes,
      });
      setState("recorded");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not record the incident."
      );
      setState("idle");
    }
  };

  return (
    <div className="shrink-0 border-t border-border-subtle px-3.5 py-2.5">
      {state === "saved" || state === "recorded" ? (
        <p className="flex items-center gap-1.5 text-caption text-healthy">
          <Icon name="check" size={12} />
          {state === "saved"
            ? "Saved to this system's scenarios."
            : "Recorded as an incident."}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={saveScenario} disabled={state === "saving"}>
            Save as scenario
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={recordIncident}
            disabled={state === "saving"}
          >
            Record incident
          </Button>
        </div>
      )}
      {error && <p className="pt-1.5 text-caption text-failed">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-caption text-tertiary">{label}</div>
      <div className="pt-0.5 text-heading tnum text-primary">{value}</div>
    </div>
  );
}
