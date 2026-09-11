"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePulse } from "@/lib/store";
import type { Asset, FailureType, FailureTypeInfo } from "@/lib/types";
import { CRITICALITY_LABEL, NODE_LABEL, STAGE_ORDER } from "@/lib/visual";
import { Icon, NodeGlyph } from "@/components/ui/Icon";
import { StatusDot } from "@/components/ui/primitives";

/**
 * The composer: where a failure is described before it is run.
 *
 * It reads top to bottom as one decision: what to break, how it breaks, with
 * what change, for how long. The drama belongs to the stage behind it, so
 * nothing here is decorated; the only coloured control in the panel is the one
 * that commits, and it has to be held down.
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
  STARVE: "No fresh data arrives, so downstream goes stale.",
  BREAK: "Structure fails: transformations break, tables degrade.",
  CORRUPT: "Wrong values flow through, and downstream degrades.",
};

/** Propagation modes in the order the engine reasons about them. */
const MODE_ORDER = ["STARVE", "BREAK", "CORRUPT"] as const;

const MODE_LABEL: Record<string, string> = {
  STARVE: "Starves downstream",
  BREAK: "Breaks structure",
  CORRUPT: "Corrupts values",
};

export interface ComposerValue {
  target: string | null;
  failure: FailureType;
  minutes: number;
  parameter: string;
}

export function FailureComposer({
  value,
  onChange,
  types,
  onInject,
  busy,
  collapsed,
  onExpand,
}: {
  value: ComposerValue;
  onChange: (next: Partial<ComposerValue>) => void;
  types: FailureTypeInfo[];
  onInject: () => void;
  busy: boolean;
  /** Once a run is underway the composer folds down to its heading. */
  collapsed: boolean;
  onExpand: () => void;
}) {
  const topology = usePulse((s) => s.topology);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [touchedParam, setTouchedParam] = useState(false);

  const targets = useMemo(() => {
    const list = [...(topology?.assets ?? [])];
    list.sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.type) - STAGE_ORDER.indexOf(b.type) ||
        a.name.localeCompare(b.name)
    );
    return list;
  }, [topology]);

  const target = targets.find((t) => t.id === value.target) ?? null;
  const mode = types.find((f) => f.value === value.failure)?.mode;

  // The parameter follows the failure type until the user writes their own.
  useEffect(() => {
    if (!touchedParam) onChange({ parameter: PARAM_PRESETS[value.failure] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.failure, touchedParam]);

  const byMode = useMemo(() => {
    const groups = new Map<string, FailureTypeInfo[]>();
    for (const m of MODE_ORDER) groups.set(m, []);
    for (const f of types) groups.get(f.mode)?.push(f);
    return [...groups.entries()].filter(([, list]) => list.length > 0);
  }, [types]);

  if (collapsed) {
    return (
      <button
        onClick={onExpand}
        className="glass flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-colors duration-fast hover:border-border-strong"
      >
        <Icon name="chaos" size={14} className="shrink-0 text-failed" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-medium text-primary">
            {target?.name ?? "No target"}
          </span>
          <span className="block truncate text-caption text-tertiary">
            {types.find((f) => f.value === value.failure)?.label} · {value.minutes}m
          </span>
        </span>
        <Icon name="chevronDown" size={13} className="shrink-0 text-quaternary" />
      </button>
    );
  }

  return (
    <section
      aria-label="Configure failure"
      className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl"
    >
      <header className="flex shrink-0 items-center px-3.5 pb-2 pt-3">
        <h2 className="text-micro uppercase text-quaternary">Configure failure</h2>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 pb-3.5">
        {/* ---- target ---------------------------------------------- */}
        <Field label="Target">
          {target && !picking ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface/60 px-2.5 py-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-border bg-subtle text-tertiary">
                <NodeGlyph type={target.type} size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-medium text-primary">
                  {target.name}
                </span>
                <span className="block truncate text-caption text-tertiary">
                  {NODE_LABEL[target.type]} · {CRITICALITY_LABEL[target.criticality]}
                </span>
              </span>
              <button
                onClick={() => {
                  setPicking(true);
                  setQuery("");
                }}
                className="shrink-0 rounded px-1.5 py-1 text-caption text-tertiary transition-colors duration-instant hover:bg-subtle hover:text-primary"
              >
                Change
              </button>
            </div>
          ) : (
            <TargetPicker
              targets={targets}
              query={query}
              onQuery={setQuery}
              onPick={(id) => {
                onChange({ target: id });
                setPicking(false);
              }}
              onCancel={target ? () => setPicking(false) : undefined}
            />
          )}
        </Field>

        {/* ---- failure type ----------------------------------------- */}
        <Field label="Failure">
          <div className="space-y-2.5">
            {byMode.map(([m, list]) => (
              <div key={m}>
                <p className="px-0.5 pb-1 text-caption text-quaternary">
                  {MODE_LABEL[m]}
                </p>
                <div className="space-y-px">
                  {list.map((f) => {
                    const active = f.value === value.failure;
                    return (
                      <button
                        key={f.value}
                        onClick={() => onChange({ failure: f.value })}
                        aria-pressed={active}
                        className={[
                          "flex h-control w-full items-center gap-2 rounded px-2.5 text-left text-small transition-colors duration-instant",
                          active
                            ? "bg-muted font-medium text-primary"
                            : "text-secondary hover:bg-subtle hover:text-primary",
                        ].join(" ")}
                      >
                        <span
                          className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                            active ? "bg-failed" : "bg-border-strong"
                          }`}
                          aria-hidden
                        />
                        <span className="truncate">{f.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {mode && (
            <p className="pt-2 text-caption leading-relaxed text-tertiary">
              {MODE_NOTE[mode]}
            </p>
          )}
        </Field>

        {/* ---- parameter -------------------------------------------- */}
        <Field label="Parameter" htmlFor="chaos-param">
          <input
            id="chaos-param"
            value={value.parameter}
            onChange={(e) => {
              onChange({ parameter: e.target.value });
              setTouchedParam(true);
            }}
            spellCheck={false}
            className="h-control w-full rounded border border-border bg-surface/60 px-2 font-mono text-caption text-primary transition-colors duration-instant hover:border-border-strong focus:border-accent focus:outline-none"
          />
          <p className="pt-1.5 text-caption leading-relaxed text-quaternary">
            Recorded with the run. The blast radius comes from the failure type,
            not from this text.
          </p>
        </Field>

        {/* ---- duration --------------------------------------------- */}
        <Field label="Duration" htmlFor="chaos-duration">
          <div className="flex items-center gap-3">
            <input
              id="chaos-duration"
              type="range"
              min={5}
              max={240}
              step={5}
              value={value.minutes}
              onChange={(e) => onChange({ minutes: Number(e.target.value) })}
              className="flex-1 accent-accent"
            />
            <span className="w-11 shrink-0 text-right text-small tnum text-secondary">
              {value.minutes}m
            </span>
          </div>
          <p className="pt-1.5 text-caption leading-relaxed text-quaternary">
            How long the failure runs before recovery begins.
          </p>
        </Field>
      </div>

      <div className="shrink-0 border-t border-border-subtle p-2.5">
        <ArmButton
          disabled={!value.target || busy}
          busy={busy}
          onCommit={onInject}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ target */

function TargetPicker({
  targets,
  query,
  onQuery,
  onPick,
  onCancel,
}: {
  targets: Asset[];
  query: string;
  onQuery: (q: string) => void;
  onPick: (id: string) => void;
  onCancel?: () => void;
}) {
  const stateOf = usePulse((s) => s.stateOf);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.system.toLowerCase().includes(q)
    );
  }, [targets, query]);

  useEffect(() => setActive(0), [query]);

  // Keep the keyboard cursor in view, a list you can drive but not see is
  // worse than one you cannot drive.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      onPick(results[active].id);
    } else if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface/60">
      <div className="flex items-center gap-2 border-b border-border-subtle px-2.5">
        <Icon name="search" size={13} className="shrink-0 text-quaternary" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search components…"
          aria-label="Search for a target component"
          autoFocus
          className="h-control w-full bg-transparent text-small text-primary outline-none"
        />
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Keep the current target"
            className="shrink-0 rounded p-1 text-quaternary transition-colors hover:text-primary"
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div ref={listRef} className="max-h-[208px] overflow-y-auto py-1">
        {results.length === 0 ? (
          <p className="px-2.5 py-3 text-caption text-quaternary">
            No component matches “{query}”.
          </p>
        ) : (
          results.map((t, i) => (
            <button
              key={t.id}
              data-index={i}
              onClick={() => onPick(t.id)}
              onMouseEnter={() => setActive(i)}
              className={[
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-instant",
                i === active ? "bg-muted" : "",
              ].join(" ")}
            >
              <StatusDot state={stateOf(t.id)} />
              <span className="min-w-0 flex-1 truncate text-small text-primary">
                {t.name}
              </span>
              <span className="shrink-0 text-caption text-quaternary">
                {t.system}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- arm */

/** How long the commit has to be held, in milliseconds. */
const ARM_MS = 450;

/**
 * Hold to inject.
 *
 * The only irreversible-feeling act in the product deserves a control that
 * cannot be triggered by a stray click, and a hold is a better guard than a
 * confirmation dialog: it keeps the decision in one gesture, shows its own
 * progress, and is abandonable right up to the last millisecond.
 *
 * KEYBOARD ACTIVATION DOES NOT HOLD, deliberately. The guard exists to stop a
 * pointer landing somewhere it did not mean to; a person who has tabbed to a
 * button labelled "inject the failure" and pressed Enter has already been
 * deliberate twice over. Requiring them to hold the key would gate the
 * product's central action behind a gesture some assistive technology cannot
 * produce at all, which trades a real barrier for an imaginary safeguard.
 */
function ArmButton({
  disabled,
  busy,
  onCommit,
}: {
  disabled: boolean;
  busy: boolean;
  onCommit: () => void;
}) {
  const [arm, setArm] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef(0);
  const held = useRef(false);

  const cancel = useCallback(() => {
    held.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setArm(0);
  }, []);

  const begin = useCallback(() => {
    if (disabled || held.current) return;
    held.current = true;
    start.current = performance.now();
    const tick = (now: number) => {
      if (!held.current) return;
      const p = Math.min((now - start.current) / ARM_MS, 1);
      setArm(p);
      if (p >= 1) {
        held.current = false;
        raf.current = null;
        setArm(0);
        onCommit();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [disabled, onCommit]);

  useEffect(() => cancel, [cancel]);

  const label = busy ? "Injecting…" : arm > 0 ? "Hold…" : "Hold to inject";

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        aria-label="Hold to inject the failure"
        onPointerDown={begin}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
            e.preventDefault();
            onCommit();
          }
        }}
        style={{ "--arm": arm } as CSSProperties}
        className={[
          "arm-track flex h-control-lg w-full select-none items-center justify-center gap-2 rounded-lg border text-body font-medium",
          "border-failed-border bg-failed-bg text-failed",
          "transition-colors duration-fast ease-standard",
          "hover:border-failed disabled:pointer-events-none disabled:opacity-40",
        ].join(" ")}
      >
        <Icon name="chaos" size={14} />
        {label}
      </button>
      <p className="pt-1.5 text-center text-caption text-quaternary">
        No real data is touched.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- field */

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
