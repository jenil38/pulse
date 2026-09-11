"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { Simulation, Topology } from "@/lib/types";
import { STATE } from "@/lib/visual";
import { StatusDot } from "@/components/ui/primitives";

const LandingTopology = dynamic(
  () => import("./LandingTopology").then((m) => m.LandingTopology),
  { ssr: false, loading: () => <div className="h-full w-full bg-stage" /> }
);

/**
 * The product story as a row of tinted glass cards that never stops moving.
 *
 * The row travels right to left at a steady pace, and whichever card is
 * passing the middle sets the topology above to that scene, using the real
 * simulation state machine. Each scene carries the colour of what it is
 * about: healthy flow is green, the failure red, the blast radius amber.
 *
 * Hovering slows the row to a reading pace rather than freezing it. Reduced
 * motion drops the travel and shows the five cards as a plain grid.
 */
const SCENES = [
  {
    at: 0.02,
    tint: "tint-violet",
    eyebrow: "The system",
    title: "Your platform is a dependency graph.",
    body: "Sources, ingestion, transformations, warehouse tables, models, dashboards, and the teams that trust them.",
  },
  {
    at: 0.24,
    tint: "tint-healthy",
    eyebrow: "Normal operation",
    title: "Data flows, and nobody thinks about it.",
    body: "Particles travel real upstream-to-downstream paths. Steady flow is a healthy pipe.",
  },
  {
    at: 0.46,
    tint: "tint-failed",
    eyebrow: "The failure",
    title: "One source stops answering.",
    body: "The Payments API goes down. Flow halts at the origin, and everything below it is now living on borrowed time.",
  },
  {
    at: 0.66,
    tint: "tint-degraded",
    eyebrow: "Blast radius",
    title: "Failure does not stay where it starts.",
    body: "PULSE walks the graph in dependency order and marks every asset the outage reaches, hop by hop.",
  },
  {
    at: 0.88,
    tint: "tint-recovering",
    eyebrow: "Recovery",
    title: "Then it tells you what to fix, in order.",
    body: "Restore the source, validate, backfill, rebuild in dependency order, verify each consumer. Flow returns.",
  },
];

const HOVER_RATE = 0.3;

export function StoryCarousel({
  topology,
  simulation,
}: {
  topology: Topology | null;
  simulation: Simulation | null;
}) {
  const reduced = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(SCENES[0].at);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [topology, reduced]);

  // The card crossing the middle of the row is the scene the topology shows.
  useEffect(() => {
    if (!onScreen) return;
    const pick = () => {
      const vp = viewportRef.current;
      const track = trackRef.current;
      if (!vp || !track) return;
      const box = vp.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      let best = 0;
      let gap = Infinity;
      for (const card of track.querySelectorAll<HTMLElement>("[data-scene]")) {
        const r = card.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < gap) {
          gap = d;
          best = Number(card.dataset.scene);
        }
      }
      progressRef.current = SCENES[best].at;
    };
    pick();
    const id = window.setInterval(pick, 200);
    return () => window.clearInterval(id);
  }, [onScreen]);

  const setRate = (rate: number) =>
    trackRef.current?.getAnimations().forEach((a) => a.updatePlaybackRate(rate));

  if (!topology) return null;

  if (reduced) {
    return (
      <section className="mx-auto max-w-[1120px] px-6 py-20">
        <div ref={viewportRef} className="grid gap-4 md:grid-cols-2">
          {SCENES.map((s, i) => (
            <SceneCard key={s.eyebrow} scene={s} index={i} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="How PULSE reads a failure"
      className="py-16"
    >
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <div className="overflow-hidden rounded-xl border border-border bg-stage">
          <div className="flex h-9 items-center gap-2 border-b border-border bg-subtle px-3">
            <span className="text-caption text-tertiary">Nova Commerce</span>
            <span className="text-caption text-quaternary">/ system topology</span>
            <span className="ml-auto flex items-center gap-3">
              {(["HEALTHY", "DEGRADED", "STALE", "FAILED"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <StatusDot state={s} />
                  <span className="hidden text-caption text-tertiary sm:inline">
                    {STATE[s].label}
                  </span>
                </span>
              ))}
            </span>
          </div>
          <div className="h-[46vh] min-h-[280px]">
            <LandingTopology
              topology={topology}
              simulation={simulation}
              progressRef={progressRef}
            />
          </div>
        </div>
      </div>

      {/* The row runs the full width of the page, edge to edge */}
      <div
        ref={viewportRef}
        className="marquee mt-8 overflow-hidden py-3"
        onMouseEnter={() => setRate(HOVER_RATE)}
        onMouseLeave={() => setRate(1)}
      >
        <div ref={trackRef} className="marquee-track">
          {[0, 1].map((copy) =>
            SCENES.map((s, i) => (
              <div
                key={`${copy}-${s.eyebrow}`}
                data-scene={i}
                aria-hidden={copy === 1}
                className="w-[300px] shrink-0 pr-4 sm:w-[380px]"
              >
                <SceneCard scene={s} index={i} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SceneCard({
  scene,
  index,
}: {
  scene: (typeof SCENES)[number];
  index: number;
}) {
  return (
    <article className={`glass-tint ${scene.tint} h-full rounded-xl p-6`}>
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-caption font-medium text-[rgb(var(--tint))]">
            <span className="h-[7px] w-[7px] rounded-full bg-[rgb(var(--tint))]" aria-hidden />
            {scene.eyebrow}
          </p>
          <span className="font-mono text-caption tnum text-quaternary">
            {String(index + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")}
          </span>
        </div>
        <h3 className="pt-3 text-[1.25rem] font-medium leading-tight tracking-[-0.02em] text-primary sm:text-[1.4rem]">
          {scene.title}
        </h3>
        <p className="pt-2 text-small leading-relaxed text-secondary">{scene.body}</p>
      </div>
    </article>
  );
}
