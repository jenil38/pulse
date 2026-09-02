"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePulse } from "@/lib/store";
import { useAsync } from "@/hooks/useAsync";
import type { Scenario, Simulation } from "@/lib/types";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { Async, ErrorBanner, Spinner } from "@/components/ui/AsyncState";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Badge, EmptyState } from "@/components/ui/primitives";

/**
 * Scenario library.
 *
 * IMPORTANT / honesty: the backend exposes GET /api/scenarios and
 * POST /api/scenarios/{id}/run. There is no create or save endpoint, so this
 * surface offers read and run ONLY, and says so. It does not pretend users can
 * author scenarios — the Chaos Lab is where arbitrary failures are configured.
 */
const MODE_NOTE: Record<string, string> = {
  SOURCE_OUTAGE: "Starves everything downstream of fresh data.",
  SCHEMA_DRIFT: "Breaks parsing — transformations fail outright.",
  STALE_DATA: "Data is present but no longer refreshing.",
  VOLUME_DROP: "Wrong values flow through at reduced volume.",
  NULL_SPIKE: "Corrupts downstream aggregates with missing keys.",
  TRANSFORMATION_FAILURE: "A model build error halts the chain.",
  DUPLICATE_SPIKE: "Duplicated rows inflate every downstream metric.",
  WAREHOUSE_DELAY: "Load queue backs up; consumers read stale tables.",
  API_LATENCY: "Slow responses delay ingestion windows.",
  DATATYPE_CHANGE: "An unexpected type breaks downstream casts.",
};

export default function ScenariosPage() {
  const router = useRouter();
  const loadTopology = usePulse((s) => s.loadTopology);
  const setSimulation = usePulse((s) => s.setSimulation);
  const select = usePulse((s) => s.select);

  const scenarios = useAsync<Scenario[]>(() => api.scenarios(), []);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<unknown>(null);
  const [result, setResult] = useState<Simulation | null>(null);

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  const run = async (s: Scenario) => {
    setRunningId(s.id);
    setRunError(null);
    try {
      const sim = await api.runScenario(s.id);
      setResult(sim);
      setSimulation(sim, true);
      select(s.origin);
    } catch (e) {
      setRunError(e);
      setResult(null);
    } finally {
      setRunningId(null);
    }
  };

  const openInRoom = () => router.push("/control-room");

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Scenarios" />

        {!!scenarios.error && !!scenarios.data && (
          <ErrorBanner
            error={scenarios.error}
            onRetry={scenarios.reload}
            onDismiss={scenarios.dismissError}
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[920px] px-4 py-6 md:px-8 md:py-8">
            <header>
              <h1 className="text-title-lg text-primary">Scenario library</h1>
              <p className="max-w-prose pt-1.5 text-small leading-relaxed text-secondary">
                Predefined failure scenarios with deterministic, reproducible impact.
                Running one computes its blast radius and loads it into the topology.
              </p>
              <p className="max-w-prose pt-2 text-caption leading-relaxed text-quaternary">
                These scenarios ship with PULSE and are read-only — the API exposes
                list and run, not create. To configure an arbitrary failure against
                any asset, use the{" "}
                <button
                  onClick={() => router.push("/chaos-lab")}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Chaos Lab
                </button>
                .
              </p>
            </header>

            {!!runError && (
              <div className="pt-5">
                <div className="rounded-lg border border-failed-border bg-failed-bg px-4 py-3">
                  <p className="flex items-center gap-2 text-small font-medium text-primary">
                    <Icon name="warning" size={14} className="text-failed" />
                    {runError instanceof ApiError ? runError.title : "Scenario failed to run"}
                  </p>
                  <p className="pt-1 text-caption text-secondary">
                    {runError instanceof ApiError
                      ? runError.message
                      : "The simulation could not be computed. Please try again."}
                  </p>
                </div>
              </div>
            )}

            {/* Result of the most recent run */}
            {result && (
              <section className="mt-6 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-heading text-primary">
                    {result.origin_name} — {result.failure_label}
                  </h2>
                  <span className="text-caption text-tertiary">Result</span>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-3 pt-3">
                  <Figure label="Assets affected" value={result.blast_radius.total_affected} />
                  <Figure
                    label="Critical dashboards"
                    value={result.blast_radius.critical_dashboards.length}
                  />
                  <Figure label="ML models" value={result.blast_radius.ml_models.length} />
                  <Figure label="Teams" value={result.blast_radius.teams.length} />
                  <Figure label="Blast score" value={result.blast_radius.blast_score} />
                </div>
                {result.business_impact.teams.length > 0 && (
                  <p className="pt-3 text-small text-secondary">
                    Impacted: {result.business_impact.teams.join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-4">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={openInRoom}
                    trailing={<Icon name="arrowRight" size={13} />}
                  >
                    View in Control Room
                  </Button>
                  <Button size="sm" onClick={() => router.push("/compare")}>
                    Compare with another
                  </Button>
                </div>
              </section>
            )}

            {/* Library */}
            <div className="pt-8">
              <Async
                loading={scenarios.loading}
                error={scenarios.error}
                data={scenarios.data}
                onRetry={scenarios.reload}
                what="scenarios"
                isEmpty={(d) => d.length === 0}
                empty={
                  <EmptyState
                    title="No scenarios available"
                    hint="The API returned an empty scenario library."
                  />
                }
              >
                {(list) => (
                  <ul className="overflow-hidden rounded-lg border border-border">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-start gap-3 border-b border-border-subtle bg-surface px-4 py-3.5 last:border-b-0 sm:flex-nowrap"
                      >
                        <span className="mt-[2px] grid h-7 w-7 shrink-0 place-items-center rounded border border-border bg-subtle text-tertiary">
                          <Icon name="chaos" size={14} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-small font-medium text-primary">{s.name}</h3>
                            <Badge>{s.failure_type.replace(/_/g, " ").toLowerCase()}</Badge>
                          </div>
                          <p className="pt-1 text-caption text-secondary">
                            {MODE_NOTE[s.failure_type] ?? "Deterministic failure simulation."}
                          </p>
                          <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-2">
                            <Param label="Target" value={s.origin_name} />
                            <Param label="Change" value={s.parameter} mono />
                          </dl>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => run(s)}
                          disabled={runningId !== null}
                          className="shrink-0"
                        >
                          {runningId === s.id ? (
                            <>
                              <Spinner size={13} /> Running…
                            </>
                          ) : (
                            <>
                              <Icon name="play" size={12} /> Run
                            </>
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Async>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-caption text-tertiary">{label}</div>
      <div className="pt-0.5 text-title tnum text-primary">{value}</div>
    </div>
  );
}

function Param({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-caption text-quaternary">{label}</dt>
      <dd className={`text-caption text-secondary ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
