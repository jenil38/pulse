"use client";

import type { ReactNode } from "react";
import type { HealthState, ImpactSeverity } from "@/lib/types";
import { SEVERITY, STATE } from "@/lib/visual";

/** Small status dot + label. The core state affordance across the product. */
export function StateDot({
  state,
  label = false,
  size = "sm",
}: {
  state: HealthState;
  label?: boolean;
  size?: "sm" | "xs";
}) {
  const v = STATE[state];
  const d = size === "xs" ? "h-1 w-1" : "h-1.5 w-1.5";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block ${d} rounded-full shrink-0`}
        style={{ background: v.hex }}
        aria-hidden
      />
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: v.hex }}>
          {v.label}
        </span>
      )}
    </span>
  );
}

export function SeverityTag({ severity }: { severity: ImpactSeverity }) {
  const v = SEVERITY[severity];
  return (
    <span
      className="border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]"
      style={{ color: v.hex, borderColor: `${v.hex}44` }}
    >
      {v.label}
    </span>
  );
}

/** Section heading — hairline, letter-spaced, editorial. */
export function PanelHeading({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Metric({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div
        className="pt-1 font-mono text-lg tabular-nums leading-none"
        style={{ color: accent ?? "#E6EAEC" }}
      >
        {value}
      </div>
      {sub && <div className="pt-1 font-mono text-[9px] text-ink-mute">{sub}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  full,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
}) {
  const styles: Record<string, string> = {
    default:
      "border-line-strong text-ink-dim hover:text-ink hover:border-ink-faint bg-raised",
    primary:
      "border-healthy/40 text-healthy hover:bg-healthy/10 hover:border-healthy/70 bg-healthy/5",
    danger:
      "border-failed/40 text-failed hover:bg-failed/10 hover:border-failed/70 bg-failed/5",
    ghost: "border-transparent text-ink-mute hover:text-ink",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-200 ease-pulse disabled:cursor-not-allowed disabled:opacity-35 ${styles[variant]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

/** Simulation/demo provenance label — we never imply real monitoring. */
export function SimulatedTag({ text = "Simulated" }: { text?: string }) {
  return (
    <span className="border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
      {text}
    </span>
  );
}

/** Thin horizontal proportion bar (used for health rollups). */
export function StateBar({ counts }: { counts: Record<string, number> }) {
  const order: HealthState[] = ["HEALTHY", "RECOVERING", "STALE", "DEGRADED", "FAILED"];
  const total = order.reduce((s, k) => s + (counts[k] ?? 0), 0) || 1;
  return (
    <div className="flex h-0.5 w-full overflow-hidden">
      {order.map((k) => {
        const n = counts[k] ?? 0;
        if (!n) return null;
        return (
          <span
            key={k}
            style={{ width: `${(n / total) * 100}%`, background: STATE[k].hex }}
            className="block"
          />
        );
      })}
    </div>
  );
}
