"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Simulation } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { NODE_ABBR, STATE } from "@/lib/visual";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  PanelHeader,
  Property,
  SeverityBadge,
  StatusDot,
  Tabs,
} from "@/components/ui/primitives";

/**
 * Chaos Lab — predicted impact.
 *
 * Every figure here comes from the deterministic blast-radius computation; the
 * UI never invents a number. Rows reveal progressively as the propagation wave
 * reaches each hop, so the list and the map tell the same story in step.
 */
type Tab = "impact" | "recovery";

export function ImpactPanel({
  simulation,
  revealedHops,
}: {
  simulation: Simulation | null;
  revealedHops: number;
}) {
  const [tab, setTab] = useState<Tab>("impact");

  if (!simulation) {
    return (
      <aside
        data-surface
        className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-subtle"
      >
        <PanelHeader>Predicted impact</PanelHeader>
        <EmptyState
          title="No simulation running"
          hint="Choose a target and a failure type, then inject to compute the blast radius."
        />
      </aside>
    );
  }

  const br = simulation.blast_radius;
  const impacted = br.nodes.filter((n) => n.id !== br.origin);

  return (
    <aside
      data-surface
      className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-subtle"
    >
      <PanelHeader>Predicted impact</PanelHeader>

      {/* Headline */}
      <div className="shrink-0 border-b border-border px-4 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-title-lg tnum text-failed">{br.total_affected}</span>
          <span className="text-small text-tertiary">downstream assets affected</span>
        </div>
        <dl className="pt-3">
          <Property label="Origin">{br.origin_name}</Property>
          <Property label="Failure">{br.failure_label}</Property>
          {simulation.parameter && (
            <Property label="Parameter" mono>
              {simulation.parameter}
            </Property>
          )}
          <Property label="Mode">{br.mode}</Property>
          <Property label="Blast score" mono>
            {br.blast_score}
          </Property>
        </dl>

        <div className="grid grid-cols-3 gap-3 pt-3">
          <Stat label="Dashboards" value={br.critical_dashboards.length} />
          <Stat label="ML models" value={br.ml_models.length} />
          <Stat label="Teams" value={br.teams.length} />
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "impact", label: "Impact", count: impacted.length },
          { value: "recovery", label: "Recovery", count: simulation.recovery.length },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "impact" ? (
          <ul>
            {impacted.map((n) => {
              const revealed = n.hops <= revealedHops;
              return (
                <li
                  key={n.id}
                  className={`flex items-center gap-2.5 border-b border-border-subtle px-4 py-2 transition-opacity duration-slow ease-standard ${
                    revealed ? "opacity-100" : "opacity-30"
                  }`}
                >
                  <StatusDot state={n.state} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-small text-primary">{n.name}</div>
                    <div className="text-caption text-tertiary">
                      {NODE_ABBR[n.type]} · hop {n.hops} · {STATE[n.state].label}
                      {n.untrustworthy && " · untrustworthy"}
                    </div>
                  </div>
                  <SeverityBadge severity={n.severity} />
                </li>
              );
            })}
          </ul>
        ) : (
          <ol>
            {simulation.recovery.map((s) => (
              <li
                key={s.order}
                className="flex gap-3 border-b border-border-subtle px-4 py-2.5"
              >
                <span className="w-5 shrink-0 pt-px font-mono text-caption tnum text-quaternary">
                  {String(s.order).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-small leading-snug text-primary">{s.action}</p>
                  <p className="pt-0.5 text-caption text-tertiary">{s.kind}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <KeepRun simulation={simulation} />
    </aside>
  );
}

/**
 * Turning a run into something that outlives it.
 *
 * A simulation is a pure computation — closing the tab loses it. Saving it as
 * a scenario keeps the configuration so it can be re-run against this system
 * later; recording it as an incident keeps it as a event with a replay and a
 * recovery plan. Neither is offered against the demo, which belongs to nobody.
 */
function KeepRun({ simulation }: { simulation: Simulation }) {
  const active = useWorkspace((s) => s.active);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "recorded">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!active || active.kind === "demo") {
    return (
      <p className="shrink-0 border-t border-border px-4 py-2.5 text-caption leading-relaxed text-quaternary">
        Runs against the sample system are not kept. Open one of your own
        systems to save this as a scenario.
      </p>
    );
  }

  const br = simulation.blast_radius;

  const saveScenario = async () => {
    setState("saving");
    setError(null);
    try {
      await api.saveScenario(active.id, {
        name: `${br.failure_label} — ${br.origin_name}`,
        origin: br.origin,
        failure_type: br.failure_type,
        duration_minutes: simulation.duration_minutes,
        parameter: simulation.parameter ?? null,
      });
      setState("saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the scenario.");
      setState("idle");
    }
  };

  const recordIncident = async () => {
    setState("saving");
    setError(null);
    try {
      await api.recordIncident({
        origin: br.origin,
        failure_type: br.failure_type,
        duration_minutes: simulation.duration_minutes,
      });
      setState("recorded");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the incident.");
      setState("idle");
    }
  };

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      {state === "saved" || state === "recorded" ? (
        <p className="text-caption text-healthy">
          {state === "saved"
            ? "Saved to this system's scenarios."
            : "Recorded as an incident."}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={saveScenario} disabled={state === "saving"}>
            Save as scenario
          </Button>
          <Button size="sm" variant="ghost" onClick={recordIncident} disabled={state === "saving"}>
            Record incident
          </Button>
        </div>
      )}
      {error && <p className="pt-1.5 text-caption text-failed">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-caption text-tertiary">{label}</div>
      <div className="pt-0.5 text-heading tnum text-primary">{value}</div>
    </div>
  );
}
