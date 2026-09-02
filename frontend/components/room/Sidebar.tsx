"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { usePulse } from "@/lib/store";
import { STATE, scoreBand } from "@/lib/visual";
import type { HealthState } from "@/lib/types";
import { Kbd } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { UserMenu } from "./UserMenu";

/**
 * Product sidebar.
 *
 * Navigation is precise and quiet: the active item gets a tinted surface, an
 * accent rail and a colour shift — no glowing pill. Counts are right-aligned so
 * the column scans, and each system rolls up its worst health as a single dot.
 */
const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/control-room", label: "Control Room", icon: "room" },
  { href: "/scenarios", label: "Scenarios", icon: "filter" },
  { href: "/chaos-lab", label: "Chaos Lab", icon: "chaos" },
  { href: "/incidents", label: "Incidents", icon: "incident" },
  { href: "/resilience", label: "Resilience", icon: "check" },
  { href: "/compare", label: "Compare", icon: "compare" },
];

/** Worst state wins — a system is only as healthy as its weakest asset. */
const RANK: Record<HealthState, number> = {
  HEALTHY: 0,
  RECOVERING: 1,
  STALE: 2,
  DEGRADED: 3,
  FAILED: 4,
};

export function Sidebar({
  onOpenPalette,
  onNavigate,
}: {
  onOpenPalette?: () => void;
  /** Set when the sidebar is rendered inside the mobile drawer. */
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const topology = usePulse((s) => s.topology);
  const overview = usePulse((s) => s.overview);
  const stateOf = usePulse((s) => s.stateOf);
  const systemFilter = usePulse((s) => s.systemFilter);
  const setSystemFilter = usePulse((s) => s.setSystemFilter);

  const systems = useMemo(() => {
    const m = new Map<string, { count: number; worst: HealthState }>();
    for (const a of topology?.assets ?? []) {
      const cur = m.get(a.system) ?? { count: 0, worst: "HEALTHY" as HealthState };
      const st = stateOf(a.id);
      m.set(a.system, {
        count: cur.count + 1,
        worst: RANK[st] > RANK[cur.worst] ? st : cur.worst,
      });
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [topology, stateOf]);

  const band = overview ? scoreBand(overview.resilience_score) : null;

  return (
    <nav
      aria-label="Primary"
      data-surface
      className="flex h-full w-[232px] shrink-0 flex-col border-r border-border bg-canvas"
    >
      {/* Workspace */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-sm bg-primary text-[11px] font-semibold text-canvas">
          P
        </span>
        <span className="min-w-0 flex-1 truncate text-body font-medium text-primary">
          {topology?.organization ?? "PULSE"}
        </span>
      </div>

      {/* Command affordance */}
      {onOpenPalette && (
        <div className="px-2 pt-2">
          <button
            onClick={onOpenPalette}
            className="group flex h-control w-full items-center gap-2 rounded border border-border bg-surface px-2.5 text-small text-tertiary transition-colors duration-instant hover:border-border-strong hover:text-secondary"
          >
            <Icon name="search" size={14} className="text-quaternary group-hover:text-tertiary" />
            <span className="flex-1 text-left">Search…</span>
            <Kbd>⌘K</Kbd>
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {/* Primary nav */}
        <ul className="px-2">
          {NAV.map((item) => {
            const active = path.startsWith(item.href);
            const badge =
              item.href === "/incidents" ? overview?.active_incidents : undefined;
            return (
              <li key={item.href} className="relative">
                {active && (
                  <span
                    className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent"
                    aria-hidden
                  />
                )}
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex h-control items-center gap-2.5 rounded px-2.5 text-small transition-colors duration-instant",
                    active
                      ? "bg-muted font-medium text-primary"
                      : "text-secondary hover:bg-subtle hover:text-primary",
                  ].join(" ")}
                >
                  <Icon
                    name={item.icon}
                    size={15}
                    className={active ? "text-accent" : "text-quaternary"}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {!!badge && (
                    <span className="rounded-xs bg-failed-bg px-1.5 text-micro tnum text-failed">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Systems */}
        <div className="px-2 pt-5">
          <div className="flex h-6 items-center justify-between px-2.5">
            <span className="text-micro uppercase text-quaternary">Systems</span>
            {systemFilter && (
              <button
                onClick={() => setSystemFilter(null)}
                className="text-caption text-accent transition-colors hover:text-accent-hover"
              >
                Clear
              </button>
            )}
          </div>
          <ul className="pt-0.5">
            {systems.map(([name, info]) => {
              const active = systemFilter === name;
              return (
                <li key={name}>
                  <button
                    onClick={() => {
                      setSystemFilter(active ? null : name);
                      onNavigate?.();
                    }}
                    aria-pressed={active}
                    className={[
                      "flex h-control w-full items-center gap-2.5 rounded px-2.5 text-small transition-colors duration-instant",
                      active
                        ? "bg-muted font-medium text-primary"
                        : "text-secondary hover:bg-subtle hover:text-primary",
                    ].join(" ")}
                  >
                    <span
                      className={`h-[6px] w-[6px] shrink-0 rounded-full ${STATE[info.worst].dot}`}
                      aria-hidden
                    />
                    <span className="flex-1 truncate text-left">{name}</span>
                    <span className="tnum text-caption text-quaternary">{info.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Resilience — the one number that summarises the workspace */}
      {overview && band && (
        <div className="shrink-0 border-t border-border px-3 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-tertiary">Resilience</span>
            <span className="text-caption text-quaternary">{band.label}</span>
          </div>
          <div className="flex items-baseline gap-1 pt-1">
            <span className={`text-title tnum ${band.text}`}>
              {overview.resilience_score}
            </span>
            <span className="text-caption text-quaternary">/ 100</span>
          </div>
          {/* A quiet proportional rule, not a chart */}
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${
                overview.resilience_score >= 80
                  ? "bg-healthy"
                  : overview.resilience_score >= 60
                    ? "bg-degraded"
                    : "bg-failed"
              }`}
              style={{ width: `${overview.resilience_score}%` }}
            />
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-border p-2">
        <UserMenu />
        <p className="px-2 pb-1 pt-1.5 text-caption text-quaternary">
          Demo workspace · simulated telemetry
        </p>
      </div>
    </nav>
  );
}
