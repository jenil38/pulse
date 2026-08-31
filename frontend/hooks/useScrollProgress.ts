"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Normalised scroll progress (0..1) over a tall container.
 *
 * Native scroll — never hijacked. We only *read* position and damp it, so the
 * page still responds exactly as the user expects (DESIGN.md §16).
 */
export function useScrollProgress(): { progress: number; ref: React.RefObject<HTMLDivElement | null> } {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      // Clear the scheduling guard FIRST: if we bail out below without
      // resetting it, no future scroll would ever schedule another frame.
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const total = el.scrollHeight - window.innerHeight;
      const p = total > 0 ? Math.min(Math.max(-el.getBoundingClientRect().top / total, 0), 1) : 0;
      setProgress(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { progress, ref };
}

/** Maps global progress to a 0..1 value within one scene's window. */
export function sceneProgress(p: number, start: number, end: number): number {
  if (p <= start) return 0;
  if (p >= end) return 1;
  return (p - start) / (end - start);
}

/**
 * Smooth 0->1->0 envelope, for text that fades in and back out.
 * `fadeIn = 0` means "already on screen" — used by the opening scene so the
 * headline is fully visible before the user has scrolled at all.
 */
export function envelope(t: number, fadeIn = 0.25, fadeOut = 0.75): number {
  if (fadeIn > 0 && t < fadeIn) return t / fadeIn;
  if (t > fadeOut) return Math.max(0, 1 - (t - fadeOut) / (1 - fadeOut));
  return 1;
}

export const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
