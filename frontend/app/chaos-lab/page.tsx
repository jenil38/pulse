"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePulse } from "@/lib/store";
import { usePropagation } from "@/hooks/usePropagation";
import type { FailureType } from "@/lib/types";
import { FailureConfig } from "@/components/chaos/FailureConfig";
import { ImpactPanel } from "@/components/chaos/ImpactPanel";
import { NavRail } from "@/components/room/NavRail";
import { StatusBar } from "@/components/room/StatusBar";
import { PropagationBar } from "@/components/chaos/PropagationBar";

const TopologyScene = dynamic(
  () => import("@/components/three/TopologyScene").then((m) => m.TopologyScene),
  { ssr: false }
);

function ChaosLabInner() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const topology = usePulse((s) => s.topology);
  const runSimulation = usePulse((s) => s.runSimulation);
  const clearSimulation = usePulse((s) => s.clearSimulation);
  const select = usePulse((s) => s.select);
  const [running, setRunning] = useState(false);
  const params = useSearchParams();

  const { simulation, hops, maxHops, phase } = usePropagation();

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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <StatusBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />

        <div className="hidden w-[268px] shrink-0 md:block">
          <FailureConfig onRun={onRun} running={running} />
        </div>

        <main className="relative min-w-0 flex-1 haze">
          {topology ? (
            <>
              <TopologyScene cursor="SIMULATE" />
              <PropagationBar
                simulation={simulation}
                hops={hops}
                maxHops={maxHops}
                phase={phase}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                Loading topology…
              </span>
            </div>
          )}
        </main>

        <div className="hidden w-[312px] shrink-0 lg:block">
          <ImpactPanel simulation={simulation} revealedHops={hops} />
        </div>
      </div>
    </div>
  );
}

export default function ChaosLabPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-void">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Loading Chaos Lab…
          </span>
        </div>
      }
    >
      <ChaosLabInner />
    </Suspense>
  );
}
