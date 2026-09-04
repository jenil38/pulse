"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * The welcome.
 *
 * Plays once, immediately after a successful sign-in, while the room's lights
 * come up behind it. It exists to mark a threshold: the visitor stops being
 * anonymous and the product opens. That is the one moment in a tool where a
 * few seconds of theatre is earned — so it is spent here and nowhere else.
 *
 * Rules it keeps:
 *   - it is always skippable, by click or by any key, and says so
 *   - it never blocks work: the session is already stored and the destination
 *     already prefetched by the time it starts, so the app is warm behind it
 *   - reduced motion collapses it to a held frame, not a removed one — the
 *     threshold still reads, it just doesn't move
 *
 * The parent raises the house lights; this component only owns the words.
 */
const BEATS = {
  eyebrow: 220,
  name: 420,
  rule: 1150,
  detail: 1360,
  hint: 1900,
  exit: 3300,
  done: 3960,
} as const;

export function WelcomeCurtain({
  name,
  returning,
  workspace,
  role,
  onDone,
}: {
  name: string;
  /** True for sign-in, false for a freshly created account. */
  returning: boolean;
  workspace?: string;
  role?: string;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);

  const finish = useRef(onDone);
  finish.current = onDone;

  const skip = useRef(() => {
    if (finished.current) return;
    finished.current = true;
    finish.current();
  });

  useEffect(() => {
    if (reduced) {
      setBeat(5);
      const t = window.setTimeout(() => skip.current(), 1400);
      return () => window.clearTimeout(t);
    }

    const timers = [
      window.setTimeout(() => setBeat(1), BEATS.eyebrow),
      window.setTimeout(() => setBeat(2), BEATS.name),
      window.setTimeout(() => setBeat(3), BEATS.rule),
      window.setTimeout(() => setBeat(4), BEATS.detail),
      window.setTimeout(() => setBeat(5), BEATS.hint),
      window.setTimeout(() => setLeaving(true), BEATS.exit),
      window.setTimeout(() => skip.current(), BEATS.done),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [reduced]);

  // Any key, anywhere, ends it. So does a click.
  useEffect(() => {
    const onKey = () => skip.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const first = name.split(" ")[0] || name;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => skip.current()}
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center px-6 text-center"
      style={
        leaving
          ? { animation: "curtain 620ms cubic-bezier(0.4,0,1,1) both" }
          : undefined
      }
    >
      <div className="w-full max-w-[min(1100px,92vw)]">
        {/* Eyebrow */}
        <p
          className="text-caption uppercase tracking-[0.22em] text-quaternary transition-all duration-slow ease-standard"
          style={{
            opacity: beat >= 1 ? 1 : 0,
            transform: beat >= 1 ? "none" : "translateY(10px)",
          }}
        >
          {returning ? "Welcome back" : "Your workspace is ready"}
        </p>

        {/* The name — the whole reason this screen exists */}
        <h1
          className="pt-5 font-medium leading-[0.95] tracking-[-0.04em] text-primary transition-all duration-[900ms] ease-standard"
          style={{
            fontSize: "clamp(2.75rem, 11vw, 7.5rem)",
            opacity: beat >= 2 ? 1 : 0,
            transform: beat >= 2 ? "none" : "translateY(26px) scale(0.97)",
            filter: beat >= 2 ? "blur(0)" : "blur(10px)",
          }}
        >
          <span className={beat >= 2 && !reduced ? "sweep" : undefined}>{first}</span>
        </h1>

        {/* Rule — draws out from the centre */}
        <div
          className="mx-auto mt-8 h-px w-full max-w-[420px] origin-center bg-border-strong transition-transform duration-[900ms] ease-standard"
          style={{ transform: `scaleX(${beat >= 3 ? 1 : 0})` }}
        />

        {/* Detail */}
        <div
          className="pt-6 transition-all duration-slow ease-standard"
          style={{
            opacity: beat >= 4 ? 1 : 0,
            transform: beat >= 4 ? "none" : "translateY(10px)",
          }}
        >
          <p className="text-body text-secondary">
            {returning
              ? "Signed in to the "
              : "You are signed in to the "}
            <span className="text-primary">{workspace ?? "Nova Commerce"}</span>
            {" workspace"}
            {role ? ` as ${role}` : ""}.
          </p>
          <p className="pt-2 text-small text-quaternary">
            Loading the Control Room — 43 assets, 47 dependencies, all simulated.
          </p>
        </div>
      </div>

      {/* Skip affordance, and the progress of the sequence itself */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 pb-10 transition-opacity duration-slow"
        style={{ opacity: beat >= 5 && !leaving ? 1 : 0 }}
      >
        <span className="text-caption text-quaternary">
          Press any key to continue
        </span>
      </div>

      {!reduced && (
        <div
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-accent/60"
          style={{
            animation: `curtainProgress ${BEATS.done}ms linear both`,
          }}
          aria-hidden
        />
      )}

      <style>{`
        @keyframes curtainProgress {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
