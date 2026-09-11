"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import { useChaosMode } from "@/lib/mode";
import { buildAdjacency, descendants, stakeOf } from "@/lib/lineage";
import type { FailureType, FailureTypeInfo, Resilience } from "@/lib/types";
import { useAsync } from "@/hooks/useAsync";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useSimulationClock } from "@/hooks/useSimulationClock";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { ChaosStage } from "@/components/chaos/ChaosStage";
import { ConsequenceFeed } from "@/components/chaos/ConsequenceFeed";
import { FailureComposer, type ComposerValue } from "@/components/chaos/FailureComposer";
import { ImpactLedger } from "@/components/chaos/ImpactLedger";
import { MobileChaos } from "@/components/chaos/MobileChaos";
import { RunTransport } from "@/components/chaos/RunTransport";
import { TargetBrief } from "@/components/chaos/TargetBrief";
import { ErrorState, LoadingState } from "@/components/ui/AsyncState";

/**
 * Chaos Lab.
 *
 * The room reads as one continuous act: a calm system, a target chosen and
 * weighed, a failure held down and committed, a blast radius that opens one
 * dependency at a time, the bill in plain language, and then the plan that
 * puts it back. The topology is the whole surface; everything else floats over
 * it in glass so the graph is never boxed out by chrome.
 *
 * THE CAMERA HOLDS THE SHOT. An earlier pass pushed in on the target while it
 * was being aimed and pulled back on injection, and it was worse in every way
 * that matters: framing one node hides the graph, which is precisely the thing
 * the user needs to see in order to understand a blast radius. So the camera
 * composes the whole system once and then stays put, and the movement in the
 * frame is the failure travelling, the subject moves, not the lens. The reach
 * of a candidate target is shown by lighting it instead, through the same
 * lineage-trace affordance the Control Room already uses.
 */
function ChaosLabInner() {
  const router = useRouter();
  const params = useSearchParams();
  const isDesktop = useIsDesktop();

  const loadTopology = usePulse((s) => s.loadTopology);
  const topology = usePulse((s) => s.topology);
  const loading = usePulse((s) => s.loading);
  const error = usePulse((s) => s.error);
  const simulation = usePulse((s) => s.simulation);
  const runSimulation = usePulse((s) => s.runSimulation);
  const clearSimulation = usePulse((s) => s.clearSimulation);
  const select = usePulse((s) => s.select);
  const aim = usePulse((s) => s.aim);
  const trace = usePulse((s) => s.trace);
  const clearTrace = usePulse((s) => s.clearTrace);

  const [types, setTypes] = useState<FailureTypeInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const [value, setValue] = useState<ComposerValue>({
    target: null,
    failure: "SCHEMA_DRIFT",
    minutes: 30,
    parameter: "",
  });

  const clock = useSimulationClock();
  useChaosMode(!!simulation);

  // The resilience pass already knows which components gate a critical
  // consumer. Reusing that answer is what lets the brief say "single point of
  // failure" without inventing a second definition of one.
  const resilience = useAsync<Resilience>(() => api.resilience(), []);

  useEffect(() => {
    loadTopology();
    api.failureTypes().then(setTypes).catch(() => setTypes([]));
  }, [loadTopology]);

  /* ---- deep links -------------------------------------------------- */
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !topology) return;
    applied.current = true;
    const target = params.get("target");
    const failure = params.get("failure");
    const duration = Number(params.get("duration"));
    const known = topology.assets.some((a) => a.id === target);
    setValue((v) => ({
      ...v,
      target: known ? target : v.target,
      failure: isFailureType(failure) ? failure : v.failure,
      minutes:
        Number.isFinite(duration) && duration >= 5 && duration <= 240
          ? duration
          : v.minutes,
    }));
  }, [params, topology]);

  /* ---- what depends on the target ---------------------------------- */
  const adjacency = useMemo(
    () => buildAdjacency(topology?.dependencies ?? []),
    [topology]
  );

  const stake = useMemo(
    () => stakeOf(topology?.assets ?? [], adjacency, value.target),
    [topology, adjacency, value.target]
  );

  const target = topology?.assets.find((a) => a.id === value.target) ?? null;
  const spofs = resilience.data?.spofs ?? {};
  const gatedNames = useMemo(() => {
    const ids = value.target ? (spofs[value.target] ?? []) : [];
    const byId = new Map((topology?.assets ?? []).map((a) => [a.id, a.name]));
    return ids.map((id) => byId.get(id) ?? id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.target, resilience.data, topology]);

  /* ---- aiming: mark the target, light what depends on it ----------- */
  useEffect(() => {
    if (simulation) return;
    aim(value.target);
    if (!value.target) {
      clearTrace();
      return;
    }
    // The existing trace affordance already dims everything outside a set, so
    // the pre-run reach is shown with the mechanism the product already has,
    // and the camera never has to move to make the point.
    trace([value.target, ...descendants(adjacency, value.target)]);
  }, [value.target, simulation, adjacency, aim, trace, clearTrace]);

  // The mark is the simulation's own origin for the duration of a run, so the
  // aim is handed over rather than drawn twice.
  useEffect(() => {
    if (simulation) aim(null);
  }, [simulation, aim]);

  /* ---- inject ------------------------------------------------------ */
  const inject = useCallback(async () => {
    if (!value.target || busy) return;
    setBusy(true);
    clearSimulation();
    // Drop the aiming highlight. From here the map dims by what the run has
    // reached, so the opening frame shows the origin alone, lit against a
    // system that is still whole.
    clearTrace();
    select(null);
    setComposerOpen(false);
    await runSimulation(value.target, value.failure, value.minutes, value.parameter);
    setBusy(false);
  }, [value, busy, runSimulation, clearSimulation, clearTrace, select]);

  // A fresh result starts playing on its own, the run was already committed.
  const restartRef = useRef(clock.restart);
  restartRef.current = clock.restart;
  const runId = simulation?.id ?? null;
  useEffect(() => {
    if (runId) restartRef.current();
  }, [runId]);

  const exitRun = useCallback(() => {
    clearSimulation();
    setComposerOpen(true);
  }, [clearSimulation]);

  const compare = useCallback(() => {
    if (!simulation) return;
    const br = simulation.blast_radius;
    router.push(
      `/compare?a_origin=${encodeURIComponent(br.origin)}&a_failure=${br.failure_type}`
    );
  }, [router, simulation]);

  /* ---- transport keys ---------------------------------------------- */
  useEffect(() => {
    if (!simulation) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === " ") {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        clock.step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        clock.step(-1);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        clock.restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [simulation, clock]);

  if (!isDesktop) {
    return (
      <MobileChaos
        value={value}
        onChange={(next) => setValue((v) => ({ ...v, ...next }))}
        types={types}
        stake={stake}
        target={target}
        clock={clock}
        busy={busy}
        onInject={inject}
        onExit={exitRun}
      />
    );
  }

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Chaos Lab" />

        {error && !topology ? (
          <ErrorState
            error={error}
            onRetry={loadTopology}
            what="the system topology"
          />
        ) : loading && !topology ? (
          <LoadingState label="Loading topology…" />
        ) : (
          <>
            <ChaosStage>
              <div className="pointer-events-none absolute inset-0 z-20">
                {/* Left: what to break, and what depends on it. */}
                {/* The brief is the beat that has to be read, so it keeps its
                    height and the composer takes the slack, a form can
                    scroll, a consequence should not have to be hunted for. */}
                {/* Below xl there is not room for two 300-odd-pixel columns
                    over a graph that also has to stay readable, so during a
                    run the ledger has the stage to itself and the composer is
                    reached again through Exit. */}
                <div
                  className={[
                    "pointer-events-auto absolute bottom-16 left-4 top-4 flex w-[304px] flex-col gap-2.5",
                    simulation ? "hidden xl:flex" : "flex",
                  ].join(" ")}
                >
                  <FailureComposer
                    value={value}
                    onChange={(next) => setValue((v) => ({ ...v, ...next }))}
                    types={types}
                    onInject={inject}
                    busy={busy}
                    collapsed={!composerOpen}
                    onExpand={() => setComposerOpen(true)}
                  />
                  {composerOpen && target && stake && (
                    <TargetBrief
                      target={target}
                      stake={stake}
                      isSpof={!!spofs[target.id]}
                      gated={gatedNames}
                    />
                  )}
                </div>

                {/* Right: what it cost, and how it comes back. */}
                {simulation && (
                  <div className="pointer-events-auto absolute bottom-16 right-4 top-4 flex w-[300px] flex-col xl:w-[340px]">
                    <ImpactLedger
                      simulation={simulation}
                      onExit={exitRun}
                      onCompare={compare}
                      recoverySpan={clock.recovery}
                    />
                  </div>
                )}

                {/* Centre: what just happened, in one line.
                    The feed lives in a region bounded by the two columns and
                    lifted clear of the legend rail, so it can never land on a
                    panel or a control. A subtitle that collides with the thing
                    it is describing reads as debug output. */}
                {simulation && (
                  <div className="absolute bottom-11 left-4 right-[316px] flex justify-center xl:left-[320px] xl:right-[356px]">
                    <ConsequenceFeed simulation={simulation} t={clock.t} />
                  </div>
                )}
              </div>
            </ChaosStage>

            {simulation && (
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
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function isFailureType(v: string | null): v is FailureType {
  return (
    !!v &&
    [
      "SOURCE_OUTAGE",
      "SCHEMA_DRIFT",
      "STALE_DATA",
      "VOLUME_DROP",
      "NULL_SPIKE",
      "DUPLICATE_SPIKE",
      "TRANSFORMATION_FAILURE",
      "WAREHOUSE_DELAY",
      "API_LATENCY",
      "DATATYPE_CHANGE",
    ].includes(v)
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    !!el?.isContentEditable
  );
}

export default function ChaosLabPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-canvas">
          <span className="text-small text-quaternary">Loading Chaos Lab…</span>
        </div>
      }
    >
      <ChaosLabInner />
    </Suspense>
  );
}
