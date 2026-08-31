"use client";

import { useMemo, useState } from "react";
import { usePulse } from "@/lib/store";
import type { Asset, NodeType } from "@/lib/types";
import { NODE_LABEL, STAGE_ORDER } from "@/lib/visual";
import { PanelHeading, StateBar, StateDot } from "@/components/ui/primitives";

/**
 * Left pane — systems and their assets, grouped by pipeline stage.
 * Doubles as the keyboard-accessible alternative to clicking nodes in 3D.
 */
export function SystemsPanel() {
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const select = usePulse((s) => s.select);
  const hover = usePulse((s) => s.hover);
  const stateOf = usePulse((s) => s.stateOf);
  const [query, setQuery] = useState("");
  const [openSystems, setOpenSystems] = useState<Set<string>>(
    () => new Set(["Payments", "Commerce"])
  );

  const grouped = useMemo(() => {
    const out = new Map<string, Asset[]>();
    for (const a of topology?.assets ?? []) {
      if (query && !a.name.toLowerCase().includes(query.toLowerCase())) continue;
      const list = out.get(a.system) ?? [];
      list.push(a);
      out.set(a.system, list);
    }
    // Order assets within a system by pipeline stage.
    for (const [k, list] of out) {
      list.sort(
        (x, y) =>
          STAGE_ORDER.indexOf(x.type) - STAGE_ORDER.indexOf(y.type) ||
          x.name.localeCompare(y.name)
      );
      out.set(k, list);
    }
    return out;
  }, [topology, query]);

  const toggle = (name: string) =>
    setOpenSystems((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line bg-panel">
      <PanelHeading>Systems</PanelHeading>

      <div className="border-b border-line px-3 py-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="FILTER ASSETS"
          aria-label="Filter assets"
          className="w-full bg-transparent font-mono text-[10px] uppercase tracking-[0.14em] text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {[...grouped.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([system, assets]) => {
            const counts: Record<string, number> = {};
            for (const a of assets) {
              const s = stateOf(a.id);
              counts[s] = (counts[s] ?? 0) + 1;
            }
            const open = openSystems.has(system) || query.length > 0;
            return (
              <div key={system} className="border-b border-line/60">
                <button
                  onClick={() => toggle(system)}
                  aria-expanded={open}
                  className="group flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-raised/60"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim group-hover:text-ink">
                    {system}
                  </span>
                  <span className="font-mono text-[9px] tabular-nums text-ink-faint">
                    {assets.length}
                  </span>
                </button>
                <div className="px-4 pb-2">
                  <StateBar counts={counts} />
                </div>

                {open && (
                  <ul className="pb-1">
                    {assets.map((a) => {
                      const st = stateOf(a.id);
                      const active = selectedId === a.id;
                      return (
                        <li key={a.id}>
                          <button
                            onClick={() => select(a.id)}
                            onMouseEnter={() => hover(a.id)}
                            onMouseLeave={() => hover(null)}
                            aria-current={active}
                            className={`flex w-full items-center gap-2 border-l-2 py-1.5 pl-4 pr-3 text-left transition-colors ${
                              active
                                ? "border-l-healthy bg-raised"
                                : "border-l-transparent hover:bg-raised/50"
                            }`}
                          >
                            <StateDot state={st} size="xs" />
                            <span
                              className={`flex-1 truncate font-mono text-[10px] ${
                                active ? "text-ink" : "text-ink-dim"
                              }`}
                            >
                              {a.name}
                            </span>
                            <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">
                              {shortType(a.type)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </aside>
  );
}

function shortType(t: NodeType): string {
  const map: Partial<Record<NodeType, string>> = {
    SOURCE: "SRC",
    INGESTION: "ING",
    RAW_TABLE: "RAW",
    TRANSFORMATION: "TRF",
    WAREHOUSE_TABLE: "WH",
    DATA_MODEL: "MDL",
    DASHBOARD: "DASH",
    ML_MODEL: "ML",
    BUSINESS_PROCESS: "BP",
    TEAM: "TEAM",
  };
  return map[t] ?? NODE_LABEL[t];
}
