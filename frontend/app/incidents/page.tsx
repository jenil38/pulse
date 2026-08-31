"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Incident } from "@/lib/types";
import { SEVERITY } from "@/lib/visual";
import { NavRail } from "@/components/room/NavRail";
import { StatusBar } from "@/components/room/StatusBar";
import { PanelHeading, SeverityTag, SimulatedTag } from "@/components/ui/primitives";

const STATUS_COLOR: Record<string, string> = {
  open: "#C85A4E",
  acknowledged: "#C8933F",
  recovering: "#5FA8C8",
  resolved: "#3FC8BC",
};

export default function IncidentsPage() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopology();
    api
      .incidents()
      .then(setIncidents)
      .catch(() => setIncidents([]))
      .finally(() => setLoading(false));
  }, [loadTopology]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <StatusBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="haze min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-8 py-10">
            <header className="pb-8">
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-lg tracking-[0.16em] text-ink">
                  INCIDENTS
                </h1>
                <SimulatedTag text="Demo history" />
              </div>
              <p className="pt-2 text-[11px] leading-relaxed text-ink-mute">
                Past and active incidents. Open one to replay how the failure
                propagated through the system.
              </p>
            </header>

            {loading ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                Loading…
              </p>
            ) : incidents.length === 0 ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                No incidents recorded.
              </p>
            ) : (
              <ul className="border border-line">
                {incidents.map((i) => (
                  <li key={i.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/incidents/${i.id}`}
                      className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-raised/60"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: STATUS_COLOR[i.status] }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12px] text-ink group-hover:text-healthy">
                          {i.title}
                        </div>
                        <div className="pt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                          {i.id} · {i.started_at.replace("T", " ").replace("Z", "")} ·{" "}
                          {i.affected_assets} assets affected
                          {i.teams.length > 0 && ` · ${i.teams.join(", ")}`}
                        </div>
                      </div>
                      <SeverityTag severity={i.severity} />
                      <span
                        className="w-24 shrink-0 text-right font-mono text-[9px] uppercase tracking-[0.14em]"
                        style={{ color: STATUS_COLOR[i.status] }}
                      >
                        {i.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
