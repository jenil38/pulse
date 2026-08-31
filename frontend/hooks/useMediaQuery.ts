"use client";

import { useEffect, useState } from "react";

/** SSR-safe media query. Defaults to `initial` until the client has measured. */
export function useMediaQuery(query: string, initial = true): boolean {
  const [matches, setMatches] = useState(initial);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True on tablet-and-up, where the full 3D experience is appropriate. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
