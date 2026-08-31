"use client";

import Link from "next/link";
import type { Simulation, Topology } from "@/lib/types";
import { STATE } from "@/lib/visual";
import { SCENES } from "./scenes";

/**
 * Mobile / reduced-motion landing.
 *
 * Same story, told with lineage cards and a propagation list instead of WebGL
 * (DESIGN.md §31). 3D is an enhancement, never a requirement.
 */
export function MobileStory({
  topology,
  simulation,
}: {
  topology: Topology | null;
  simulation: Simulation | null;
}) {
  const chain = simulation
    ? [...simulation.blast_radius.nodes].sort((a, b) => a.hops - b.hops)
    : [];

  return (
    <main className="haze min-h-screen px-6 pb-20 pt-16">
      {/* Hero */}
      <header className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
          Data Resilience Digital Twin
        </p>
        <h1 className="pt-6 font-mono text-5xl tracking-[0.28em] text-ink">PULSE</h1>
        <p className="pt-5 text-sm text-ink-dim">See failure before it spreads.</p>
        <p className="mx-auto max-w-sm pt-3 text-[12px] leading-relaxed text-ink-mute">
          A digital twin for understanding how data failures propagate through
          your business.
        </p>
        <Link
          href="/control-room"
          className="mt-9 inline-block border border-healthy/40 bg-healthy/5 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-healthy"
        >
          Enter system
        </Link>
      </header>

      {/* System scale */}
      {topology && (
        <section className="mt-16 border border-line bg-panel px-5 py-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            The system
          </p>
          <div className="flex gap-8 pt-3">
            <Stat n={topology.assets.length} label="Assets" />
            <Stat n={topology.dependencies.length} label="Dependencies" />
            <Stat n={topology.systems.length} label="Systems" />
          </div>
          <p className="pt-4 text-[12px] leading-relaxed text-ink-mute">
            Your business runs on invisible dependencies.
          </p>
        </section>
      )}

      {/* Propagation chain */}
      {simulation && (
        <section className="mt-8">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            Then one source stops answering
          </p>
          <h2 className="pt-3 text-xl font-light leading-snug text-ink">
            {simulation.origin_name} — {simulation.failure_label}
          </h2>
          <p className="pt-2 text-[12px] text-ink-mute">
            {simulation.blast_radius.total_affected} downstream assets affected.
            Failure does not stay where it starts.
          </p>

          <ol className="mt-5 border border-line">
            {chain.map((n, i) => (
              <li
                key={n.id}
                className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: STATE[n.state].hex }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] text-ink-dim">
                    {n.name}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-faint">
                    hop {n.hops} · {STATE[n.state].label}
                    {n.untrustworthy && " · untrustworthy"}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <p className="pt-5 text-lg font-light leading-snug text-ink">
            A broken column can become a broken decision.
          </p>
          {simulation.business_impact.teams.length > 0 && (
            <p className="pt-2 text-[12px] text-ink-mute">
              Impacted: {simulation.business_impact.teams.join(", ")}
            </p>
          )}
        </section>
      )}

      {/* Recovery */}
      {simulation && (
        <section className="mt-10">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            Recovery has an order
          </p>
          <ol className="mt-3 space-y-2">
            {simulation.recovery.slice(0, 6).map((s) => (
              <li key={s.order} className="flex gap-3">
                <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                  {String(s.order).padStart(2, "0")}
                </span>
                <span className="font-mono text-[11px] leading-snug text-ink-dim">
                  {s.action}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Close */}
      <section className="mt-16 text-center">
        <h2 className="text-2xl font-light text-ink">Map. Break. Understand. Recover.</h2>
        <p className="pt-3 text-[12px] text-ink-mute">
          Break your data system before reality does.
        </p>
        <Link
          href="/control-room"
          className="mt-8 inline-block border border-healthy/40 bg-healthy/5 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-healthy"
        >
          Open control room
        </Link>
        <p className="pt-8 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
          Demo data · Nova Commerce · simulated telemetry
        </p>
      </section>
    </main>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-mono text-2xl tabular-nums leading-none text-ink">{n}</div>
      <div className="pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </div>
    </div>
  );
}
