"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import { useAsync } from "@/hooks/useAsync";
import type { Resilience } from "@/lib/types";
import { NODE_LABEL, scoreBand } from "@/lib/visual";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { Async, ErrorBanner } from "@/components/ui/AsyncState";
import { Button } from "@/components/ui/Button";
import { Icon, NodeGlyph } from "@/components/ui/Icon";
import { Badge, StatusDot, Table, Td, Th } from "@/components/ui/primitives";

/**
 * Resilience — the score, why it is what it is, and where the system is weakest.
 *
 * The backend already returns the full penalty breakdown and the SPOF map from
 * GET /api/resilience; previously the UI showed only the headline number. This
 * surface exposes the reasoning, which is the point of an *explainable* score.
 */
const COMPONENT_LABEL: Record<string, string> = {
  single_points_of_failure: "Single points of failure",
  blast_concentration: "Blast concentration",
  source_redundancy: "Source redundancy",
  dependency_depth: "Dependency depth",
  incident_history: "Incident history",
  recovery_complexity: "Recovery complexity",
};

/** Documented maximum deduction per component (see backend resilience.py). */
const COMPONENT_MAX: Record<string, number> = {
  single_points_of_failure: 18,
  blast_concentration: 12,
  source_redundancy: 8,
  dependency_depth: 10,
  incident_history: 10,
  recovery_complexity: 8,
};

export default function ResiliencePage() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const topology = usePulse((s) => s.topology);
  const select = usePulse((s) => s.select);
  const stateOf = usePulse((s) => s.stateOf);
  const router = useRouter();

  const res = useAsync<Resilience>(() => api.resilience(), []);

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  const assetName = useMemo(() => {
    const m = new Map<string, { name: string; type: string }>();
    for (const a of topology?.assets ?? []) m.set(a.id, { name: a.name, type: a.type });
    return m;
  }, [topology]);

  /** Jump to an asset in the Control Room topology. */
  const inspect = (id: string) => {
    select(id);
    router.push("/control-room");
  };

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Resilience" />

        {!!res.error && !!res.data && (
          <ErrorBanner error={res.error} onRetry={res.reload} onDismiss={res.dismissError} />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Async
            loading={res.loading}
            error={res.error}
            data={res.data}
            onRetry={res.reload}
            what="the resilience report"
          >
            {(r) => {
              const band = scoreBand(r.score);
              const totalPenalty = r.components.reduce((n, c) => n + c.penalty, 0);
              const spofEntries = Object.entries(r.spofs);

              return (
                <div className="mx-auto max-w-[920px] px-4 py-6 md:px-8 md:py-8">
                  {/* Score */}
                  <section>
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                      <div>
                        <p className="text-caption text-tertiary">System resilience</p>
                        <p className="flex items-baseline gap-2 pt-1">
                          <span className={`text-[3rem] font-medium leading-none tnum ${band.text}`}>
                            {r.score}
                          </span>
                          <span className="text-body text-quaternary">/ 100</span>
                          <span className={`text-body ${band.text}`}>{band.label}</span>
                        </p>
                      </div>
                      <div className="min-w-[200px] flex-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              r.score >= 80 ? "bg-healthy" : r.score >= 60 ? "bg-degraded" : "bg-failed"
                            }`}
                            style={{ width: `${r.score}%` }}
                          />
                        </div>
                        <p className="pt-1.5 text-caption text-quaternary">
                          100 − {totalPenalty.toFixed(1)} penalty points
                        </p>
                      </div>
                    </div>

                    <p className="max-w-prose pt-4 text-small leading-relaxed text-secondary">
                      This score is a deterministic graph calculation, not a prediction.
                      It starts at 100 and subtracts capped penalties for each structural
                      weakness below. There is no model and no probability involved.
                    </p>
                  </section>

                  {/* Weakest component */}
                  {r.weakest_component && (
                    <section className="mt-8 rounded-lg border border-border bg-surface p-4">
                      <p className="text-caption text-tertiary">Weakest component</p>
                      <div className="flex flex-wrap items-center gap-2 pt-1.5">
                        <h2 className="text-title text-primary">{r.weakest_component_name}</h2>
                        <Badge tone="FAILED">Highest exposure</Badge>
                      </div>
                      <p className="pt-1.5 text-small text-secondary">{r.weakest_reason}</p>
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={() => inspect(r.weakest_component!)}
                        trailing={<Icon name="arrowRight" size={13} />}
                      >
                        Inspect in topology
                      </Button>
                    </section>
                  )}

                  {/* Contributing factors */}
                  <section className="mt-8">
                    <h2 className="text-heading text-primary">Contributing factors</h2>
                    <p className="pt-1 text-small text-tertiary">
                      Each factor is capped, so no single weakness can dominate the score.
                    </p>
                    <div className="pt-4">
                      <Table>
                        <thead>
                          <tr>
                            <Th>Factor</Th>
                            <Th>Why it matters</Th>
                            <Th align="right" width="140px">Penalty</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.components.map((c) => {
                            const max = COMPONENT_MAX[c.name] ?? 20;
                            const pct = Math.min(100, (c.penalty / max) * 100);
                            return (
                              <tr key={c.name}>
                                <Td className="text-primary">
                                  {COMPONENT_LABEL[c.name] ?? c.name}
                                </Td>
                                <Td className="text-secondary">{c.detail}</Td>
                                <Td align="right">
                                  <span className="flex items-center justify-end gap-2">
                                    <span className="h-[3px] w-16 overflow-hidden rounded-full bg-muted">
                                      <span
                                        className={`block h-full rounded-full ${
                                          pct > 60 ? "bg-failed" : pct > 25 ? "bg-degraded" : "bg-healthy"
                                        }`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </span>
                                    <span className="w-16 text-right font-mono text-caption tnum text-primary">
                                      −{c.penalty} / {max}
                                    </span>
                                  </span>
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  </section>

                  {/* SPOFs */}
                  <section className="mt-10">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-heading text-primary">Single points of failure</h2>
                      <span className="text-caption tnum text-tertiary">{r.spof_count} found</span>
                    </div>
                    <p className="max-w-prose pt-1 text-small text-tertiary">
                      A component is a single point of failure when its loss degrades at least
                      one critical or high-criticality consumer, and the topology models no
                      alternate path around it.
                    </p>

                    {spofEntries.length === 0 ? (
                      <p className="pt-4 text-small text-quaternary">
                        No single points of failure detected.
                      </p>
                    ) : (
                      <ul className="mt-4 overflow-hidden rounded-lg border border-border">
                        {spofEntries.map(([id, gated]) => {
                          const meta = assetName.get(id);
                          return (
                            <li
                              key={id}
                              className="flex flex-wrap items-start gap-3 border-b border-border-subtle bg-surface px-4 py-3 last:border-b-0"
                            >
                              <span className="mt-[2px] grid h-7 w-7 shrink-0 place-items-center rounded border border-border bg-subtle text-tertiary">
                                {meta && (
                                  <NodeGlyph type={meta.type as never} size={14} />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusDot state={stateOf(id)} />
                                  <span className="text-small font-medium text-primary">
                                    {meta?.name ?? id}
                                  </span>
                                  {meta && (
                                    <span className="text-caption text-tertiary">
                                      {NODE_LABEL[meta.type as never]}
                                    </span>
                                  )}
                                </div>
                                <p className="pt-1 text-caption leading-relaxed text-secondary">
                                  Gates{" "}
                                  <strong className="font-medium text-primary">
                                    {gated.length}
                                  </strong>{" "}
                                  critical consumer{gated.length > 1 ? "s" : ""}:{" "}
                                  {gated.map((g) => assetName.get(g)?.name ?? g).join(", ")}
                                </p>
                              </div>
                              <Button size="xs" onClick={() => inspect(id)}>
                                Inspect
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  <p className="pb-4 pt-8 text-caption leading-relaxed text-quaternary">
                    Method: {r.method}
                  </p>
                </div>
              );
            }}
          </Async>
        </div>
      </div>
    </AppShell>
  );
}
