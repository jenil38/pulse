"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { MobileHeader } from "./MobileHeader";
import { Spinner } from "@/components/ui/AsyncState";

/**
 * Shared application chrome for EVERY authenticated route.
 *
 * Responsibilities:
 *   - route guard (redirect to /login, preserving the intended destination)
 *   - responsive navigation: persistent sidebar on desktop, a top bar plus an
 *     accessible drawer below it
 *   - skip link + <main> landmark
 *   - the global ⌘K / Ctrl-K / "/" command palette binding
 *
 * Every surface renders inside this, so navigation, auth and the palette behave
 * identically everywhere — which was the gap that left /incidents and /compare
 * with a desktop-only sidebar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();

  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const hydrate = useAuth((s) => s.hydrate);

  useEffect(() => hydrate(), [hydrate]);

  // Route guard. `next` preserves where they were heading.
  useEffect(() => {
    if (ready && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, user, router, pathname]);

  // Navigating always dismisses the drawer.
  useEffect(() => setNavOpen(false), [pathname]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "/" && !isTyping(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Don't flash the app before we know whether there's a session.
  if (!ready || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <Spinner />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-small focus:text-primary focus:shadow-overlay"
      >
        Skip to content
      </a>

      {/* Desktop: persistent sidebar */}
      {isDesktop && <Sidebar onOpenPalette={openPalette} />}

      {/* Below desktop: drawer, rendered over the content */}
      {!isDesktop && navOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-primary/25 animate-fade-in"
            onClick={() => setNavOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-50 shadow-overlay"
          >
            <Sidebar onOpenPalette={openPalette} onNavigate={() => setNavOpen(false)} />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {!isDesktop && (
          <MobileHeader
            onOpenNav={() => setNavOpen(true)}
            onOpenPalette={openPalette}
          />
        )}
        <main id="main" className="relative flex min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable
  );
}
