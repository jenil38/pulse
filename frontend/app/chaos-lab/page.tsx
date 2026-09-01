"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePulse } from "@/lib/store";
import { useChaosMode } from "@/lib/mode";
import { usePropagation } from "@/hooks/usePropagation";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import type { FailureType } from "@/lib/types";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { TopologyStage } from "@/components/room/TopologyStage";
import { FailureConfig } from "@/components/chaos/FailureConfig";
import { ImpactPanel } from "@/components/chaos/ImpactPanel";
import { PropagationBar } from "@/components/chaos/PropagationBar";
import { EmptyState } from "@/components/ui/primitives";

/**
 * Chaos Lab.
 *
 * Config on the left, the stage in the middle, predicted impact on the right.
 * Running a simulation shifts the whole environment into chaos mode — the
 * signature interaction — and exiting restores the professional workspace.
 */
function ChaosLabInner() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const topology = usePulse((s) => s.topology);
  const runSimulation = usePulse((s) => s.runSimulation);
  const clearSimulation = usePulse((s) => s.clearSimulation);
  const select = usePulse((s) => s.select);
  const [running, setRunning] = useState(false);
  const params = useSearchParams();
  const isDesktop = useIsDesktop();

  const { simulation, hops, maxHops, phase } = usePropagation();

  useChaosMode(!!simulation);

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  // Deep link from the Inspector's "Simulate failure" action.
  useEffect(() => {
    const target = params.get("target");
    if (target) select(target);
  }, [params, select]);

  const onRun = async (
    target: string,
    failure: FailureType,
    minutes: number,
    parameter: string
  ) => {
    setRunning(true);
    clearSimulation();
    await runSimulation(target, failure, minutes, parameter);
    setRunning(false);
  };

  if (!isDesktop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <EmptyState
          title="Chaos Lab needs a larger screen"
          hint="Failure simulation is a desktop workflow. Open PULSE on a wider display to run one."
        />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Chaos Lab" />
        <div className="flex min-h-0 flex-1">
          <FailureConfig onRun={onRun} running={running} />

          <div className="flex min-w-0 flex-1 flex-col">
            {topology ? (
              <>
                <TopologyStage />
                <PropagationBar
                  simulation={simulation}
                  hops={hops}
                  maxHops={maxHops}
                  phase={phase}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <span className="text-small text-quaternary">Loading topology…</span>
              </div>
            )}
          </div>

          <ImpactPanel simulation={simulation} revealedHops={hops} />
        </div>
      </div>
    </AppShell>
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
