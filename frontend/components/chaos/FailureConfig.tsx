"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePulse } from "@/lib/store";
import type { FailureType, FailureTypeInfo } from "@/lib/types";
import { NODE_LABEL, STAGE_ORDER } from "@/lib/visual";
import { Button } from "@/components/ui/Button";
import { PanelHeader, StatusDot } from "@/components/ui/primitives";

/**
 * Chaos Lab — configuration panel.
 *
 * A proper form: labelled fields, a real select, radio-style failure list, a
 * duration slider. Nothing here is decorated; the drama belongs to the stage,
 * not the controls.
 */
const PARAM_PRESETS: Record<FailureType, string> = {
  SOURCE_OUTAGE: "endpoint unreachable",
  SCHEMA_DRIFT: "amount: DECIMAL → STRING",
  STALE_DATA: "snapshot age > 24h",
  VOLUME_DROP: "row count −87% vs baseline",
  NULL_SPIKE: "null ratio → 22%",
  DUPLICATE_SPIKE: "duplicate keys → 14%",
  TRANSFORMATION_FAILURE: "model build error",
  WAREHOUSE_DELAY: "load queue backed up 3h",
  API_LATENCY: "p99 latency 8.4s",
  DATATYPE_CHANGE: "timestamp: TIMESTAMP → STRING",
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
  const stateOf = usePulse((s) => s.stateOf);

  const [types, setTypes] = useState<FailureTypeInfo[]>([]);
  const [failure, setFailure] = useState<FailureType>("SCHEMA_DRIFT");
  const [minutes, setMinutes] = useState(30);
  const [parameter, setParameter] = useState(PARAM_PRESETS.SCHEMA_DRIFT);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    api.failureTypes().then(setTypes).catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    if (!touched) setParameter(PARAM_PRESETS[failure]);
  }, [failure, touched]);

  const targets = useMemo(() => {
    const list = [...(topology?.assets ?? [])];
    list.sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.type) - STAGE_ORDER.indexOf(b.type) ||
        a.name.localeCompare(b.name)
    );
    return list;
  }, [topology]);

  const mode = types.find((f) => f.value === failure)?.mode;
  const target = targets.find((t) => t.id === selectedId);

  return (
    <aside
      data-surface
      className="flex h-full w-[288px] shrink-0 flex-col border-r border-border bg-canvas"
    >
      <PanelHeader>Configure failure</PanelHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Field label="Target asset" htmlFor="target">
          <select
            id="target"
            value={selectedId ?? ""}
            onChange={(e) => select(e.target.value || null)}
            className="h-control w-full rounded border border-border bg-surface px-2 text-small text-primary transition-colors duration-instant hover:border-border-strong focus:border-accent focus:outline-none"
          >
            <option value="">Select an asset…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {NODE_LABEL[t.type]}
              </option>
            ))}
          </select>
          {target && (
            <p className="flex items-center gap-1.5 pt-1.5">
              <StatusDot state={stateOf(target.id)} />
              <span className="text-caption text-tertiary">
                {target.system} · {target.criticality.toLowerCase()} criticality
              </span>
            </p>
          )}
        </Field>

        <Field label="Failure type">
          <div className="space-y-px">
            {types.map((f) => {
              const active = f.value === failure;
              return (
                <button
                  key={f.value}
                  onClick={() => setFailure(f.value)}
                  aria-pressed={active}
                  className={[
                    "flex h-control w-full items-center justify-between gap-2 rounded px-2.5 text-left transition-colors duration-instant",
                    active
                      ? "bg-muted font-medium text-primary"
                      : "text-secondary hover:bg-subtle hover:text-primary",
                  ].join(" ")}
                >
                  <span className="truncate text-small">{f.label}</span>
                  <span className="shrink-0 text-micro uppercase text-quaternary">
                    {f.mode}
                  </span>
                </button>
              );
            })}
          </div>
          {mode && (
            <p className="pt-2 text-caption leading-relaxed text-tertiary">
              {MODE_NOTE[mode]}
            </p>
          )}
        </Field>

        <Field label="Parameter" htmlFor="param">
          <input
            id="param"
            value={parameter}
            onChange={(e) => {
              setParameter(e.target.value);
              setTouched(true);
            }}
            className="h-control w-full rounded border border-border bg-surface px-2 font-mono text-caption text-primary transition-colors duration-instant hover:border-border-strong focus:border-accent focus:outline-none"
          />
        </Field>

        <Field label="Duration" htmlFor="duration">
          <div className="flex items-center gap-3">
            <input
              id="duration"
              type="range"
              min={5}
              max={240}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="w-12 shrink-0 text-right font-mono text-caption tnum text-secondary">
              {minutes}m
            </span>
          </div>
        </Field>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <Button
          variant="danger"
          size="md"
          full
          disabled={!selectedId || running}
          onClick={() => selectedId && onRun(selectedId, failure, minutes, parameter)}
        >
          {running ? "Injecting…" : "Inject failure"}
        </Button>
        <p className="text-center text-caption text-quaternary">
          Safe simulation — no real data is touched
        </p>
      </div>
    </aside>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block pb-1.5 text-caption font-medium text-secondary"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
