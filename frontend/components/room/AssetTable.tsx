"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { HealthMetric, HealthState, NodeType } from "@/lib/types";
import {
  CRITICALITY_LABEL,
  CRITICALITY_RANK,
  NODE_ABBR,
  STAGE_ORDER,
  STATE,
  formatAge,
  formatCount,
} from "@/lib/visual";
import { Badge, StatusDot, Table, Td, Th, Tr } from "@/components/ui/primitives";

/**
 * Dense, sortable asset table.
 *
 * This is the professional half of the Control Room: a data engineer should be
 * able to scan health, freshness, latency, volume, ownership and lineage weight
 * without opening anything. 32px rows, tabular numerals, quiet zebra-free
 * hairlines — density earned through hierarchy rather than shrinking type.
 */
type SortKey = "name" | "state" | "criticality" | "freshness" | "latency" | "downstream";

const STATE_RANK: Record<HealthState, number> = {
  FAILED: 0,
  DEGRADED: 1,
  STALE: 2,
  RECOVERING: 3,
  HEALTHY: 4,
};

export function AssetTable() {
  const visibleAssets = usePulse((s) => s.visibleAssets);
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const select = usePulse((s) => s.select);
  const hover = usePulse((s) => s.hover);
  const stateOf = usePulse((s) => s.stateOf);
  const systemFilter = usePulse((s) => s.systemFilter);
  const query = usePulse((s) => s.query);

  const [metrics, setMetrics] = useState<Map<string, HealthMetric>>(new Map());
  const [sort, setSort] = useState<SortKey>("state");
  const [asc, setAsc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .healthMetrics()
      .then((list) => {
        if (cancelled) return;
        setMetrics(new Map(list.map((m) => [m.asset_id, m])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Downstream counts come straight from the dependency edges.
  const downstream = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of topology?.dependencies ?? []) {
      m.set(d.upstream, (m.get(d.upstream) ?? 0) + 1);
    }
    return m;
  }, [topology]);

  const rows = useMemo(() => {
    const list = visibleAssets();
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "state":
          return (
            (STATE_RANK[stateOf(a.id)] - STATE_RANK[stateOf(b.id)]) * dir ||
            a.name.localeCompare(b.name)
          );
        case "criticality":
          return (
            (CRITICALITY_RANK[b.criticality] - CRITICALITY_RANK[a.criticality]) * dir ||
            a.name.localeCompare(b.name)
          );
        case "freshness":
          return (
            ((metrics.get(a.id)?.freshness_seconds ?? 0) -
              (metrics.get(b.id)?.freshness_seconds ?? 0)) *
            dir
          );
        case "latency":
          return (
            ((metrics.get(a.id)?.latency_ms ?? 0) - (metrics.get(b.id)?.latency_ms ?? 0)) *
            dir
          );
        case "downstream":
          return ((downstream.get(a.id) ?? 0) - (downstream.get(b.id) ?? 0)) * dir;
        default:
          return (
            (STAGE_ORDER.indexOf(a.type) - STAGE_ORDER.indexOf(b.type)) * dir ||
            a.name.localeCompare(b.name)
          );
      }
    });
  }, [visibleAssets, sort, asc, stateOf, metrics, downstream, systemFilter, query]);

  const header = (
    key: SortKey,
    label: string,
    align: "left" | "right" = "left",
    width?: string,
    className?: string
  ) => (
    <Th align={align} width={width} className={className}>
      <button
        onClick={() => {
          if (sort === key) setAsc(!asc);
          else {
            setSort(key);
            setAsc(true);
          }
        }}
        className={`inline-flex items-center gap-1 transition-colors duration-instant hover:text-secondary ${
          sort === key ? "text-secondary" : ""
        }`}
      >
        {label}
        {sort === key && <span aria-hidden>{asc ? "↑" : "↓"}</span>}
      </button>
    </Th>
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-small text-quaternary">No assets match the current filter.</p>
      </div>
    );
  }

  return (
    <Table>
      <thead>
        <tr>
          {header("name", "Asset")}
          <Th width="96px">Type</Th>
          {header("state", "Health", "left", "108px")}
          {header("criticality", "Criticality", "left", "96px", "hidden lg:table-cell")}
          {header("freshness", "Freshness", "right", "88px")}
          {header("latency", "Latency", "right", "80px", "hidden xl:table-cell")}
          <Th align="right" width="80px" className="hidden 2xl:table-cell">Rows</Th>
          {header("downstream", "Down", "right", "68px")}
          <Th width="92px" className="hidden 2xl:table-cell">Owner</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const st = stateOf(a.id);
          const m = metrics.get(a.id);
          const stale = m ? m.freshness_seconds > m.freshness_target : false;
          return (
            <Tr
              key={a.id}
              selected={selectedId === a.id}
              onClick={() => select(a.id)}
            >
              <Td>
                <span
                  className="flex min-w-0 items-center gap-2"
                  onMouseEnter={() => hover(a.id)}
                  onMouseLeave={() => hover(null)}
                >
                  <StatusDot state={st} />
                  <span className="truncate text-primary">{a.name}</span>
                </span>
              </Td>
              <Td>
                <span className="text-tertiary">{NODE_ABBR[a.type as NodeType]}</span>
              </Td>
              <Td>
                <span className={STATE[st].text}>{STATE[st].label}</span>
              </Td>
              <Td className="hidden lg:table-cell">
                {a.criticality === "CRITICAL" || a.criticality === "HIGH" ? (
                  <Badge tone={a.criticality === "CRITICAL" ? "FAILED" : "neutral"}>
                    {CRITICALITY_LABEL[a.criticality]}
                  </Badge>
                ) : (
                  <span className="text-tertiary">{CRITICALITY_LABEL[a.criticality]}</span>
                )}
              </Td>
              <Td align="right" mono className={stale ? "text-degraded" : "text-secondary"}>
                {m ? formatAge(m.freshness_seconds) : "—"}
              </Td>
              <Td align="right" mono className="hidden text-secondary xl:table-cell">
                {m ? `${m.latency_ms}ms` : "—"}
              </Td>
              <Td align="right" mono className="hidden text-secondary 2xl:table-cell">
                {m && m.row_volume > 0 ? formatCount(m.row_volume) : "—"}
              </Td>
              <Td align="right" mono className="text-secondary">
                {downstream.get(a.id) ?? 0}
              </Td>
              <Td className="hidden 2xl:table-cell">
                <span className="truncate text-tertiary">{a.owner}</span>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
