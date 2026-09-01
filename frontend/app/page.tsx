"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Simulation, Topology } from "@/lib/types";
import { STATE } from "@/lib/visual";
import { Button, Kbd } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/primitives";

const LandingTopology = dynamic(
  () => import("@/components/marketing/LandingTopology").then((m) => m.LandingTopology),
  { ssr: false, loading: () => <div className="h-full w-full bg-stage" /> }
);

/**
 * Landing page.
 *
 * Breathing room, strong type, and a product-truthful hero: the visual is the
 * real topology running the real Payments outage from the engine — not an
 * abstract decoration. Everything below the hero is clean product storytelling.
 */
const STORY_ORIGIN = "src_payments";

export default function Landing() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [sim, setSim] = useState<Simulation | null>(null);

  useEffect(() => {
    api.topology().then(setTopology).catch(() => setTopology(null));
    api
      .simulate({ origin: STORY_ORIGIN, failure_type: "SOURCE_OUTAGE", duration_minutes: 30 })
      .then(setSim)
      .catch(() => setSim(null));
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border bg-canvas/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-6">
          <span className="grid h-5 w-5 place-items-center rounded-xs bg-primary text-[10px] font-semibold text-canvas">
            P
          </span>
          <span className="text-body font-medium text-primary">PULSE</span>
          <span className="hidden text-caption text-tertiary sm:inline">
            Data Resilience Digital Twin
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/control-room">
              <Button size="sm" variant="primary">
                Open Control Room
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1120px] px-6 pb-10 pt-16 md:pt-24">
        <p className="text-caption text-tertiary">Data resilience, before the incident</p>
        <h1 className="max-w-[18ch] pt-4 text-[2.5rem] font-medium leading-[1.05] tracking-[-0.03em] text-primary md:text-display-xl">
          See failure before it spreads.
        </h1>
        <p className="max-w-[54ch] pt-5 text-body leading-relaxed text-secondary md:text-base">
          PULSE models your data platform as a dependency graph, then lets you
          break it on purpose — computing exactly which tables go stale, which
          dashboards become untrustworthy, and which teams find out the hard way.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-7">
          <Link href="/control-room">
            <Button size="lg" variant="primary">
              Open Control Room
            </Button>
          </Link>
          <Link href="/chaos-lab">
            <Button size="lg">Run a simulation</Button>
          </Link>
          <span className="hidden items-center gap-1.5 pl-2 text-caption text-quaternary sm:flex">
            <Kbd>⌘K</Kbd> for commands
          </span>
        </div>
      </section>

      {/* Product-truthful hero visual */}
      <section className="mx-auto max-w-[1120px] px-6">
        <figure className="overflow-hidden rounded-xl border border-border bg-stage">
          <div className="flex h-9 items-center gap-2 border-b border-border bg-canvas px-3">
            <span className="text-caption text-tertiary">Nova Commerce</span>
            <span className="text-caption text-quaternary">/ system topology</span>
            <span className="ml-auto flex items-center gap-3">
              {(["HEALTHY", "DEGRADED", "STALE", "FAILED"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <StatusDot state={s} />
                  <span className="hidden text-caption text-tertiary sm:inline">
                    {STATE[s].label}
                  </span>
                </span>
              ))}
            </span>
          </div>
          <div className="h-[380px] md:h-[460px]">
            {topology && <LandingTopology topology={topology} simulation={sim} />}
          </div>
        </figure>
        <figcaption className="pt-2 text-caption text-quaternary">
          Live output from the PULSE engine — 43 assets, 47 dependencies, running
          a simulated Payments API outage. Demo data.
        </figcaption>
      </section>

      {/* The question */}
      <section className="mx-auto max-w-[1120px] px-6 pb-6 pt-24">
        <h2 className="max-w-[20ch] text-[2rem] font-medium leading-tight tracking-[-0.025em] text-primary md:text-display">
          Lineage shows connections. PULSE shows consequences.
        </h2>
        <div className="grid gap-10 pt-10 md:grid-cols-3">
          <Feature
            title="Model the system"
            body="Sources, ingestion, transformations, warehouse tables, models, dashboards, ML systems and the teams that depend on them — as one directed graph."
          />
          <Feature
            title="Break it on purpose"
            body="Ten failure types across three propagation modes. Schema drift breaks differently from an outage, and PULSE models that difference explicitly."
          />
          <Feature
            title="Read the consequence"
            body="Deterministic blast radius, a recovery order derived from the topology, and an explainable resilience score. No probabilities, no invented precision."
          />
        </div>
      </section>

      {/* Real propagation — the product's actual output */}
      {sim && (
        <section className="mx-auto max-w-[1120px] px-6 pb-6 pt-20">
          <p className="text-caption text-tertiary">A worked example</p>
          <h2 className="max-w-[24ch] pt-3 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-primary">
            One source stops answering. Here is what it costs.
          </h2>
          <p className="max-w-[56ch] pt-3 text-body text-secondary">
            {sim.origin_name} — {sim.failure_label}. The engine walks the graph in
            dependency order and marks{" "}
            <strong className="font-medium text-primary">
              {sim.blast_radius.total_affected} downstream assets
            </strong>
            .
          </p>

          <ol className="max-w-[640px] pt-6">
            {sim.blast_radius.nodes
              .filter((n) => n.id !== sim.origin)
              .slice(0, 8)
              .map((n) => (
                <li
                  key={n.id}
                  className="flex items-center gap-3 border-b border-border-subtle py-2.5"
                >
                  <span className="w-10 shrink-0 font-mono text-caption tnum text-quaternary">
                    hop {n.hops}
                  </span>
                  <StatusDot state={n.state} />
                  <span className="min-w-0 flex-1 truncate text-small text-primary">
                    {n.name}
                  </span>
                  <span className="shrink-0 text-caption text-tertiary">
                    {n.untrustworthy ? "untrustworthy" : STATE[n.state].label}
                  </span>
                </li>
              ))}
          </ol>

          <p className="max-w-[56ch] pt-6 text-body text-secondary">
            A broken column becomes a broken decision:{" "}
            <strong className="font-medium text-primary">
              {sim.business_impact.teams.join(", ")}
            </strong>{" "}
            are working from numbers they believe are correct.
          </p>
        </section>
      )}

      {/* Close */}
      <section className="mx-auto max-w-[1120px] px-6 py-24">
        <div className="border-t border-border pt-10">
          <h2 className="max-w-[16ch] text-[2rem] font-medium leading-tight tracking-[-0.025em] text-primary">
            Map. Break. Understand. Recover.
          </h2>
          <p className="max-w-[52ch] pt-3 text-body text-secondary">
            Break your data system before reality does.
          </p>
          <div className="flex flex-wrap gap-3 pt-6">
            <Link href="/control-room">
              <Button size="lg" variant="primary">
                Open Control Room
              </Button>
            </Link>
            <Link href="/compare">
              <Button size="lg">Compare scenarios</Button>
            </Link>
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-16">
          <span className="text-caption text-quaternary">
            PULSE — a portfolio project by Jenil Parmar
          </span>
          <span className="text-caption text-quaternary">
            Nova Commerce is a fictional company; all telemetry is simulated.
          </span>
        </footer>
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-heading text-primary">{title}</h3>
      <p className="pt-2 text-small leading-relaxed text-secondary">{body}</p>
    </div>
  );
}
