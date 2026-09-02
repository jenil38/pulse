"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Normalised scroll progress (0..1) across a container.
 *
 * Native scroll only — we read position and damp it, never hijack it. Progress
 * is written to a ref (for the render loop, which must not trigger React
 * re-renders) and mirrored into state (for the caption layer, which must).
 */
export function useScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;

    const compute = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.min(Math.max(-rect.top / total, 0), 1) : 0;
      progressRef.current = p;
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

  return { ref, progress, progressRef };
}
