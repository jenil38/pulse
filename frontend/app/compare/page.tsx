"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Asset, Comparison, FailureType, FailureTypeInfo } from "@/lib/types";
import { NODE_LABEL, STAGE_ORDER, STATE } from "@/lib/visual";
import { NavRail } from "@/components/room/NavRail";
import { StatusBar } from "@/components/room/StatusBar";
import { Button, SimulatedTag } from "@/components/ui/primitives";

/**
 * Scenario comparison — split screen, two failures, one verdict.
 * Every number comes from the deterministic graph engine.
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

  const run = async () => {
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
  };

  // Run the headline comparison once the topology is available.
  useEffect(() => {
    if (topology && !result) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology]);

  const assets = [...(topology?.assets ?? [])].sort(
    (a, b) =>
      STAGE_ORDER.indexOf(a.type) - STAGE_ORDER.indexOf(b.type) ||
      a.name.localeCompare(b.name)
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <StatusBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="haze min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-8 py-10">
            <header className="pb-8">
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-lg tracking-[0.16em] text-ink">
                  SCENARIO COMPARISON
                </h1>
                <SimulatedTag />
              </div>
              <p className="pt-2 text-[11px] leading-relaxed text-ink-mute">
                Compare the blast radius of two failures. Which single component
                would hurt most?
              </p>
            </header>

            {/* Split configuration */}
            <div className="grid gap-4 md:grid-cols-2">
              <ScenarioPicker
                title="Scenario A"
                assets={assets}
                types={types}
                origin={aOrigin}
                failure={aFail}
                onOrigin={setAOrigin}
                onFailure={setAFail}
                side="a"
                result={result}
              />
              <ScenarioPicker
                title="Scenario B"
                assets={assets}
                types={types}
                origin={bOrigin}
                failure={bFail}
                onOrigin={setBOrigin}
                onFailure={setBFail}
                side="b"
                result={result}
              />
            </div>

            <div className="flex justify-center py-6">
              <Button variant="primary" onClick={run} disabled={busy}>
                {busy ? "Computing…" : "Compare blast radius"}
              </Button>
            </div>

            {/* Verdict */}
            {result && (
              <>
                <div className="animate-fade-up border border-line bg-panel px-6 py-6 text-center">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
                    Verdict
                  </div>
                  <div className="pt-3 font-mono text-3xl tabular-nums leading-none text-degraded">
                    {result.ratio}×
                  </div>
                  <p className="pt-3 text-[12px] text-ink-dim">{result.verdict}</p>
                </div>

                {/* Proportional bars — comparison, not a table dump */}
                <div className="pt-8">
                  <CompareBars result={result} />
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
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
  side,
  result,
}: {
  title: string;
  assets: Asset[];
  types: FailureTypeInfo[];
  origin: string;
  failure: FailureType;
  onOrigin: (v: string) => void;
  onFailure: (v: FailureType) => void;
  side: "a" | "b";
  result: Comparison | null;
}) {
  const data = result ? result[side] : null;
  const accent = side === "a" ? STATE.RECOVERING.hex : STATE.DEGRADED.hex;

  return (
    <section className="border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          {title}
        </span>
      </div>
      <div className="space-y-3 px-4 py-4">
        <select
          value={origin}
          onChange={(e) => onOrigin(e.target.value)}
          aria-label={`${title} target asset`}
          className="w-full border border-line bg-raised px-2 py-2 font-mono text-[10px] text-ink focus:border-healthy/50 focus:outline-none"
        >
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {NODE_LABEL[a.type]}
            </option>
          ))}
        </select>
        <select
          value={failure}
          onChange={(e) => onFailure(e.target.value as FailureType)}
          aria-label={`${title} failure type`}
          className="w-full border border-line bg-raised px-2 py-2 font-mono text-[10px] text-ink focus:border-healthy/50 focus:outline-none"
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {data && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line px-4 py-4">
          <Stat label="Assets affected" value={data.affected_assets} accent={accent} />
          <Stat label="Blast score" value={data.blast_score} accent={accent} />
          <Stat label="Critical dashboards" value={data.critical_dashboards} />
          <Stat label="ML models" value={data.ml_models} />
          <Stat label="Teams impacted" value={data.teams} />
        </dl>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div>
      <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </dt>
      <dd
        className="pt-0.5 font-mono text-lg tabular-nums leading-none"
        style={{ color: accent ?? "#E6EAEC" }}
      >
        {value}
      </dd>
    </div>
  );
}

/** Proportional comparison bars — reads at a glance, unlike a table. */
function CompareBars({ result }: { result: Comparison }) {
  const rows: { label: string; a: number; b: number }[] = [
    { label: "Assets affected", a: result.a.affected_assets, b: result.b.affected_assets },
    { label: "Blast score", a: result.a.blast_score, b: result.b.blast_score },
    { label: "Critical dashboards", a: result.a.critical_dashboards, b: result.b.critical_dashboards },
    { label: "ML models", a: result.a.ml_models, b: result.b.ml_models },
    { label: "Teams impacted", a: result.a.teams, b: result.b.teams },
  ];

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const max = Math.max(r.a, r.b, 1);
        return (
          <div key={r.label}>
            <div className="flex justify-between pb-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
                {r.label}
              </span>
              <span className="font-mono text-[9px] tabular-nums text-ink-mute">
                {r.a} vs {r.b}
              </span>
            </div>
            <div className="flex gap-1">
              <div className="flex flex-1 justify-end">
                <div
                  className="h-1.5 transition-[width] duration-700 ease-pulse"
                  style={{
                    width: `${(r.a / max) * 100}%`,
                    background: STATE.RECOVERING.hex,
                  }}
                />
              </div>
              <div className="flex flex-1">
                <div
                  className="h-1.5 transition-[width] duration-700 ease-pulse"
                  style={{
                    width: `${(r.b / max) * 100}%`,
                    background: STATE.DEGRADED.hex,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-center gap-6 pt-2">
        <Legend color={STATE.RECOVERING.hex} label={result.a.label} />
        <Legend color={STATE.DEGRADED.hex} label={result.b.label} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-1 w-3" style={{ background: color }} />
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </span>
    </span>
  );
}
