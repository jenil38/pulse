"use client";

import Link from "next/link";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import { useAsync } from "@/hooks/useAsync";
import type {
  Incident,
  IncidentFrequency,
  Resilience,
  ResilienceHistory,
} from "@/lib/types";
import { STATE, formatRelative, scoreBand } from "@/lib/visual";
import { AreaChart, BarSeries, StackedBar } from "@/components/ui/Chart";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/AsyncState";
import { PanelHeader, SeverityBadge, StatusDot } from "@/components/ui/primitives";

/**
 * System overview — what the inspector shows when nothing is selected.
 *
 * Previously that 304px column sat empty on almost every visit, which is a
 * large part of why the Control Room felt unfinished. An operator opening the
 * product should immediately see: how healthy the estate is, whether resilience
 * is trending the right way, how often this system breaks, what is currently
 * wrong, and what is most fragile — without clicking anything.
 */
export function OverviewPanel() {
  const topology = usePulse((s) => s.topology);
  const healthCounts = usePulse((s) => s.healthCounts);
  const stateOf = usePulse((s) => s.stateOf);
  const select = usePulse((s) => s.select);
  const simulation = usePulse((s) => s.simulation);

  const resHistory = useAsync<ResilienceHistory>(() => api.resilienceHistory(30), []);
  const freq = useAsync<IncidentFrequency>(() => api.incidentFrequency(30), []);
  const incidents = useAsync<Incident[]>(() => api.incidents(), []);
  const resilience = useAsync<Resilience>(() => api.resilience(), []);

  const counts = healthCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const band = resHistory.data ? scoreBand(resHistory.data.current) : null;

  // Trend direction over the window — stated plainly, never as a prediction.
  const delta = useMemo(() => {
    const pts = resHistory.data?.points ?? [];
    if (pts.length < 2) return null;
    return Math.round(pts[pts.length - 1].value - pts[0].value);
  }, [resHistory.data]);

  // Anything not healthy, worst first — the operator's actual worklist.
  const attention = useMemo(() => {
    const rank: Record<string, number> = {
      FAILED: 0,
      DEGRADED: 1,
      STALE: 2,
      RECOVERING: 3,
      HEALTHY: 4,
    };
    return (topology?.assets ?? [])
      .map((a) => ({ asset: a, state: stateOf(a.id) }))
      .filter((x) => x.state !== "HEALTHY")
      .sort(
        (a, b) => rank[a.state] - rank[b.state] || a.asset.name.localeCompare(b.asset.name)
      )
      .slice(0, 6);
  }, [topology, stateOf, simulation]);

  const openIncidents = (incidents.data ?? []).filter((i) => i.status !== "resolved");
  const topSpofs = Object.entries(resilience.data?.spofs ?? {}).slice(0, 3);
  const assetName = (id: string) =>
    topology?.assets.find((a) => a.id === id)?.name ?? id;

  return (
    <aside
      data-surface
      className="flex h-full w-[320px] shrink-0 flex-col bg-surface"
    >
      <PanelHeader>Overview</PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Estate health composition */}
        <section className="border-b border-border px-5 py-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-caption text-tertiary">Estate health</h3>
            <span className="text-caption tnum text-quaternary">{total} assets</span>
          </div>
          <div className="pt-2.5">
            <StackedBar
              height={8}
              segments={[
                { value: counts.HEALTHY, className: "bg-healthy", label: "Healthy" },
                { value: counts.RECOVERING, className: "bg-recovering", label: "Recovering" },
                { value: counts.STALE, className: "bg-stale", label: "Stale" },
                { value: counts.DEGRADED, className: "bg-degraded", label: "Degraded" },
                { value: counts.FAILED, className: "bg-failed", label: "Failed" },
              ]}
            />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3">
            {(["HEALTHY", "DEGRADED", "STALE", "FAILED"] as const).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <StatusDot state={s} />
                <dt className="flex-1 text-caption text-tertiary">{STATE[s].label}</dt>
                <dd className="text-caption tnum text-primary">{counts[s]}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Resilience trend */}
        <section className="border-b border-border px-5 py-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-caption text-tertiary">Resilience · 30 days</h3>
            {delta !== null && (
              <span
                className={
                  "flex items-center gap-0.5 text-caption tnum " +
                  (delta > 0 ? "text-healthy" : delta < 0 ? "text-degraded" : "text-quaternary")
                }
              >
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
          </div>

          {resHistory.loading && !resHistory.data ? (
            <div className="flex h-[92px] items-center justify-center">
              <Spinner />
            </div>
          ) : resHistory.error ? (
            <p className="pt-2 text-caption text-quaternary">Trend unavailable.</p>
          ) : (
            resHistory.data && (
              <>
                <div className="flex items-baseline gap-1.5 pb-1 pt-1">
                  <span className={"text-title tnum " + (band?.text ?? "")}>
                    {resHistory.data.current}
                  </span>
                  <span className="text-caption text-quaternary">/ 100</span>
                  <span className="text-caption text-tertiary">{band?.label}</span>
                </div>
                <AreaChart
                  points={resHistory.data.points}
                  height={72}
                  tone={
                    resHistory.data.current >= 80
                      ? "healthy"
                      : resHistory.data.current >= 60
                        ? "degraded"
                        : "failed"
                  }
                />
                <Link
                  href="/resilience"
                  className="mt-2 inline-flex items-center gap-1 text-caption text-accent transition-colors hover:text-accent-hover"
                >
                  Full breakdown
                  <Icon name="arrowRight" size={12} />
                </Link>
              </>
            )
          )}
        </section>

        {/* Needs attention */}
        <section className="border-b border-border px-5 py-5">
          <h3 className="text-caption text-tertiary">Needs attention</h3>
          {attention.length === 0 ? (
            <p className="pt-2 text-caption text-quaternary">
              Every asset is healthy.
            </p>
          ) : (
            <ul className="-mx-2 pt-1.5">
              {attention.map(({ asset, state }) => (
                <li key={asset.id}>
                  <button
                    onClick={() => select(asset.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors duration-instant hover:bg-subtle"
                  >
                    <StatusDot state={state} />
                    <span className="min-w-0 flex-1 truncate text-small text-primary">
                      {asset.name}
                    </span>
                    <span className={"shrink-0 text-caption " + STATE[state].text}>
                      {STATE[state].label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Incident frequency */}
        <section className="border-b border-border px-5 py-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-caption text-tertiary">Incidents · 30 days</h3>
            {freq.data && (
              <span className="text-caption tnum text-quaternary">{freq.data.total}</span>
            )}
          </div>
          <div className="pt-2">
            {freq.data ? (
              <BarSeries
                points={freq.data.points.map((p) => ({ t: p.t, value: p.count }))}
                height={40}
                tone="failed"
              />
            ) : (
              <div className="h-[40px]" />
            )}
          </div>

          {openIncidents.length > 0 && (
            <ul className="-mx-2 pt-2">
              {openIncidents.slice(0, 3).map((i) => (
                <li key={i.id}>
                  <Link
                    href={"/incidents/" + i.id}
                    className="flex items-start gap-2 rounded px-2 py-1.5 transition-colors duration-instant hover:bg-subtle"
                  >
                    <span className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full bg-failed" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small text-primary">{i.title}</span>
                      <span className="block text-caption text-quaternary">
                        {formatRelative(i.started_at)}
                      </span>
                    </span>
                    <SeverityBadge severity={i.severity} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Fragility */}
        <section className="px-5 py-5">
          <h3 className="text-caption text-tertiary">Most fragile</h3>
          {topSpofs.length === 0 ? (
            <p className="pt-2 text-caption text-quaternary">
              No single points of failure detected.
            </p>
          ) : (
            <ul className="-mx-2 pt-1.5">
              {topSpofs.map(([id, gated]) => (
                <li key={id}>
                  <button
                    onClick={() => select(id)}
                    className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors duration-instant hover:bg-subtle"
                  >
                    <Icon name="warning" size={13} className="mt-[3px] text-degraded" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small text-primary">
                        {assetName(id)}
                      </span>
                      <span className="block text-caption text-quaternary">
                        gates {gated.length} critical consumer
                        {gated.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-border px-4 py-2.5">
        <p className="text-caption text-quaternary">
          Trends are generated from a deterministic simulator, not measured.
        </p>
      </div>
    </aside>
  );
}
