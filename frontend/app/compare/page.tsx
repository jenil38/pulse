"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Asset, Comparison, FailureType, FailureTypeInfo } from "@/lib/types";
import { NODE_LABEL, STAGE_ORDER } from "@/lib/visual";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { Button } from "@/components/ui/Button";
import { EmptyState, Table, Td, Th } from "@/components/ui/primitives";

/**
 * Scenario comparison.
 *
 * The least cinematic surface in the product, deliberately: this is a
 * quantitative question and the answer is a table plus one clear verdict. Bars
 * are proportional rules, not charts — they exist only to make the ratio
 * legible at a glance.
 */
export default function ComparePage() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const topology = usePulse((s) => s.topology);

  const [types, setTypes] = useState<FailureTypeInfo[]>([]);
  const [aOrigin, setAOrigin] = useState("src_payments");
  const [aFail, setAFail] = useState<FailureType>("SOURCE_OUTAGE");
  const [bOrigin, setBOrigin] = useState("src_orders");
  const [bFail, setBFail] = useState<FailureType>("SOURCE_OUTAGE");
  const [result, setResult] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadTopology();
    api.failureTypes().then(setTypes).catch(() => setTypes([]));
  }, [loadTopology]);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setResult(
        await api.compare({
          a_origin: aOrigin,
          a_failure_type: aFail,
          b_origin: bOrigin,
          b_failure_type: bFail,
        })
      );
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [aOrigin, aFail, bOrigin, bFail]);

  // Run the headline comparison once the topology is available.
  useEffect(() => {
    if (topology && !result) run();
  }, [topology, result, run]);

  const assets = useMemo(
    () =>
      [...(topology?.assets ?? [])].sort(
        (a, b) =>
          STAGE_ORDER.indexOf(a.type) - STAGE_ORDER.indexOf(b.type) ||
          a.name.localeCompare(b.name)
      ),
    [topology]
  );

  const rows = result
    ? [
        { label: "Assets affected", a: result.a.affected_assets, b: result.b.affected_assets },
        { label: "Blast score", a: result.a.blast_score, b: result.b.blast_score },
        { label: "Critical dashboards", a: result.a.critical_dashboards, b: result.b.critical_dashboards },
        { label: "ML models", a: result.a.ml_models, b: result.b.ml_models },
        { label: "Teams impacted", a: result.a.teams, b: result.b.teams },
      ]
    : [];

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Compare scenarios" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[880px] px-8 py-8">
            <p className="max-w-prose text-body text-secondary">
              Compare the blast radius of two failures to find which component is
              the greater liability.
            </p>

            {/* Configuration */}
            <div className="grid gap-6 pt-6 md:grid-cols-2">
              <ScenarioPicker
                title="Scenario A"
                assets={assets}
                types={types}
                origin={aOrigin}
                failure={aFail}
                onOrigin={setAOrigin}
                onFailure={setAFail}
              />
              <ScenarioPicker
                title="Scenario B"
                assets={assets}
                types={types}
                origin={bOrigin}
                failure={bFail}
                onOrigin={setBOrigin}
                onFailure={setBFail}
              />
            </div>

            <div className="pt-5">
              <Button variant="primary" onClick={run} disabled={busy}>
                {busy ? "Computing…" : "Compare blast radius"}
              </Button>
            </div>

            {/* Verdict */}
            {result ? (
              <>
                <div className="mt-8 border-t border-border pt-6">
                  <p className="text-caption text-tertiary">Verdict</p>
                  <p className="pt-1 text-title-lg tnum text-primary">
                    {result.ratio}× greater blast radius
                  </p>
                  <p className="max-w-prose pt-1 text-small text-secondary">
                    {result.verdict}
                  </p>
                </div>

                <div className="pt-6">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Measure</Th>
                        <Th align="right" width="88px">A</Th>
                        <Th align="right" width="88px">B</Th>
                        <Th width="200px">Relative</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const max = Math.max(r.a, r.b, 1);
                        return (
                          <tr key={r.label}>
                            <Td className="text-secondary">{r.label}</Td>
                            <Td align="right" mono className="text-primary">
                              {r.a}
                            </Td>
                            <Td align="right" mono className="text-primary">
                              {r.b}
                            </Td>
                            <Td>
                              <span className="flex items-center gap-1">
                                <span className="flex flex-1 justify-end">
                                  <span
                                    className="h-1.5 rounded-full bg-recovering transition-[width] duration-slow ease-standard"
                                    style={{ width: `${(r.a / max) * 100}%` }}
                                  />
                                </span>
                                <span className="h-3 w-px bg-border" />
                                <span className="flex flex-1">
                                  <span
                                    className="h-1.5 rounded-full bg-degraded transition-[width] duration-slow ease-standard"
                                    style={{ width: `${(r.b / max) * 100}%` }}
                                  />
                                </span>
                              </span>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>

                  <div className="flex gap-5 pt-3">
                    <Legend className="bg-recovering" label={result.a.label} />
                    <Legend className="bg-degraded" label={result.b.label} />
                  </div>
                </div>
              </>
            ) : (
              !busy && (
                <EmptyState
                  title="No comparison yet"
                  hint="Pick two scenarios and compare to see which failure costs more."
                />
              )
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ScenarioPicker({
  title,
  assets,
  types,
  origin,
  failure,
  onOrigin,
  onFailure,
}: {
  title: string;
  assets: Asset[];
  types: FailureTypeInfo[];
  origin: string;
  failure: FailureType;
  onOrigin: (v: string) => void;
  onFailure: (v: FailureType) => void;
}) {
  return (
    <section>
      <h2 className="pb-2 text-caption font-medium text-secondary">{title}</h2>
      <div className="space-y-2">
        <select
          value={origin}
          onChange={(e) => onOrigin(e.target.value)}
          aria-label={`${title} target asset`}
          className="h-control w-full rounded border border-border bg-surface px-2 text-small text-primary transition-colors duration-instant hover:border-border-strong focus:border-accent focus:outline-none"
        >
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {NODE_LABEL[a.type]}
            </option>
          ))}
        </select>
        <select
          value={failure}
          onChange={(e) => onFailure(e.target.value as FailureType)}
          aria-label={`${title} failure type`}
          className="h-control w-full rounded border border-border bg-surface px-2 text-small text-primary transition-colors duration-instant hover:border-border-strong focus:border-accent focus:outline-none"
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-4 rounded-full ${className}`} aria-hidden />
      <span className="text-caption text-tertiary">{label}</span>
    </span>
  );
}
