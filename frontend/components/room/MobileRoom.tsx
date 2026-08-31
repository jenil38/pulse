"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Asset, Lineage } from "@/lib/types";
import { NODE_LABEL, STAGE_ORDER, STATE, formatAge } from "@/lib/visual";
import { SimulatedTag, StateDot } from "@/components/ui/primitives";

/**
 * Mobile Control Room — 2D-first (DESIGN.md §31).
 *
 * Same product, no WebGL: health rollup, system list, and lineage cards that
 * show upstream/downstream as lists rather than a 3D graph.
 */
export function MobileRoom() {
  const topology = usePulse((s) => s.topology);
  const overview = usePulse((s) => s.overview);
  const stateOf = usePulse((s) => s.stateOf);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineage, setLineage] = useState<Lineage | null>(null);

  useEffect(() => {
    if (!openId) {
      setLineage(null);
      return;
    }
    let cancelled = false;
    api
      .asset(openId)
      .then((d) => !cancelled && setLineage(d))
      .catch(() => !cancelled && setLineage(null));
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const grouped = useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const a of topology?.assets ?? []) {
      const list = m.get(a.system) ?? [];
      list.push(a);
      m.set(a.system, list);
    }
    for (const [k, list] of m) {
      list.sort(
        (x, y) =>
          STAGE_ORDER.indexOf(x.type) - STAGE_ORDER.indexOf(y.type) ||
          x.name.localeCompare(y.name)
      );
      m.set(k, list);
    }
    return m;
  }, [topology]);

  return (
    <div className="min-h-screen bg-void pb-16">
      {/* Vitals */}
      <section className="border-b border-line bg-panel px-5 py-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-[0.24em] text-ink">
            PULSE
          </span>
          <SimulatedTag text="Demo data" />
        </div>
        <p className="pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          Control Room · {topology?.organization ?? "—"}
        </p>

        {overview && (
          <>
            <div className="flex items-baseline gap-2 pt-5">
              <span className="font-mono text-3xl tabular-nums leading-none text-ink">
                {overview.resilience_score}
              </span>
              <span className="font-mono text-[10px] text-ink-faint">/ 100</span>
              <span className="pl-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute">
                Resilience
              </span>
            </div>
            {overview.weakest_component && (
              <p className="pt-2 font-mono text-[10px] text-ink-mute">
                Weakest: {overview.weakest_component}
              </p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-4">
              {Object.entries(overview.counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: STATE[k as keyof typeof STATE]?.hex }}
                    />
                    <span className="font-mono text-[11px] tabular-nums text-ink-dim">
                      {n}
                    </span>
                    <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint">
                      {k}
                    </span>
                  </span>
                ))}
            </div>
          </>
        )}
      </section>

      {/* Systems & assets */}
      {[...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([system, assets]) => (
          <section key={system} className="border-b border-line">
            <h2 className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
              {system}
            </h2>
            <ul>
              {assets.map((a) => {
                const open = openId === a.id;
                return (
                  <li key={a.id} className="border-t border-line/60">
                    <button
                      onClick={() => setOpenId(open ? null : a.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left"
                    >
                      <StateDot state={stateOf(a.id)} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[11px] text-ink-dim">
                          {a.name}
                        </span>
                        <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint">
                          {NODE_LABEL[a.type]} · {a.criticality}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        {open ? "−" : "+"}
                      </span>
                    </button>

                    {open && lineage && lineage.asset.id === a.id && (
                      <div className="bg-panel px-5 pb-4 pt-1">
                        {a.description && (
                          <p className="pb-3 text-[11px] leading-relaxed text-ink-mute">
                            {a.description}
                          </p>
                        )}
                        <div className="flex gap-6 pb-3">
                          <Metric n={lineage.upstream_count} label="Upstream" />
                          <Metric n={lineage.downstream_count} label="Downstream" />
                          {lineage.metric && (
                            <Metric
                              text={formatAge(lineage.metric.freshness_seconds)}
                              label="Freshness"
                            />
                          )}
                        </div>
                        <LineList title="Direct upstream" items={lineage.upstream} />
                        <LineList title="Direct downstream" items={lineage.downstream} />
                        {lineage.business_consumers.length > 0 && (
                          <LineList
                            title="Business consumers"
                            items={lineage.business_consumers}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      <p className="px-5 py-6 font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-ink-faint">
        The 3D system map is available on larger screens.
      </p>
    </div>
  );
}

function Metric({ n, text, label }: { n?: number; text?: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-base tabular-nums leading-none text-ink">
        {text ?? n}
      </div>
      <div className="pt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </div>
    </div>
  );
}

function LineList({ title, items }: { title: string; items: Asset[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pt-2">
      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint">
        {title}
      </div>
      <ul className="flex flex-wrap gap-1.5 pt-1.5">
        {items.map((i) => (
          <li
            key={i.id}
            className="border border-line px-2 py-1 font-mono text-[9px] text-ink-mute"
          >
            {i.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
