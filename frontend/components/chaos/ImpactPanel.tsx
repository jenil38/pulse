"use client";

import { useState } from "react";
import type { Simulation } from "@/lib/types";
import { STATE } from "@/lib/visual";
import {
  PanelHeading,
  SeverityTag,
  StateDot,
  SimulatedTag,
} from "@/components/ui/primitives";

/**
 * Chaos Lab — right pane. Predicted impact, derived entirely from the
 * deterministic blast-radius computation (never invented in the UI).
 */
export function ImpactPanel({
  simulation,
  revealedHops,
}: {
  simulation: Simulation | null;
  revealedHops: number;
}) {
  const [tab, setTab] = useState<"impact" | "recovery">("impact");

  if (!simulation) {
    return (
      <aside className="flex h-full flex-col border-l border-line bg-panel">
        <PanelHeading>Predicted impact</PanelHeading>
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-ink-faint">
            Configure a failure
            <br />
            and inject to see
            <br />
            its blast radius
          </p>
        </div>
      </aside>
    );
  }

  const br = simulation.blast_radius;
  const impacted = br.nodes.filter((n) => n.id !== br.origin);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-panel">
      <PanelHeading right={<SimulatedTag />}>Predicted impact</PanelHeading>

      {/* Headline numbers */}
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl tabular-nums leading-none text-failed">
            {br.total_affected}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
            downstream assets affected
          </span>
        </div>
        <p className="pt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
          {br.failure_label} · {br.mode} · origin {br.origin_name}
        </p>
        {simulation.parameter && (
          <p className="pt-1 font-mono text-[10px] text-degraded">
            {simulation.parameter}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 pt-4">
          <Stat label="Dashboards" value={br.critical_dashboards.length} />
          <Stat label="ML models" value={br.ml_models.length} />
          <Stat label="Teams" value={br.teams.length} />
        </div>
        <div className="pt-3">
          <Stat label="Blast score" value={br.blast_score} wide />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line">
        {(["impact", "recovery"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
              tab === t
                ? "border-b border-healthy text-healthy"
                : "text-ink-faint hover:text-ink-dim"
            }`}
          >
            {t === "impact" ? "Impact" : `Recovery · ${simulation.recovery.length}`}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "impact" ? (
          <ul>
            {impacted.map((n) => {
              const revealed = n.hops <= revealedHops;
              return (
                <li
                  key={n.id}
                  className={`flex items-center gap-2 border-b border-line/50 px-4 py-2 transition-opacity duration-500 ${
                    revealed ? "opacity-100" : "opacity-25"
                  }`}
                >
                  <StateDot state={n.state} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[10px] text-ink-dim">
                      {n.name}
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">
                      hop {n.hops} · {STATE[n.state].label}
                      {n.untrustworthy && " · untrustworthy"}
                    </div>
                  </div>
                  <SeverityTag severity={n.severity} />
                </li>
              );
            })}
          </ul>
        ) : (
          <ol>
            {simulation.recovery.map((s) => (
              <li
                key={s.order}
                className="flex gap-3 border-b border-line/50 px-4 py-2.5"
              >
                <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                  {String(s.order).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] leading-snug text-ink-dim">
                    {s.action}
                  </div>
                  <div className="pt-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint">
                    {s.kind}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function Stat({
  label,
  value,
  wide,
}: {
  label: string;
  value: number;
  wide?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </div>
      <div
        className={`pt-0.5 font-mono tabular-nums leading-none text-ink ${wide ? "text-base" : "text-lg"}`}
      >
        {value}
      </div>
    </div>
  );
}
