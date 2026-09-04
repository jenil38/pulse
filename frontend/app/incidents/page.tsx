"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Async, ErrorBanner } from "@/components/ui/AsyncState";
import { usePulse } from "@/lib/store";
import type { Incident } from "@/lib/types";
import { formatRelative } from "@/lib/visual";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import {
  Badge,
  EmptyState,
  SeverityBadge,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
} from "@/components/ui/primitives";

/**
 * Incidents — a real table, not a stack of cards.
 *
 * Status is a small dot + label; severity is a restrained chip. Everything is
 * scannable in one pass, and the row is the click target.
 */
const STATUS_DOT: Record<string, string> = {
  open: "bg-failed",
  acknowledged: "bg-degraded",
  recovering: "bg-recovering",
  resolved: "bg-healthy",
};

type Filter = "all" | "active" | "resolved";

export default function IncidentsPage() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const [filter, setFilter] = useState<Filter>("all");
  const req = useAsync<Incident[]>(() => api.incidents(), []);
  const incidents = req.data ?? [];

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  const counts = useMemo(
    () => ({
      all: incidents.length,
      active: incidents.filter((i) => i.status !== "resolved").length,
      resolved: incidents.filter((i) => i.status === "resolved").length,
    }),
    [incidents]
  );

  const rows = useMemo(
    () =>
      incidents.filter((i) =>
        filter === "all"
          ? true
          : filter === "active"
            ? i.status !== "resolved"
            : i.status === "resolved"
      ),
    [incidents, filter]
  );

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Incidents" />

        {!!req.error && !!req.data && (
          <ErrorBanner error={req.error} onRetry={req.reload} onDismiss={req.dismissError} />
        )}

        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active },
            { value: "resolved", label: "Resolved", count: counts.resolved },
          ]}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Async
            loading={req.loading}
            error={req.error}
            data={req.data}
            onRetry={req.reload}
            what="incidents"
            isEmpty={() => rows.length === 0}
            empty={
              <EmptyState
                title={filter === "all" ? "No incidents" : `No ${filter} incidents`}
                hint="Run a failure in the Chaos Lab and record it here to keep its replay and recovery plan."
              />
            }
          >
            {() => (
              <Table>
              <thead>
                <tr>
                  <Th>Incident</Th>
                  <Th width="104px">Status</Th>
                  <Th width="92px">Severity</Th>
                  <Th align="right" width="76px">Assets</Th>
                  <Th width="180px">Teams</Th>
                  <Th align="right" width="92px">Started</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <IncidentRow key={i.id} incident={i} />
                ))}
                </tbody>
              </Table>
            )}
          </Async>
        </div>
      </div>
    </AppShell>
  );
}

function IncidentRow({ incident: i }: { incident: Incident }) {
  return (
    <Tr>
      <Td>
        <Link href={`/incidents/${i.id}`} className="flex min-w-0 items-center gap-2">
          <span className="min-w-0">
            <span className="block truncate text-primary">{i.title}</span>
            <span className="block font-mono text-caption text-quaternary">{i.id}</span>
          </span>
        </Link>
      </Td>
      <Td>
        <span className="flex items-center gap-1.5">
          <span
            className={`h-[6px] w-[6px] shrink-0 rounded-full ${STATUS_DOT[i.status]}`}
            aria-hidden
          />
          <span className="capitalize text-secondary">{i.status}</span>
        </span>
      </Td>
      <Td>
        <SeverityBadge severity={i.severity} />
      </Td>
      <Td align="right" mono className="text-secondary">
        {i.affected_assets}
      </Td>
      <Td>
        <span className="flex flex-wrap gap-1">
          {i.teams.slice(0, 2).map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {i.teams.length > 2 && <Badge>+{i.teams.length - 2}</Badge>}
        </span>
      </Td>
      <Td align="right" className="text-tertiary">
        {formatRelative(i.started_at)}
      </Td>
    </Tr>
  );
}
