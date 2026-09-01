"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";

/**
 * Shared application chrome: skip link, sidebar, main landmark, and the
 * command palette with its global ⌘K / Ctrl-K binding.
 *
 * Every authenticated surface renders inside this so navigation, landmarks and
 * the palette behave identically everywhere.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const open = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      // "/" is the conventional quick-search key, but never while typing.
      if (e.key === "/" && !isTyping(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-small focus:text-primary focus:shadow-overlay"
      >
        Skip to content
      </a>

      <Sidebar onOpenPalette={open} />

      <main id="main" className="flex min-w-0 flex-1">
        {children}
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    !!el?.isContentEditable
  );
}
