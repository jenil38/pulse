"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reports whether an element is in the viewport.
 * Used to pause WebGL rendering when the scene scrolls offscreen (DESIGN.md §33).
 */
export function useOnScreen<T extends HTMLElement>(rootMargin = "120px") {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return { ref, visible };
}
