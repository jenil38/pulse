"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Asset, HealthState, Lineage } from "@/lib/types";
import {
  CRITICALITY_LABEL,
  NODE_LABEL,
  STATE,
  formatAge,
  scoreBand,
} from "@/lib/visual";
import { Badge, Property, StatusDot, Tabs } from "@/components/ui/primitives";

/**
 * Mobile Control Room — clean, professional 2D. No WebGL.
 *
 * Same information architecture as the desktop room, expressed as lists and
 * expandable rows. 3D is an enhancement, never a requirement.
 */
const RANK: Record<HealthState, number> = {
  HEALTHY: 0,
  RECOVERING: 1,
  STALE: 2,
  DEGRADED: 3,
  FAILED: 4,
};

type Tab = "assets" | "systems";

export function MobileRoom() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const topology = usePulse((s) => s.topology);
  const overview = usePulse((s) => s.overview);
  const stateOf = usePulse((s) => s.stateOf);

  const [tab, setTab] = useState<Tab>("assets");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  useEffect(() => {
    if (!openId) return setLineage(null);
    let cancelled = false;
    api
      .asset(openId)
      .then((d) => !cancelled && setLineage(d))
      .catch(() => !cancelled && setLineage(null));
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const assets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (topology?.assets ?? [])
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          RANK[stateOf(b.id)] - RANK[stateOf(a.id)] || a.name.localeCompare(b.name)
      );
  }, [topology, query, stateOf]);

  const systems = useMemo(() => {
    const m = new Map<string, { count: number; worst: HealthState }>();
    for (const a of topology?.assets ?? []) {
      const cur = m.get(a.system) ?? { count: 0, worst: "HEALTHY" as HealthState };
      const st = stateOf(a.id);
      m.set(a.system, {
        count: cur.count + 1,
        worst: RANK[st] > RANK[cur.worst] ? st : cur.worst,
      });
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [topology, stateOf]);

  const band = overview ? scoreBand(overview.resilience_score) : null;

  return (
    <div className="min-h-screen bg-canvas pb-10">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/95 backdrop-blur-sm">
        <div className="flex h-12 items-center gap-2 px-4">
          <span className="grid h-5 w-5 place-items-center rounded-xs bg-primary text-[10px] font-semibold text-canvas">
            P
          </span>
          <span className="text-body font-medium text-primary">
            {topology?.organization ?? "PULSE"}
          </span>
          <Link
            href="/incidents"
            className="ml-auto text-small text-tertiary transition-colors hover:text-primary"
          >
            Incidents
          </Link>
        </div>
      </header>

      {/* Vitals */}
      {overview && band && (
        <section className="border-b border-border px-4 py-4">
          <div className="flex items-baseline gap-2">
            <span className={`text-title-lg tnum ${band.text}`}>
              {overview.resilience_score}
            </span>
            <span className="text-caption text-quaternary">/ 100</span>
            <span className="text-small text-tertiary">Resilience · {band.label}</span>
          </div>
          {overview.weakest_component && (
            <p className="pt-1 text-small text-secondary">
              Weakest: {overview.weakest_component}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3">
            {(Object.entries(overview.counts) as [HealthState, number][])
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <StatusDot state={k} />
                  <span className="text-small tnum text-secondary">{n}</span>
                  <span className="text-caption text-tertiary">{STATE[k].label}</span>
                </span>
              ))}
          </div>
        </section>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "assets", label: "Assets", count: assets.length },
          { value: "systems", label: "Systems", count: systems.length },
        ]}
      />

      {tab === "assets" ? (
        <>
          <div className="border-b border-border px-4 py-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter assets…"
              aria-label="Filter assets"
              className="h-control w-full rounded border border-border bg-surface px-2.5 text-small text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <ul>
            {assets.map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                state={stateOf(a.id)}
                open={openId === a.id}
                lineage={openId === a.id ? lineage : null}
                onToggle={() => setOpenId(openId === a.id ? null : a.id)}
              />
            ))}
          </ul>
        </>
      ) : (
        <ul>
          {systems.map(([name, info]) => (
            <li
              key={name}
              className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3"
            >
              <StatusDot state={info.worst} />
              <span className="flex-1 text-small text-primary">{name}</span>
              <span className="text-caption tnum text-tertiary">{info.count}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="px-4 pt-6 text-caption text-quaternary">
        The interactive system map and Chaos Lab are available on larger screens.
        Telemetry shown here is simulated demo data.
      </p>
    </div>
  );
}

function AssetRow({
  asset,
  state,
  open,
  lineage,
  onToggle,
}: {
  asset: Asset;
  state: HealthState;
  open: boolean;
  lineage: Lineage | null;
  onToggle: () => void;
}) {
  return (
    <li className="border-b border-border-subtle">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <StatusDot state={state} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small text-primary">{asset.name}</span>
          <span className="block text-caption text-tertiary">
            {NODE_LABEL[asset.type]} · {asset.system}
          </span>
        </span>
        <span className="text-caption text-quaternary" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="bg-subtle px-4 pb-4 pt-1">
          {asset.description && (
            <p className="pb-2 text-small leading-relaxed text-secondary">
              {asset.description}
            </p>
          )}
          <dl>
            <Property label="Criticality">{CRITICALITY_LABEL[asset.criticality]}</Property>
            <Property label="Owner">{asset.owner}</Property>
            {lineage && (
              <>
                <Property label="Upstream" mono>
                  {lineage.upstream_count}
                </Property>
                <Property label="Downstream" mono>
                  {lineage.downstream_count}
                </Property>
                {lineage.metric && (
                  <Property label="Freshness" mono>
                    {formatAge(lineage.metric.freshness_seconds)}
                  </Property>
                )}
              </>
            )}
          </dl>
          {lineage && lineage.business_consumers.length > 0 && (
            <div className="pt-2">
              <p className="pb-1.5 text-caption text-tertiary">Business consumers</p>
              <div className="flex flex-wrap gap-1">
                {lineage.business_consumers.map((c) => (
                  <Badge key={c.id}>{c.name}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
