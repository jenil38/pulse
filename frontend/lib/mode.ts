/**
 * PULSE environment mode.
 *
 * `normal` — the bright, precise professional workspace (the default).
 * `chaos`  — the darkened simulation environment.
 *
 * This is NOT a user theme preference. It is a product state: the environment
 * shifts only while a failure simulation is being run or replayed, and the
 * contrast is what gives those moments their weight. Because every token is a
 * CSS variable, switching is one attribute write on <html> — no React re-render
 * of the tree, and the transition is handled entirely in CSS.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

export type Mode = "normal" | "chaos";

const ATTR = "data-mode";

export function getMode(): Mode {
  if (typeof document === "undefined") return "normal";
  return (document.documentElement.getAttribute(ATTR) as Mode) ?? "normal";
}

export function setMode(mode: Mode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(ATTR, mode);
  // Let listeners (e.g. the WebGL scene, which reads colours imperatively)
  // react without prop-drilling the mode through the whole tree.
  window.dispatchEvent(new CustomEvent("pulse:mode", { detail: mode }));
}

/** Reactive access to the current mode. */
export function useMode(): [Mode, (m: Mode) => void] {
  const [mode, setLocal] = useState<Mode>("normal");

  useEffect(() => {
    setLocal(getMode());
    const onChange = (e: Event) => setLocal((e as CustomEvent).detail as Mode);
    window.addEventListener("pulse:mode", onChange);
    return () => window.removeEventListener("pulse:mode", onChange);
  }, []);

  const change = useCallback((m: Mode) => setMode(m), []);
  return [mode, change];
}

/**
 * Drives chaos mode from a condition (e.g. "a simulation is active"), and
 * always restores `normal` on unmount so a surface can never strand the app
 * in the dark environment.
 */
export function useChaosMode(active: boolean) {
  useEffect(() => {
    setMode(active ? "chaos" : "normal");
    return () => setMode("normal");
  }, [active]);
}

/** Reads a resolved design token — used by WebGL, which can't use classes. */
export function token(name: string): string {
  // Single documented fallback: only reachable during SSR, where no WebGL
  // scene is mounted anyway.
  if (typeof document === "undefined") return "#808080";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  if (!raw) return "#808080";
  const [r, g, b] = raw.split(/\s+/).map(Number);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
