"use client";

import { usePathname } from "next/navigation";
import { usePulse } from "@/lib/store";
import { scoreBand } from "@/lib/visual";
import { Icon } from "@/components/ui/Icon";
import { UserMenu } from "./UserMenu";

/**
 * Compact top navigation for tablet and mobile.
 *
 * Replaces the sidebar below the desktop breakpoint: a menu button that opens
 * the navigation drawer, the current surface's name, search, and the user menu.
 * The resilience score rides along because it is the one number worth seeing at
 * all times.
 */
const TITLES: Record<string, string> = {
  "/control-room": "Control Room",
  "/chaos-lab": "Chaos Lab",
  "/incidents": "Incidents",
  "/compare": "Compare",
  "/scenarios": "Scenarios",
  "/resilience": "Resilience",
};

export function MobileHeader({
  onOpenNav,
  onOpenPalette,
}: {
  onOpenNav: () => void;
  onOpenPalette: () => void;
}) {
  const pathname = usePathname();
  const overview = usePulse((s) => s.overview);

  const title =
    Object.entries(TITLES).find(([href]) => pathname.startsWith(href))?.[1] ?? "PULSE";
  const band = overview ? scoreBand(overview.resilience_score) : null;

  return (
    <header
      data-surface
      className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-canvas px-3"
    >
      <button
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="grid h-8 w-8 place-items-center rounded text-secondary transition-colors duration-instant hover:bg-subtle hover:text-primary"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <h1 className="min-w-0 flex-1 truncate text-body font-medium text-primary">{title}</h1>

      {overview && band && (
        <span className="flex items-baseline gap-1">
          <span className={`text-small font-medium tnum ${band.text}`}>
            {overview.resilience_score}
          </span>
          <span className="text-caption text-quaternary">/100</span>
        </span>
      )}

      <button
        onClick={onOpenPalette}
        aria-label="Search and commands"
        className="grid h-8 w-8 place-items-center rounded text-secondary transition-colors duration-instant hover:bg-subtle hover:text-primary"
      >
        <Icon name="search" size={16} />
      </button>

      <UserMenu compact />
    </header>
  );
}
