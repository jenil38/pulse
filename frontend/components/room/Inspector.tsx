"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Lineage } from "@/lib/types";
import { NODE_LABEL, STATE, formatAge, formatCount } from "@/lib/visual";
import {
  Button,
  PanelHeading,
  SimulatedTag,
  StateDot,
} from "@/components/ui/primitives";

/**
 * Right pane — the Asset Inspector.
 * Identity, simulated telemetry, lineage counts, business consumers, actions.
 */
export function Inspector() {
  const selectedId = usePulse((s) => s.selectedId);
  const stateOf = usePulse((s) => s.stateOf);
  const trace = usePulse((s) => s.trace);
  const clearTrace = usePulse((s) => s.clearTrace);
  const select = usePulse((s) => s.select);
  const router = useRouter();

  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setLineage(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .asset(selectedId)
      .then((d) => !cancelled && setLineage(d))
      .catch(() => !cancelled && setLineage(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (!selectedId) {
    return (
      <aside className="flex h-full flex-col border-l border-line bg-panel">
        <PanelHeading>Inspector</PanelHeading>
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-ink-faint">
            Select a node
            <br />
            to inspect its lineage
          </p>
        </div>
      </aside>
    );
  }

  const st = stateOf(selectedId);
  const a = lineage?.asset;
  const m = lineage?.metric;

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-panel">
      <PanelHeading right={<SimulatedTag />}>Inspector</PanelHeading>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !lineage ? (
          <div className="px-4 py-6 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Loading…
          </div>
        ) : a ? (
          <>
            {/* Identity */}
            <div className="border-b border-line px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-mono text-sm leading-tight text-ink">{a.name}</h3>
                <StateDot state={st} />
              </div>
              <p className="pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
                {NODE_LABEL[a.type]} · {a.system}
              </p>
              {a.description && (
                <p className="pt-3 text-[11px] leading-relaxed text-ink-mute">
                  {a.description}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-4">
                <Field label="Criticality" value={a.criticality} />
                <Field label="Owner" value={a.owner} />
                <Field
                  label="Health"
                  value={STATE[st].label}
                  color={STATE[st].hex}
                />
                <Field label="Schema" value={m?.schema_version ?? "—"} />
              </dl>
            </div>

            {/* Simulated telemetry */}
            {m && (
              <div className="border-b border-line px-4 py-4">
                <SectionLabel>Telemetry · Simulated</SectionLabel>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3">
                  <Field
                    label="Freshness"
                    value={formatAge(m.freshness_seconds)}
                    sub={`target ${formatAge(m.freshness_target)}`}
                    color={
                      m.freshness_seconds > m.freshness_target
                        ? STATE.STALE.hex
                        : undefined
                    }
                  />
                  <Field label="Latency" value={`${m.latency_ms}ms`} />
                  <Field
                    label="Volume"
                    value={m.row_volume ? formatCount(m.row_volume) : "—"}
                    sub={m.row_volume ? `${m.volume_delta_pct > 0 ? "+" : ""}${m.volume_delta_pct}%` : undefined}
                  />
                  <Field
                    label="Null ratio"
                    value={`${(m.null_ratio * 100).toFixed(2)}%`}
                    color={m.null_ratio > 0.03 ? STATE.DEGRADED.hex : undefined}
                  />
                  <Field label="Last run" value={m.last_run_status} />
                  <Field label="Updated" value={m.last_updated_iso.slice(11, 19)} />
                </dl>
              </div>
            )}

            {/* Lineage */}
            <div className="border-b border-line px-4 py-4">
              <SectionLabel>Lineage</SectionLabel>
              <div className="flex gap-6 pt-3">
                <div>
                  <div className="font-mono text-lg tabular-nums leading-none text-ink">
                    {lineage.upstream_count}
                  </div>
                  <div className="pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
                    Upstream
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg tabular-nums leading-none text-ink">
                    {lineage.downstream_count}
                  </div>
                  <div className="pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
                    Downstream
                  </div>
                </div>
              </div>

              <LineageList
                title="Direct upstream"
                items={lineage.upstream}
                onSelect={select}
                stateOf={stateOf}
              />
              <LineageList
                title="Direct downstream"
                items={lineage.downstream}
                onSelect={select}
                stateOf={stateOf}
              />
            </div>

            {/* Business consumers */}
            {lineage.business_consumers.length > 0 && (
              <div className="border-b border-line px-4 py-4">
                <SectionLabel>Business consumers</SectionLabel>
                <ul className="flex flex-wrap gap-1.5 pt-3">
                  {lineage.business_consumers.map((c) => (
                    <li
                      key={c.id}
                      className="border border-line px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute"
                    >
                      {c.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-6 font-mono text-[10px] text-failed">
            Failed to load asset.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-2 border-t border-line p-3">
        <Button
          onClick={() => {
            if (!lineage) return;
            const ids = [
              lineage.asset.id,
              ...lineage.upstream.map((x) => x.id),
              ...lineage.downstream.map((x) => x.id),
            ];
            trace(ids);
          }}
          disabled={!lineage}
          full
        >
          View lineage
        </Button>
        <Button
          variant="danger"
          onClick={() => router.push(`/chaos-lab?target=${selectedId}`)}
          full
        >
          Simulate failure
        </Button>
        <Button variant="ghost" onClick={clearTrace} full>
          Clear trace
        </Button>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
      {children}
    </h4>
  );
}

function Field({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </dt>
      <dd
        className="pt-0.5 font-mono text-[11px] tabular-nums"
        style={{ color: color ?? "#E6EAEC" }}
      >
        {value}
        {sub && <span className="pl-1 text-[9px] text-ink-mute">{sub}</span>}
      </dd>
    </div>
  );
}

function LineageList({
  title,
  items,
  onSelect,
  stateOf,
}: {
  title: string;
  items: { id: string; name: string }[];
  onSelect: (id: string) => void;
  stateOf: (id: string) => any;
}) {
  if (items.length === 0) return null;
  return (
    <div className="pt-4">
      <SectionLabel>{title}</SectionLabel>
      <ul className="pt-2">
        {items.map((x) => (
          <li key={x.id}>
            <button
              onClick={() => onSelect(x.id)}
              className="flex w-full items-center gap-2 py-1 text-left transition-colors hover:text-ink"
            >
              <StateDot state={stateOf(x.id)} size="xs" />
              <span className="truncate font-mono text-[10px] text-ink-dim">
                {x.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
