"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { Asset, FailureType, FailureTypeInfo } from "@/lib/types";
import { NODE_LABEL, STAGE_ORDER } from "@/lib/visual";
import { Button, PanelHeading } from "@/components/ui/primitives";

/**
 * Chaos Lab — left pane. Configure a SAFE simulated failure.
 * Nothing here touches real data; it parameterises a graph computation.
 */

/** Suggested parameter text per failure type — becomes the incident detail. */
const PARAM_PRESETS: Record<FailureType, string> = {
  SOURCE_OUTAGE: "endpoint unreachable",
  SCHEMA_DRIFT: "amount: DECIMAL -> STRING",
  STALE_DATA: "snapshot age > 24h",
  VOLUME_DROP: "row count -87% vs baseline",
  NULL_SPIKE: "null ratio -> 22%",
  DUPLICATE_SPIKE: "duplicate keys -> 14%",
  TRANSFORMATION_FAILURE: "model build error",
  WAREHOUSE_DELAY: "load queue backed up 3h",
  API_LATENCY: "p99 latency 8.4s",
  DATATYPE_CHANGE: "timestamp: TIMESTAMP -> STRING",
};

const MODE_NOTE: Record<string, string> = {
  STARVE: "No fresh data arrives — downstream goes stale.",
  BREAK: "Structure fails — transformations break, tables degrade.",
  CORRUPT: "Wrong values flow through — downstream degrades.",
};

export function FailureConfig({
  onRun,
  running,
}: {
  onRun: (target: string, failure: FailureType, minutes: number, parameter: string) => void;
  running: boolean;
}) {
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const select = usePulse((s) => s.select);

  const [failureTypes, setFailureTypes] = useState<FailureTypeInfo[]>([]);
  const [failure, setFailure] = useState<FailureType>("SCHEMA_DRIFT");
  const [minutes, setMinutes] = useState(30);
  const [parameter, setParameter] = useState(PARAM_PRESETS.SCHEMA_DRIFT);
  const [touchedParam, setTouchedParam] = useState(false);

  useEffect(() => {
    api.failureTypes().then(setFailureTypes).catch(() => setFailureTypes([]));
  }, []);

  // Keep the parameter hint in sync unless the user has customised it.
  useEffect(() => {
    if (!touchedParam) setParameter(PARAM_PRESETS[failure]);
  }, [failure, touchedParam]);

  const targets = useMemo(() => {
    const list = [...(topology?.assets ?? [])];
    list.sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.type) - STAGE_ORDER.indexOf(b.type) ||
        a.name.localeCompare(b.name)
    );
    return list;
  }, [topology]);

  const mode = failureTypes.find((f) => f.value === failure)?.mode;
  const target = targets.find((t) => t.id === selectedId);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line bg-panel">
      <PanelHeading>Configure failure</PanelHeading>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* TARGET */}
        <Field label="Target">
          <select
            value={selectedId ?? ""}
            onChange={(e) => select(e.target.value || null)}
            className="w-full border border-line bg-raised px-2 py-2 font-mono text-[10px] text-ink focus:border-healthy/50 focus:outline-none"
          >
            <option value="">— select an asset —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {NODE_LABEL[t.type]}
              </option>
            ))}
          </select>
          {target && (
            <p className="pt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
              {target.system} · {target.criticality}
            </p>
          )}
        </Field>

        {/* FAILURE TYPE */}
        <Field label="Failure type">
          <div className="space-y-1">
            {failureTypes.map((f) => {
              const active = f.value === failure;
              return (
                <button
                  key={f.value}
                  onClick={() => setFailure(f.value)}
                  className={`flex w-full items-center justify-between border px-2.5 py-1.5 text-left transition-colors ${
                    active
                      ? "border-failed/50 bg-failed/10 text-failed"
                      : "border-line bg-raised text-ink-dim hover:border-ink-faint hover:text-ink"
                  }`}
                >
                  <span className="font-mono text-[10px]">{f.label}</span>
                  <span className="font-mono text-[8px] uppercase tracking-[0.12em] opacity-60">
                    {f.mode}
                  </span>
                </button>
              );
            })}
          </div>
          {mode && (
            <p className="pt-2 font-mono text-[9px] leading-relaxed text-ink-mute">
              {MODE_NOTE[mode]}
            </p>
          )}
        </Field>

        {/* PARAMETERS */}
        <Field label="Parameters">
          <input
            value={parameter}
            onChange={(e) => {
              setParameter(e.target.value);
              setTouchedParam(true);
            }}
            className="w-full border border-line bg-raised px-2 py-2 font-mono text-[10px] text-ink focus:border-healthy/50 focus:outline-none"
          />
        </Field>

        {/* DURATION */}
        <Field label={`Duration · ${minutes} min`}>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full accent-healthy"
            aria-label="Failure duration in minutes"
          />
          <div className="flex justify-between pt-1">
            <span className="font-mono text-[8px] text-ink-faint">5m</span>
            <span className="font-mono text-[8px] text-ink-faint">4h</span>
          </div>
        </Field>
      </div>

      <div className="space-y-2 border-t border-line p-3">
        <Button
          variant="danger"
          full
          disabled={!selectedId || running}
          onClick={() =>
            selectedId && onRun(selectedId, failure, minutes, parameter)
          }
        >
          {running ? "Injecting…" : "Inject failure"}
        </Button>
        <p className="text-center font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint">
          Safe simulation · no real data touched
        </p>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block pb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </label>
      {children}
    </div>
  );
}
