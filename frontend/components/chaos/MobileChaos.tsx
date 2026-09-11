"use client";

import { useEffect, useMemo, useState } from "react";
import { usePulse } from "@/lib/store";
import type { Asset, FailureTypeInfo } from "@/lib/types";
import type { Stake } from "@/lib/lineage";
import type { SimulationClock } from "@/hooks/useSimulationClock";
import { NODE_ABBR, STATE } from "@/lib/visual";
import { AppShell } from "@/components/room/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SeverityBadge, StatusDot, Tabs } from "@/components/ui/primitives";
import { FailureComposer, type ComposerValue } from "./FailureComposer";
import { RecoveryTrack } from "./RecoveryTrack";
import { RunTransport } from "./RunTransport";
import { TargetBrief } from "./TargetBrief";

/**
 * Chaos Lab on a phone.
 *
 * Not the desktop room with the panels stacked. A dependency graph rendered
 * into 375 points of width is unreadable, and pretending otherwise is how the
 * old build ended up refusing to open at all below 768px.
 *
 * So the failure travels DOWN instead. Each hop is a rung on a single rail,
 * and the wave reveals one rung at a time, which is arguably a *clearer*
 * reading of hop distance than the 3D map gives, because distance from the
 * origin is literally distance down the screen. The engine output, the clock,
 * the recovery plan and the transport are all the same ones the desktop uses.
 */
type View = "impact" | "recovery";

export function MobileChaos({
  value,
  onChange,
  types,
  stake,
  target,
  clock,
  busy,
  onInject,
  onExit,
}: {
  value: ComposerValue;
  onChange: (next: Partial<ComposerValue>) => void;
  types: FailureTypeInfo[];
  stake: Stake | null;
  target: Asset | null;
  clock: SimulationClock;
  busy: boolean;
  onInject: () => void;
  onExit: () => void;
}) {
  const simulation = usePulse((s) => s.simulation);

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        {simulation ? (
          <RunView clock={clock} onExit={onExit} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3 p-3">
              <header className="px-1 pt-1">
                <h1 className="text-title text-primary">Chaos Lab</h1>
                <p className="pt-1 text-small leading-relaxed text-secondary">
                  Break one component and watch the failure travel through
                  everything that depends on it. Nothing real is touched.
                </p>
              </header>

              <FailureComposer
                value={value}
                onChange={onChange}
                types={types}
                onInject={onInject}
                busy={busy}
                collapsed={false}
                onExpand={() => {}}
              />

              {target && stake && (
                <TargetBrief
                  target={target}
                  stake={stake}
                  isSpof={false}
                  gated={[]}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------- run */

function RunView({
  clock,
  onExit,
}: {
  clock: SimulationClock;
  onExit: () => void;
}) {
  const simulation = usePulse((s) => s.simulation)!;
  const phase = usePulse((s) => s.simPhase);
  const impactedCount = usePulse((s) => s.impactedCount);
  const stateOf = usePulse((s) => s.stateOf);
  const isRevealed = usePulse((s) => s.isRevealed);
  const recoveryStep = usePulse((s) => s.recoveryStep);
  const [view, setView] = useState<View>("impact");

  useEffect(() => {
    setView(phase === "recovering" || phase === "restored" ? "recovery" : "impact");
  }, [phase]);

  const br = simulation.blast_radius;
  const restored = phase === "restored";
  const recovering = phase === "recovering" || restored;
  const broken = impactedCount();
  // The same turn the desktop headline makes: damage while it spreads, repair
  // once the plan is walking.
  const restoredCount = br.nodes.filter(
    (n) => n.id !== br.origin && isRevealed(n.id) && stateOf(n.id) === "HEALTHY"
  ).length;
  void recoveryStep;

  return (
    <>
      {/* ---- headline ------------------------------------------------ */}
      <header className="shrink-0 border-b border-border-subtle bg-surface px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-primary">
              {br.origin_name}
            </p>
            <p className="truncate text-caption text-tertiary">
              {br.failure_label} · {br.mode.toLowerCase()}
            </p>
          </div>
          <button
            onClick={onExit}
            className="shrink-0 rounded px-2 py-1 text-caption text-tertiary transition-colors hover:bg-subtle hover:text-primary"
          >
            Exit
          </button>
        </div>

        <div className="flex items-baseline gap-2 pt-2">
          <span
            className={`text-title-lg tnum ${
              recovering ? "text-healthy" : "text-failed"
            } transition-colors duration-slow ease-standard`}
          >
            {recovering ? restoredCount : broken}
          </span>
          {recovering && (
            <span className="text-body tnum text-quaternary">
              / {br.total_affected}
            </span>
          )}
          <span className="text-caption text-tertiary">
            {recovering
              ? "restored"
              : phase === "settled"
                ? "downstream assets affected"
                : "affected so far"}
          </span>
        </div>

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
      </header>

      <Tabs<View>
        value={view}
        onChange={setView}
        label="Impact and recovery"
        tabs={[
          { value: "impact", label: "Propagation" },
          { value: "recovery", label: "Recovery", count: simulation.recovery.length },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
        {view === "impact" ? <Cascade /> : <RecoveryTrack simulation={simulation} />}
      </div>

      <div
        data-surface
        className="shrink-0 border-t border-border-subtle bg-subtle"
      >
        <RunTransport
          clock={clock}
          simulation={simulation}
          onReplay={clock.restart}
        />
      </div>
    </>
  );
}

/* --------------------------------------------------------------- cascade */

/**
 * The propagation, read downward.
 *
 * One rung per hop, in the engine's own hop order, revealed as the clock
 * reaches each one. The rail on the left is the causal chain: everything under
 * a rung failed *because* of what is above it.
 */
function Cascade() {
  const simulation = usePulse((s) => s.simulation)!;
  const stateOf = usePulse((s) => s.stateOf);
  const isRevealed = usePulse((s) => s.isRevealed);
  const propagationHops = usePulse((s) => s.propagationHops);
  const recoveryStep = usePulse((s) => s.recoveryStep);

  const rungs = useMemo(() => {
    const byHop = new Map<number, typeof simulation.blast_radius.nodes>();
    for (const n of simulation.blast_radius.nodes) {
      byHop.set(n.hops, [...(byHop.get(n.hops) ?? []), n]);
    }
    return [...byHop.entries()].sort(([a], [b]) => a - b);
  }, [simulation]);

  return (
    <ol className="px-4 py-3">
      {rungs.map(([hop, nodes]) => {
        const shown = nodes.filter((n) => isRevealed(n.id));
        if (shown.length === 0) return null;
        return (
          <li key={hop} className="reveal relative pb-1 pl-5">
            {/* The rail: the causal chain, drawn once per rung. */}
            <span
              className="absolute bottom-0 left-[3px] top-3 w-px bg-border"
              aria-hidden
            />
            <span
              className={`absolute left-0 top-[9px] h-[7px] w-[7px] rounded-full ${
                hop === 0 ? "bg-failed" : "bg-border-strong"
              }`}
              aria-hidden
            />

            <p className="pb-1.5 pt-1 text-micro uppercase text-quaternary">
              {hop === 0 ? "Origin" : `Hop ${hop}`}
            </p>

            <ul className="space-y-px pb-2">
              {shown.map((n) => {
                const state = stateOf(n.id);
                return (
                  <li
                    key={n.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-subtle/50 px-2.5 py-2"
                  >
                    <StatusDot state={state} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small text-primary">{n.name}</p>
                      <p className="truncate text-caption text-tertiary">
                        {NODE_ABBR[n.type]} · {STATE[state].label}
                      </p>
                    </div>
                    <SeverityBadge severity={n.severity} />
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}

      {propagationHops < 1 && recoveryStep === 0 && (
        <li className="flex items-center gap-2 py-3 text-caption text-quaternary">
          <Icon name="chaos" size={12} />
          Injecting…
        </li>
      )}
    </ol>
  );
}
