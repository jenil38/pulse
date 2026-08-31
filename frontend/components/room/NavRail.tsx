"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Slim left rail linking the product surfaces. Icon-free, typographic. */
const LINKS = [
  { href: "/control-room", label: "Room", full: "Control Room" },
  { href: "/chaos-lab", label: "Chaos", full: "Chaos Lab" },
  { href: "/incidents", label: "Incid", full: "Incidents" },
  { href: "/compare", label: "Comp", full: "Compare" },
];

export function NavRail() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-void py-3"
    >
      {LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            title={l.full}
            aria-current={active ? "page" : undefined}
            className={`w-full py-3 text-center font-mono text-[8px] uppercase tracking-[0.12em] transition-colors ${
              active
                ? "border-l-2 border-l-healthy text-healthy"
                : "border-l-2 border-l-transparent text-ink-faint hover:text-ink-dim"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
