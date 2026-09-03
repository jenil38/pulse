"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Asset, Lineage } from "@/lib/types";
import {
  CRITICALITY_LABEL,
  NODE_LABEL,
  formatAge,
  formatCount,
} from "@/lib/visual";
import { Button } from "@/components/ui/Button";
import { Icon, NodeGlyph } from "@/components/ui/Icon";
import { AreaChart } from "@/components/ui/Chart";
import { useAsync } from "@/hooks/useAsync";
import type { AssetHistory } from "@/lib/types";
import {
  Badge,
  EmptyState,
  PanelHeader,
  Property,
  Status,
  StatusDot,
  Tabs,
} from "@/components/ui/primitives";

/**
 * Asset inspector — a properties panel, not a stack of cards.
 *
 * Label/value rows align into one scannable column; tabs separate identity from
 * lineage and telemetry so the panel stays short. Actions live at the bottom,
 * always in the same place.
 */
type Tab = "overview" | "lineage" | "telemetry";

export function Inspector() {
  const selectedId = usePulse((s) => s.selectedId);
  const stateOf = usePulse((s) => s.stateOf);
  const select = usePulse((s) => s.select);
  const trace = usePulse((s) => s.trace);
  const clearTrace = usePulse((s) => s.clearTrace);
  const tracedIds = usePulse((s) => s.tracedIds);
  const router = useRouter();

  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  // History is only fetched once the telemetry tab is actually opened.
  const history = useAsync<AssetHistory>(
    () => api.assetHistory(selectedId!, 48),
    [selectedId, tab],
    { enabled: !!selectedId && tab === "telemetry" }
  );

  useEffect(() => {
    if (!selectedId) {
      setLineage(null);
      return;
    }
    let cancelled = false;
    api
      .asset(selectedId)
      .then((d) => !cancelled && setLineage(d))
      .catch(() => !cancelled && setLineage(null));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (!selectedId) {
    return (
      <aside
        data-surface
        className="hidden h-full w-[304px] shrink-0 flex-col border-l border-border bg-canvas xl:flex"
      >
        <PanelHeader>Inspector</PanelHeader>
        <EmptyState
          title="No asset selected"
          hint="Select a node in the topology or a row in the table to inspect its lineage and health."
        />
      </aside>
    );
  }

  const a = lineage?.asset;
  const m = lineage?.metric;
  const st = stateOf(selectedId);
  const traced = tracedIds.size > 0;

  return (
    <aside
      data-surface
      className={[
        "flex h-full flex-col border-l border-border bg-canvas",
        // Below xl the inspector would squeeze the main column, so it becomes
        // an overlay drawer instead of a permanent third pane.
        "absolute right-0 top-0 z-30 w-[304px] shadow-overlay",
        "xl:static xl:z-auto xl:w-[304px] xl:shrink-0 xl:shadow-none",
      ].join(" ")}
    >
      <PanelHeader
        actions={
          <Button size="xs" variant="ghost" onClick={() => select(null)} aria-label="Close inspector">
            <Icon name="close" size={14} />
          </Button>
        }
      >
        Inspector
      </PanelHeader>

      {!a ? (
        <EmptyState title="Loading…" />
      ) : (
        <>
          {/* Identity */}
          <div className="shrink-0 px-5 pb-4 pt-5">
            <div className="flex items-start gap-2.5">
              <span className="mt-[3px] grid h-7 w-7 shrink-0 place-items-center rounded border border-border bg-subtle text-tertiary">
                <NodeGlyph type={a.type} size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-heading text-primary">{a.name}</h3>
                <p className="flex items-center gap-1.5 pt-0.5 text-caption text-tertiary">
                  <StatusDot state={st} />
                  {NODE_LABEL[a.type]} · {a.system}
                </p>
              </div>
            </div>
            {a.description && (
              <p className="pt-3 text-small leading-relaxed text-secondary">
                {a.description}
              </p>
            )}
          </div>

          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "lineage", label: "Lineage", count: lineage.downstream_count },
              { value: "telemetry", label: "Telemetry" },
            ]}
          />

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === "overview" && (
              <dl>
                <Property label="Status">
                  <Status state={st} />
                </Property>
                <Property label="Criticality">
                  {a.criticality === "CRITICAL" ? (
                    <Badge tone="FAILED">{CRITICALITY_LABEL[a.criticality]}</Badge>
                  ) : (
                    CRITICALITY_LABEL[a.criticality]
                  )}
                </Property>
                <Property label="Owner">{a.owner}</Property>
                <Property label="System">{a.system}</Property>
                <Property label="Asset ID" mono>
                  {a.id}
                </Property>
                <Property label="Upstream" mono>
                  {lineage.upstream_count}
                </Property>
                <Property label="Downstream" mono>
                  {lineage.downstream_count}
                </Property>
                {lineage.business_consumers.length > 0 && (
                  <div className="pt-3">
                    <p className="pb-1.5 text-caption text-tertiary">Business consumers</p>
                    <div className="flex flex-wrap gap-1">
                      {lineage.business_consumers.map((c) => (
                        <Badge key={c.id}>{c.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </dl>
            )}

            {tab === "lineage" && (
              <div className="space-y-4">
                <LineageList
                  title="Direct upstream"
                  items={lineage.upstream}
                  onSelect={select}
                  empty="This is a source — nothing feeds it."
                />
                <LineageList
                  title="Direct downstream"
                  items={lineage.downstream}
                  onSelect={select}
                  empty="Nothing consumes this asset."
                />
              </div>
            )}

            {tab === "telemetry" && history.data && (
              <div className="space-y-4 pb-4">
                <AreaChart
                  label="Freshness · last 24h"
                  points={history.data.freshness}
                  height={64}
                  tone={m && m.freshness_seconds > m.freshness_target ? "degraded" : "healthy"}
                  formatValue={(v) => formatAge(v)}
                  baseline={m?.freshness_target}
                  baselineLabel="target"
                />
                {history.data.volume.length > 0 && (
                  <AreaChart
                    label="Row volume · last 24h"
                    points={history.data.volume}
                    height={64}
                    tone="accent"
                    formatValue={(v) => formatCount(v)}
                  />
                )}
                <AreaChart
                  label="Latency · last 24h"
                  points={history.data.latency}
                  height={64}
                  tone="accent"
                  formatValue={(v) => Math.round(v) + "ms"}
                />
              </div>
            )}

            {tab === "telemetry" &&
              (m ? (
                <dl>
                  <Property label="Freshness" mono>
                    <span
                      className={
                        m.freshness_seconds > m.freshness_target ? "text-degraded" : ""
                      }
                    >
                      {formatAge(m.freshness_seconds)}
                    </span>
                    <span className="pl-1.5 font-sans text-caption text-quaternary">
                      target {formatAge(m.freshness_target)}
                    </span>
                  </Property>
                  <Property label="Latency" mono>
                    {m.latency_ms}ms
                  </Property>
                  <Property label="Rows" mono>
                    {m.row_volume > 0 ? formatCount(m.row_volume) : "—"}
                    {m.row_volume > 0 && (
                      <span className="pl-1.5 font-sans text-caption text-quaternary">
                        {m.volume_delta_pct > 0 ? "+" : ""}
                        {m.volume_delta_pct}%
                      </span>
                    )}
                  </Property>
                  <Property label="Null ratio" mono>
                    <span className={m.null_ratio > 0.03 ? "text-degraded" : ""}>
                      {(m.null_ratio * 100).toFixed(2)}%
                    </span>
                  </Property>
                  <Property label="Schema" mono>
                    {m.schema_version}
                  </Property>
                  <Property label="Last run">{m.last_run_status}</Property>
                  <Property label="Updated" mono>
                    {m.last_updated_iso.slice(11, 19)}
                  </Property>
                  <p className="pt-3 text-caption text-quaternary">
                    Values are generated by a deterministic simulator, not measured
                    from a live system.
                  </p>
                </dl>
              ) : (
                <p className="text-small text-quaternary">No telemetry available.</p>
              ))}
          </div>

          {/* Actions — always in the same place */}
          <div className="shrink-0 space-y-1.5 border-t border-border p-3">
            <Button
              size="sm"
              full
              icon={<Icon name="trace" size={14} />}
              onClick={() => {
                if (traced) return clearTrace();
                trace([
                  lineage.asset.id,
                  ...lineage.upstream.map((x) => x.id),
                  ...lineage.downstream.map((x) => x.id),
                ]);
              }}
            >
              {traced ? "Clear lineage trace" : "Trace lineage"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              full
              icon={<Icon name="chaos" size={14} />}
              onClick={() => router.push(`/chaos-lab?target=${selectedId}`)}
            >
              Simulate failure
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

function LineageList({
  title,
  items,
  onSelect,
  empty,
}: {
  title: string;
  items: Asset[];
  onSelect: (id: string) => void;
  empty: string;
}) {
  return (
    <div>
      <p className="pb-1 text-caption text-tertiary">{title}</p>
      {items.length === 0 ? (
        <p className="text-small text-quaternary">{empty}</p>
      ) : (
        <ul className="-mx-2">
          {items.map((x) => (
            <li key={x.id}>
              <button
                onClick={() => onSelect(x.id)}
                className="flex h-control w-full items-center gap-2 rounded px-2 text-left transition-colors duration-instant hover:bg-subtle"
              >
                <StatusDotFor id={x.id} />
                <span className="truncate text-small text-secondary">{x.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDotFor({ id }: { id: string }) {
  const stateOf = usePulse((s) => s.stateOf);
  return <StatusDot state={stateOf(id)} />;
}
