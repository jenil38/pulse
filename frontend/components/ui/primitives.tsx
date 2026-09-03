"use client";

import type { ReactNode } from "react";
import type { HealthState, ImpactSeverity } from "@/lib/types";
import { SEVERITY, STATE } from "@/lib/visual";

/**
 * Core primitives.
 *
 * Structure comes from `Section` (heading + rule + content) rather than from
 * wrapping everything in a bordered card. A card must justify itself; a section
 * never has to.
 */

/* ------------------------------------------------------------------ status */

/** Small, precise status indicator. Used everywhere state is shown inline. */
export function StatusDot({
  state,
  className = "",
}: {
  state: HealthState;
  className?: string;
}) {
  return (
    <span
      className={`inline-block h-[6px] w-[6px] shrink-0 rounded-full ${STATE[state].dot} ${className}`}
      aria-hidden
    />
  );
}

/** Dot + label. The default way to render health in lists and headers. */
export function Status({
  state,
  className = "",
}: {
  state: HealthState;
  className?: string;
}) {
  const v = STATE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <StatusDot state={state} />
      <span className={`text-small ${v.text}`}>{v.label}</span>
    </span>
  );
}

/** Tint chip — restrained, never a solid colour block. */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | HealthState | "outline";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-subtle border-border text-tertiary",
    outline: "bg-transparent border-border text-tertiary",
    accent: "bg-accent-subtle border-accent-border text-accent-text",
    HEALTHY: STATE.HEALTHY.chip,
    DEGRADED: STATE.DEGRADED.chip,
    FAILED: STATE.FAILED.chip,
    STALE: STATE.STALE.chip,
    RECOVERING: STATE.RECOVERING.chip,
  };
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-[1px] text-micro ${tones[tone] ?? tones.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: ImpactSeverity }) {
  const v = SEVERITY[severity];
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-[1px] text-micro ${v.chip}`}
    >
      {v.label}
    </span>
  );
}

/** Provenance marker. PULSE never implies it is monitoring a real system. */
export function SimulatedTag({ text = "Simulated" }: { text?: string }) {
  return (
    <span className="inline-flex items-center rounded-xs border border-border bg-subtle px-1.5 py-[1px] text-micro text-quaternary">
      {text}
    </span>
  );
}

/* ---------------------------------------------------------------- structure */

/**
 * A section: heading, optional actions, hairline, content.
 * This replaces the card as the default grouping mechanism.
 */
export function Section({
  title,
  actions,
  children,
  className = "",
  dense,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={className}>
      {title && (
        <header className="flex h-control items-center justify-between gap-3 px-4">
          <h2 className="text-micro uppercase text-quaternary">{title}</h2>
          {actions}
        </header>
      )}
      <div className={dense ? "" : "px-4 pb-4"}>{children}</div>
    </section>
  );
}

/** Panel title row — used at the top of sidebars and inspectors. */
export function PanelHeader({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <h2 className="truncate text-body font-medium text-primary">{children}</h2>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

/**
 * A label/value row — the properties-panel pattern.
 * Labels are quiet and fixed-width so values align into a scannable column.
 */
export function Property({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-h-[30px] items-baseline gap-3 py-1.5">
      <dt className="w-[92px] shrink-0 text-caption text-tertiary">{label}</dt>
      <dd
        className={`min-w-0 flex-1 text-small text-primary ${mono ? "font-mono tnum" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}

/** A number with a caption, for toolbars and summary rows. */
export function Metric({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-caption text-tertiary">{label}</div>
      <div className={`pt-0.5 text-title tnum ${tone ?? "text-primary"}`}>{value}</div>
      {sub && <div className="truncate pt-0.5 text-caption text-quaternary">{sub}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 py-12 text-center">
      <p className="text-body text-secondary">{title}</p>
      {hint && <p className="max-w-[28ch] text-small text-quaternary">{hint}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/** Horizontal rule that matches the token system. */
export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-border ${className}`} aria-hidden />;
}

/* --------------------------------------------------------------------- tabs */

/**
 * Tabs with proper keyboard semantics: roving tabindex, arrow-key navigation,
 * and Home/End — the pattern assistive tech expects from a tablist.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label = "Views",
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].value);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex h-9 items-stretch gap-4 border-b border-border px-4"
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={[
              "relative -mb-px inline-flex items-center gap-1.5 border-b text-small transition-colors duration-fast ease-standard",
              active
                ? "border-primary font-medium text-primary"
                : "border-transparent text-tertiary hover:text-secondary",
            ].join(" ")}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="text-caption tnum text-quaternary">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- table */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-small">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  width,
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  width?: string;
  className?: string;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={`sticky top-0 z-10 border-b border-border bg-canvas/95 px-3.5 py-2.5 text-micro font-medium uppercase text-quaternary backdrop-blur-sm ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono,
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-border-subtle px-3.5 py-2.5 align-middle ${
        align === "right" ? "text-right" : "text-left"
      } ${mono ? "font-mono tnum text-caption" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * A table row that can be activated.
 *
 * When `onClick` is supplied the row becomes a real interactive control:
 * keyboard focusable, activated by Enter or Space, with a visible focus ring.
 * A click-only row is invisible to keyboard users, which is the bug this fixes.
 */
export function Tr({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <tr
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-selected={interactive ? selected : undefined}
      className={[
        "transition-colors duration-instant",
        interactive
          ? "cursor-pointer focus:outline-none focus-visible:bg-accent-subtle focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          : "",
        selected ? "bg-accent-subtle" : interactive ? "hover:bg-subtle" : "",
      ].join(" ")}
    >
      {children}
    </tr>
  );
}
