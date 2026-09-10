"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * The form gathering itself into a loading ring.
 *
 * It fills the gap between the click and the welcome. Every element of the
 * form marked `data-orb` is measured where it actually sits, lifts off as a
 * disc, and settles onto a ring in the middle of the room, which then turns
 * while the API is answering. On success the ring spirals into the centre and
 * hands over to the welcome; on failure it flies home and gives the form back.
 *
 * Two rules make it safe to put in front of a sign-in:
 *   - it is never a gate. The request is already in flight when it starts, and
 *     the only thing it can add is `MIN_RING_MS` of ring — enough that a local
 *     API answering in 20ms does not produce a flicker.
 *   - a failed sign-in must return the form. The `failed` status reverses the
 *     whole thing, so a mistyped password costs a beat, not a dead end.
 *
 * Reduced motion collapses it to a held ring: the threshold still reads, it
 * just does not travel.
 */
export type OrbitStatus = "working" | "success" | "failed";

type Stage = "origin" | "ring" | "converge" | "return";

type Orb = {
  id: number;
  icon: IconName;
  /** Offset from viewport centre to the source element's centre. */
  dx: number;
  dy: number;
  w: number;
  h: number;
  radius: number;
  /** Slot on the ring, in degrees. */
  angle: number;
};

const GATHER_MS = 620;
const MIN_RING_MS = 1100;
const CONVERGE_MS = 560;
const RETURN_MS = 520;
const REVOLUTION_MS = 2800;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function FieldOrbit({
  formRef,
  status,
  caption,
  onDone,
  onDismissed,
}: {
  /** The form whose `[data-orb]` elements become the ring. */
  formRef: React.RefObject<HTMLElement | null>;
  status: OrbitStatus;
  caption: string;
  /** The request succeeded and the ring has closed — play the welcome. */
  onDone: () => void;
  /** The request failed and the form is back — restore it. */
  onDismissed: () => void;
}) {
  const reduced = useReducedMotion();
  const [orbs, setOrbs] = useState<Orb[]>([]);
  const [stage, setStage] = useState<Stage>("origin");
  const [spinning, setSpinning] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [ring, setRing] = useState(112);
  const [diameter, setDiameter] = useState(58);

  const launchedAt = useRef(0);
  const done = useRef(onDone);
  const dismissed = useRef(onDismissed);
  done.current = onDone;
  dismissed.current = onDismissed;

  // Measure before paint, so the discs start exactly where the form was.
  useLayoutEffect(() => {
    const root = formRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-orb]"));
    if (!nodes.length) return;

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const d = window.innerWidth < 420 ? 48 : 58;

    setDiameter(d);
    setRing(
      Math.max(78, Math.min(132, Math.min(window.innerWidth, window.innerHeight) * 0.2))
    );
    setOrbs(
      nodes.map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          id: i,
          icon: (el.dataset.orbIcon as IconName) || "sparkle",
          dx: r.left + r.width / 2 - cx,
          dy: r.top + r.height / 2 - cy,
          w: r.width,
          h: r.height,
          radius: parseFloat(getComputedStyle(el).borderRadius) || 12,
          angle: -90 + (360 / nodes.length) * i,
        };
      })
    );
  }, [formRef]);

  // Lift off on the frame after the discs have been painted at the form.
  //
  // A frame callback alone would not do: a hidden or backgrounded tab stops
  // running them, and the sequence would sit at `origin` with the form already
  // faded out and no way forward. A timer still fires there, so it races the
  // frame and whichever arrives first launches. `launchedAt` makes that safe
  // to call twice.
  useEffect(() => {
    if (!orbs.length || launched) return;
    const go = () => {
      if (launchedAt.current) return;
      launchedAt.current = Date.now();
      setLaunched(true);
      // Reduced motion still goes to the ring — it just arrives there without
      // travelling, and never turns. A held frame, not a removed one.
      setStage("ring");
    };
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(go);
    });
    const fallback = window.setTimeout(go, 60);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.clearTimeout(fallback);
    };
  }, [orbs.length, launched]);

  // Turn the ring once it has arrived.
  useEffect(() => {
    if (stage !== "ring" || reduced) return;
    const t = window.setTimeout(() => setSpinning(true), GATHER_MS);
    return () => window.clearTimeout(t);
  }, [stage, reduced]);

  // Close out, once the request has answered and the ring has been seen.
  useEffect(() => {
    if (status === "working" || !launched) return;
    const ok = status === "success";

    if (reduced) {
      const t = window.setTimeout(() => (ok ? done.current() : dismissed.current()), 340);
      return () => window.clearTimeout(t);
    }

    const floor = GATHER_MS + (ok ? MIN_RING_MS : 360);
    const wait = Math.max(0, floor - (Date.now() - launchedAt.current));
    const timers = [
      window.setTimeout(() => setStage(ok ? "converge" : "return"), wait),
      window.setTimeout(
        () => (ok ? done.current() : dismissed.current()),
        wait + (ok ? CONVERGE_MS : RETURN_MS)
      ),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [status, launched, reduced]);

  if (!orbs.length) return null;

  const onRing = stage === "ring" || stage === "converge";
  const duration =
    stage === "converge" ? CONVERGE_MS : stage === "return" ? RETURN_MS : GATHER_MS;

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none" data-field-orbit={stage}>
      {/* The track the discs settle onto — the loading read */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 rounded-full border border-border-strong transition-opacity duration-slow ease-standard"
        style={{
          width: ring * 2,
          height: ring * 2,
          transform: "translate(-50%, -50%)",
          opacity: onRing ? 0.5 : 0,
        }}
      />

      {/* The ring itself: a point at the centre of the room that turns */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-0 w-0"
        style={
          spinning
            ? { animation: `orbitRing ${REVOLUTION_MS}ms linear infinite` }
            : undefined
        }
      >
        {orbs.map((o) => (
          <div
            key={o.id}
            className="light-field absolute left-0 top-0 flex items-center justify-center"
            style={{
              width: onRing ? diameter : o.w,
              height: onRing ? diameter : o.h,
              borderRadius: onRing ? 9999 : o.radius,
              opacity: stage === "ring" ? 1 : 0,
              transform: transformFor(o, stage, ring),
              transition: reduced
                ? undefined
                : `transform ${duration}ms ${EASE}, width ${duration}ms ${EASE},` +
                  ` height ${duration}ms ${EASE}, border-radius ${duration}ms ${EASE},` +
                  ` opacity ${duration}ms linear`,
            }}
          >
            {/* Counter-turn, so the glyph stays upright while the ring moves */}
            <span
              className="grid place-items-center"
              style={
                spinning
                  ? { animation: `orbitGlyph ${REVOLUTION_MS}ms linear infinite` }
                  : undefined
              }
            >
              <Icon name={o.icon} size={16} className="text-accent-text" />
            </span>
          </div>
        ))}
      </div>

      {/* What is actually happening, for anyone who cannot see the ring */}
      <p
        role="status"
        aria-live="polite"
        className="absolute inset-x-0 text-center text-caption uppercase tracking-[0.22em] text-quaternary transition-opacity duration-slow ease-standard"
        style={{
          top: `calc(50% + ${ring + 56}px)`,
          opacity: stage === "ring" ? 1 : 0,
        }}
      >
        {caption}
      </p>

      <style>{`
        @keyframes orbitRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes orbitGlyph {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * Where a disc sits at each stage. Every value ends in `translate(-50%, -50%)`
 * so the disc stays centred on its target while its own width and height are
 * still travelling between the field's size and the ring's.
 */
function transformFor(o: Orb, stage: Stage, ring: number): string {
  if (stage === "origin" || stage === "return") {
    return `translate(${o.dx}px, ${o.dy}px) translate(-50%, -50%)`;
  }
  if (stage === "converge") {
    return "translate(-50%, -50%) scale(0.3)";
  }
  return (
    `rotate(${o.angle}deg) translate(${ring}px, 0)` +
    ` rotate(${-o.angle}deg) translate(-50%, -50%)`
  );
}
