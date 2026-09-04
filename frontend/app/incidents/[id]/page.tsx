"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import { useChaosMode } from "@/lib/mode";
import { formatDuration } from "@/lib/visual";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { TopologyStage } from "@/components/room/TopologyStage";
import { ReplayTimeline } from "@/components/incidents/ReplayTimeline";
import { Button } from "@/components/ui/Button";
import {
  PanelHeader,
  Property,
  SeverityBadge,
} from "@/components/ui/primitives";
import { ErrorState, LoadingState } from "@/components/ui/AsyncState";
import type { IncidentDetail } from "@/lib/types";

/**
 * Incident replay.
 *
 * Scrubbing drives the shared topology store, so the map, the event feed and
 * the timeline all reflect the same instant. The environment sits in chaos mode
 * for the duration — this is a failure being examined, not routine admin.
 */
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
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useChaosMode(!!incident);

  useEffect(() => {
    let cancelled = false;
    loadTopology();
    setLoadError(null);
    api
      .incident(id)
      .then((d) => !cancelled && setIncident(d))
      .catch((e) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
      clearSimulation();
    };
  }, [id, reloadKey, loadTopology, clearSimulation]);

  // Feed the incident's blast radius into the shared store so the topology
  // renders it, then drive that from the scrub position.
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

  // 180s per hop — matches the engine's timeline generation.
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
      setActionError(null);
    } catch (e) {
      // Surface it — silently failing an acknowledge is worse than an error.
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <AppShell>
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar title="Incident" />
          <ErrorState
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            what="this incident"
          />
        </div>
      </AppShell>
    );
  }

  if (!incident) {
    return (
      <AppShell>
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar title="Incident" />
          <LoadingState label="Loading incident…" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Incident replay" />

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TopologyStage />
            <ReplayTimeline incident={incident} t={t} onScrub={setT} />
          </div>

          {/* Detail + event feed */}
          <aside
            data-surface
            className="flex max-h-[45vh] w-full shrink-0 flex-col border-t border-border bg-subtle xl:h-full xl:max-h-none xl:w-[320px] xl:border-l xl:border-t-0"
          >
            <PanelHeader
              actions={
                <Link
                  href="/incidents"
                  className="text-caption text-tertiary transition-colors hover:text-primary"
                >
                  All
                </Link>
              }
            >
              {incident.title}
            </PanelHeader>

            <div className="shrink-0 border-b border-border px-4 py-3">
              <dl>
                <Property label="ID" mono>
                  {incident.id}
                </Property>
                <Property label="Status">
                  <span className="capitalize">{incident.status}</span>
                </Property>
                <Property label="Severity">
                  <SeverityBadge severity={incident.severity} />
                </Property>
                <Property label="Origin">{incident.origin_name}</Property>
                <Property label="Affected" mono>
                  {incident.affected_assets}
                </Property>
                {incident.teams.length > 0 && (
                  <Property label="Teams">{incident.teams.join(", ")}</Property>
                )}
              </dl>

              {!!actionError && (
                <p role="alert" className="pt-2 text-caption text-failed">
                  That action could not be completed. Please try again.
                </p>
              )}

              <div className="flex gap-2 pt-3">
                <Button
                  size="sm"
                  onClick={() => act("ack")}
                  disabled={busy || incident.status !== "open"}
                >
                  Acknowledge
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => act("resolve")}
                  disabled={busy || incident.status === "resolved"}
                >
                  Resolve
                </Button>
              </div>
            </div>

            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-micro uppercase text-quaternary">Event log</span>
              <span className="text-caption tnum text-quaternary">
                {activeEvents.length} / {incident.timeline.length}
              </span>
            </div>

            <ol className="min-h-0 flex-1 overflow-y-auto">
              {activeEvents.length === 0 ? (
                <li className="px-4 py-3 text-small text-quaternary">
                  Press play or scrub the timeline to replay this incident.
                </li>
              ) : (
                activeEvents.map((e, i) => (
                  <li
                    key={i}
                    className="flex gap-3 border-b border-border-subtle px-4 py-2"
                  >
                    <span className="w-10 shrink-0 pt-px font-mono text-caption tnum text-quaternary">
                      {formatDuration(e.t)}
                    </span>
                    <span className="text-small leading-snug text-secondary">
                      {e.label}
                    </span>
                  </li>
                ))
              )}
            </ol>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
