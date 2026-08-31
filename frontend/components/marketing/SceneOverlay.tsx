"use client";

import Link from "next/link";
import { SCENES } from "./scenes";
import { envelope, sceneProgress } from "@/hooks/useScrollProgress";

/**
 * Typographic layer over the cinematic scene.
 * Editorial hierarchy: hairline eyebrow, large statement, quiet supporting line.
 * Text fades within its own scroll window — the 3D never carries the message alone.
 */
export function SceneOverlay({ progress }: { progress: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {SCENES.map((s) => {
        const t = sceneProgress(progress, s.start, s.end);
        const inWindow = progress >= s.start - 0.02 && progress <= s.end + 0.02;
        // The opening scene is already on screen before any scrolling happens.
        const fadeIn = s.start === 0 ? 0 : 0.22;
        const opacity = inWindow ? envelope(t, fadeIn, 0.72) : 0;
        if (opacity <= 0.001) return null;

        const align =
          s.align === "center"
            ? "items-center text-center"
            : s.align === "left"
              ? "items-start text-left"
              : "items-end text-right";

        return (
          <div
            key={s.id}
            className={`absolute inset-0 flex flex-col justify-center px-8 md:px-16 lg:px-24 ${align}`}
            style={{
              opacity,
              // Slight vertical drift — weighted, never bouncy.
              transform: `translateY(${(1 - opacity) * 14}px)`,
            }}
          >
            <div className="max-w-2xl">
              {s.eyebrow && (
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
                  {s.eyebrow}
                </p>
              )}

              {s.title && (
                <h1 className="pt-6 font-mono text-6xl tracking-[0.3em] text-ink sm:text-7xl md:text-8xl">
                  {s.title}
                </h1>
              )}

              {s.statement && (
                <h2 className="max-w-xl pt-5 text-2xl font-light leading-[1.25] text-ink sm:text-3xl md:text-4xl">
                  {s.statement}
                </h2>
              )}

              {s.body && (
                <p className="max-w-md pt-4 text-[12px] leading-relaxed text-ink-mute md:text-[13px]">
                  {s.body}
                </p>
              )}

              {/* Scene 1 CTA */}
              {s.id === 1 && (
                <div className="pointer-events-auto flex flex-col items-center pt-10">
                  <Link
                    href="/control-room"
                    className="border border-healthy/40 bg-healthy/5 px-7 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-healthy transition-colors duration-300 ease-pulse hover:bg-healthy/10"
                  >
                    Enter system
                  </Link>
                  <p className="pt-8 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
                    Scroll to travel the system ↓
                  </p>
                </div>
              )}

              {/* Final CTA */}
              {s.id === 9 && (
                <div className="pointer-events-auto flex flex-col items-center pt-10">
                  <Link
                    href="/control-room"
                    className="border border-healthy/40 bg-healthy/5 px-7 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-healthy transition-colors duration-300 ease-pulse hover:bg-healthy/10"
                  >
                    Open control room
                  </Link>
                  <p className="pt-6 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
                    Demo data · Nova Commerce · simulated telemetry
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Fixed corner metadata — the editorial frame around the film. */
export function SceneChrome({ progress }: { progress: number }) {
  const active = SCENES.find((s) => progress >= s.start && progress < s.end) ?? SCENES[0];
  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5">
        <span className="font-mono text-[11px] tracking-[0.3em] text-ink">PULSE</span>
        <Link
          href="/control-room"
          className="pointer-events-auto font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute transition-colors hover:text-ink"
        >
          Enter system
        </Link>
      </header>

      <div className="pointer-events-none fixed bottom-5 left-6 z-30">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
          {String(active.id).padStart(2, "0")} / 09
        </span>
      </div>

      {/* Progress hairline */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-px bg-line/60">
        <div
          className="h-px bg-healthy/60"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </>
  );
}
