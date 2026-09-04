"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";

/**
 * The auth room.
 *
 * Signing in happens with the house lights down. The room is near black, and
 * while `lights` is "down" the only bright thing in it is the form itself —
 * every field is its own light source (see `.light-field` in globals.css) and
 * the room's own lamps sit at a fraction of their brightness.
 *
 * Raising the lights is a single prop. It sets `data-lights="up"` on <html>,
 * which lifts the room's background, and blooms the lamps below — the physical
 * change the cinematic welcome rides on.
 *
 * The scope is set on <html> rather than on a wrapper because the body's own
 * background has to change too; a dark panel on a light page would read as a
 * modal, not as a room.
 */
export function AuthRoom({
  children,
  lights = "down",
  footer,
}: {
  children: ReactNode;
  lights?: "down" | "up";
  footer?: ReactNode;
}) {
  useEffect(() => {
    const html = document.documentElement;
    const previousMode = html.getAttribute("data-mode");
    html.setAttribute("data-scene", "auth");
    return () => {
      html.removeAttribute("data-scene");
      html.removeAttribute("data-lights");
      if (previousMode) html.setAttribute("data-mode", previousMode);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-lights", lights);
  }, [lights]);

  const lit = lights === "up";

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      <RoomLights lit={lit} />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex h-16 shrink-0 items-center px-6 md:px-10">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 rounded-lg px-1 py-1 transition-opacity duration-base hover:opacity-80"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md border border-border-strong bg-surface text-[11px] font-semibold text-primary">
              P
            </span>
            <span className="text-body font-medium text-primary">PULSE</span>
            <span className="hidden text-caption text-quaternary sm:inline">
              Data Resilience Digital Twin
            </span>
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-8">
          {children}
        </main>

        {footer && (
          <footer className="shrink-0 px-6 pb-8 pt-2 text-center md:px-10">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * The lamps.
 *
 * While the lights are down every lamp is off — not dimmed. A dimmed accent
 * lamp still tints the whole frame blue, and the room is supposed to read as
 * an unlit room, with the form's own fields as the only light in it.
 *
 * Raising the lights is therefore a true zero-to-one: three pools bloom in
 * (a key behind the form, a cool rim from the lower left, a wide neutral
 * fill), the vignette relaxes, and the floor grid becomes legible. Opacity is
 * driven from React rather than a CSS variable so the ramp actually
 * transitions in every browser.
 */
function RoomLights({ lit }: { lit: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Key light — directly behind the form */}
      <div
        className="room-light left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2"
        style={{
          backgroundColor: "rgb(var(--accent) / 0.5)",
          opacity: lit ? 0.5 : 0,
        }}
      />
      {/* Rim light — lower left, cooler and tighter */}
      <div
        className="room-light bottom-[-14%] left-[-8%] h-[440px] w-[560px]"
        style={{
          backgroundColor: "rgb(var(--recovering) / 0.42)",
          opacity: lit ? 0.42 : 0,
        }}
      />
      {/* Fill — wide and neutral */}
      <div
        className="room-light right-[-12%] top-[24%] h-[520px] w-[620px]"
        style={{
          backgroundColor: "rgb(var(--text-secondary) / 0.28)",
          opacity: lit ? 0.34 : 0,
        }}
      />

      {/* Vignette — holds the corners down so the frame reads as a dark room */}
      <div
        className="absolute inset-0 transition-opacity duration-room ease-standard"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 50% 22%, transparent 8%, rgb(var(--canvas) / 0.62) 58%, rgb(var(--canvas)) 100%)",
          opacity: lit ? 0.72 : 1,
        }}
      />

      {/* A faint floor grid — only once there is light to see it by */}
      <div
        className="absolute inset-x-0 bottom-0 h-[46%] transition-opacity duration-room ease-standard"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.5) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "linear-gradient(to top, rgb(0 0 0 / 0.5), transparent 78%)",
          WebkitMaskImage: "linear-gradient(to top, rgb(0 0 0 / 0.5), transparent 78%)",
          opacity: lit ? 0.75 : 0,
        }}
      />
    </div>
  );
}
