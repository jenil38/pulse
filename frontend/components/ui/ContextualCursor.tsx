"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Contextual cursor (DESIGN.md §28). Desktop pointer devices only.
 *
 * Restrained: a small ring plus a short verb that names what the current
 * surface will do. Never a gaming reticle.
 *
 * Elements opt in with `data-cursor="INSPECT"` etc.
 */
export type CursorMode =
  | "EXPLORE"
  | "INSPECT"
  | "SIMULATE"
  | "TRACE"
  | "COMPARE"
  | "DRAG"
  | "REPLAY";

export function ContextualCursor() {
  const [mode, setMode] = useState<CursorMode | null>(null);
  const [visible, setVisible] = useState(false);
  const dot = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const shown = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    // Only for devices with a real pointer, and never under reduced motion.
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    const onMove = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      setVisible(true);
      const el = (e.target as HTMLElement)?.closest?.("[data-cursor]");
      setMode((el?.getAttribute("data-cursor") as CursorMode) ?? null);
    };
    const onLeave = () => setVisible(false);

    const loop = () => {
      // Damped follow so the cursor has weight.
      shown.current.x += (pos.current.x - shown.current.x) * 0.28;
      shown.current.y += (pos.current.y - shown.current.y) * 0.28;
      if (dot.current) {
        dot.current.style.transform = `translate3d(${shown.current.x}px, ${shown.current.y}px, 0)`;
      }
      raf.current = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    raf.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={dot}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[70] hidden md:block"
      style={{ willChange: "transform" }}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        <div
          className={`rounded-full border transition-all duration-300 ease-pulse ${
            mode ? "h-7 w-7 border-healthy/60" : "h-2.5 w-2.5 border-ink-mute/50"
          }`}
        />
        {mode && (
          <span className="absolute left-9 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.18em] text-healthy">
            {mode}
          </span>
        )}
      </div>
    </div>
  );
}
