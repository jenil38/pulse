"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { IncidentDetail } from "@/lib/types";
import { NavRail } from "@/components/room/NavRail";
import { StatusBar } from "@/components/room/StatusBar";
import { ReplayTimeline } from "@/components/incidents/ReplayTimeline";
import { Button } from "@/components/ui/primitives";

const TopologyScene = dynamic(
  () => import("@/components/three/TopologyScene").then((m) => m.TopologyScene),
  { ssr: false }
);

export default function IncidentReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const loadTopology = usePulse((s) => s.loadTopology);
  const setSimulation = usePulse((s) => s.setSimulation);
  const advance = usePulse((s) => s.advancePropagation);
  const setPhase = usePulse((s) => s.setSimPhase);
  const clearSimulation = usePulse((s) => s.clearSimulation);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [t, setT] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadTopology();
    api.incident(id).then(setIncident).catch(() => setIncident(null));
    return () => clearSimulation();
  }, [id, loadTopology, clearSimulation]);

  // Feed the incident's blast radius into the shared 3D store so the topology
  // renders the incident state, then drive it from the scrub position.
  useEffect(() => {
    if (!incident) return;
    setSimulation({
      id: incident.id,
      simulated: true,
      origin: incident.origin,
      origin_name: incident.origin_name,
      failure_type: incident.failure_type,
      failure_label: incident.blast_radius.failure_label,
      parameter: null,
      duration_minutes: 30,
      blast_radius: incident.blast_radius,
      recovery: incident.recovery,
      timeline: incident.timeline,
      business_impact: {
        affected_assets: incident.blast_radius.total_affected,
        critical_dashboards: incident.blast_radius.critical_dashboards,
        ml_models: incident.blast_radius.ml_models,
        business_processes: incident.blast_radius.business_processes,
        teams: incident.teams,
        blast_score: incident.blast_radius.blast_score,
      },
    });
    setPhase("settled");
  }, [incident, setSimulation, setPhase]);

  // Map scrub time -> how many hops have propagated (180s per hop, per engine).
  useEffect(() => {
    advance(Math.floor(t / 180));
  }, [t, advance]);

  const activeEvents = useMemo(
    () => (incident ? incident.timeline.filter((e) => e.t <= t) : []),
    [incident, t]
  );

  const act = async (kind: "ack" | "resolve") => {
    if (!incident) return;
    setBusy(true);
    try {
      const updated =
        kind === "ack"
          ? await api.acknowledgeIncident(incident.id)
          : await api.resolveIncident(incident.id);
      setIncident({ ...incident, ...updated });
    } catch {
      /* surfaced by status below */
    } finally {
      setBusy(false);
    }
  };

  if (!incident) {
    return (
      <div className="flex h-screen flex-col bg-void">
        <StatusBar />
        <div className="flex flex-1 items-center justify-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            Loading incident…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <StatusBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />

        <main className="haze relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <TopologyScene cursor="REPLAY" />

            {/* Incident header, overlaid top-left */}
            <div className="pointer-events-none absolute left-4 top-4 max-w-md">
              <Link
                href="/incidents"
                className="pointer-events-auto font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint hover:text-ink-dim"
              >
                ← Incidents
              </Link>
              <h1 className="pt-2 font-mono text-sm text-ink">{incident.title}</h1>
              <p className="pt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                {incident.id} · {incident.status} · {incident.affected_assets} assets
                affected
              </p>
            </div>

            {/* Event log, overlaid right */}
            <div className="absolute right-4 top-4 max-h-[60%] w-72 overflow-y-auto border border-line bg-base/92">
              <div className="border-b border-line px-3 py-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
                  Event log
                </span>
              </div>
              <ol>
                {activeEvents.map((e, i) => (
                  <li
                    key={i}
                    className="animate-fade-up border-b border-line/50 px-3 py-2"
                  >
                    <div className="font-mono text-[9px] tabular-nums text-ink-faint">
                      {fmt(e.t)}
                    </div>
                    <div className="pt-0.5 font-mono text-[10px] leading-snug text-ink-dim">
                      {e.label}
                    </div>
                  </li>
                ))}
                {activeEvents.length === 0 && (
                  <li className="px-3 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                    Scrub or play to replay
                  </li>
                )}
              </ol>
            </div>

            {/* Lifecycle actions */}
            <div className="absolute bottom-4 left-4 flex gap-2">
              <Button
                onClick={() => act("ack")}
                disabled={busy || incident.status !== "open"}
              >
                Acknowledge
              </Button>
              <Button
                variant="primary"
                onClick={() => act("resolve")}
                disabled={busy || incident.status === "resolved"}
              >
                Resolve
              </Button>
            </div>
          </div>

          <ReplayTimeline incident={incident} t={t} onScrub={setT} />
        </main>
      </div>
    </div>
  );
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
