"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { usePulse } from "@/lib/store";
import { STATE } from "@/lib/visual";
import type { HealthState } from "@/lib/types";
import { Kbd } from "@/components/ui/Button";

/**
 * Product sidebar.
 *
 * Navigation is precise and quiet: active state is a subtle tint plus a weight
 * change, never a glowing pill. Counts sit right-aligned so the column is
 * scannable, and systems roll up their worst health as a single dot.
 */

const NAV = [
  { href: "/control-room", label: "Control Room" },
  { href: "/chaos-lab", label: "Chaos Lab" },
  { href: "/incidents", label: "Incidents" },
  { href: "/compare", label: "Compare" },
];

/** Worst state wins — a system is only as healthy as its weakest asset. */
const RANK: Record<HealthState, number> = {
  HEALTHY: 0,
  RECOVERING: 1,
  STALE: 2,
  DEGRADED: 3,
  FAILED: 4,
};

export function Sidebar({ onOpenPalette }: { onOpenPalette?: () => void }) {
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

  return (
    <nav
      aria-label="Primary"
      data-surface
      className="flex h-full w-[232px] shrink-0 flex-col border-r border-border bg-canvas"
    >
      {/* Workspace */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="grid h-5 w-5 place-items-center rounded-xs bg-primary text-[10px] font-semibold text-canvas">
          P
        </span>
        <span className="truncate text-body font-medium text-primary">
          {topology?.organization ?? "PULSE"}
        </span>
      </div>

      {/* Search / command affordance */}
      {onOpenPalette && (
        <div className="px-2 pt-2">
          <button
            onClick={onOpenPalette}
            className="flex h-control w-full items-center justify-between rounded border border-border bg-surface px-2.5 text-small text-tertiary transition-colors duration-instant hover:border-border-strong hover:text-secondary"
          >
            <span>Search…</span>
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
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex h-control items-center justify-between gap-2 rounded px-2.5 text-small transition-colors duration-instant",
                    active
                      ? "bg-muted font-medium text-primary"
                      : "text-secondary hover:bg-subtle hover:text-primary",
                  ].join(" ")}
                >
                  <span className="truncate">{item.label}</span>
                  {!!badge && (
                    <span className="tnum text-caption text-tertiary">{badge}</span>
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
                className="text-caption text-tertiary transition-colors hover:text-primary"
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
                    onClick={() => setSystemFilter(active ? null : name)}
                    aria-pressed={active}
                    className={[
                      "flex h-control w-full items-center gap-2 rounded px-2.5 text-small transition-colors duration-instant",
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

      {/* Provenance — stated once, permanently, and quietly. */}
      <div className="shrink-0 border-t border-border px-3 py-2.5">
        <p className="text-caption text-quaternary">
          Demo workspace · simulated telemetry
        </p>
      </div>
    </nav>
  );
}
