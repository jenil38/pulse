"use client";

import dynamic from "next/dynamic";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { Simulation, Topology } from "@/lib/types";
import { STATE } from "@/lib/visual";
import { StatusDot } from "@/components/ui/primitives";

const LandingTopology = dynamic(
  () => import("./LandingTopology").then((m) => m.LandingTopology),
  { ssr: false, loading: () => <div className="h-full w-full bg-stage" /> }
);

/**
 * Scroll-driven product story — five scenes, deliberately restrained.
 *
 * Scroll advances the *real* simulation state machine (the same one the
 * product uses), so what a visitor sees is the actual engine output rather
 * than an animation of it. The camera makes exactly one move: a slow pull-back
 * as the blast radius opens.
 *
 * If motion is reduced, the pinned canvas is dropped and the scenes become a
 * plain vertical list — the story still reads.
 */
const SCENES = [
  {
    at: 0.02,
    eyebrow: "The system",
    title: "Your platform is a dependency graph.",
    body: "Sources, ingestion, transformations, warehouse tables, models, dashboards — and the teams that trust them.",
  },
  {
    at: 0.24,
    eyebrow: "Normal operation",
    title: "Data flows, and nobody thinks about it.",
    body: "Particles travel real upstream-to-downstream paths. Steady flow is a healthy pipe.",
  },
  {
    at: 0.46,
    eyebrow: "The failure",
    title: "One source stops answering.",
    body: "The Payments API goes down. Flow halts at the origin — everything below it is now living on borrowed time.",
  },
  {
    at: 0.66,
    eyebrow: "Blast radius",
    title: "Failure does not stay where it starts.",
    body: "PULSE walks the graph in dependency order and marks every asset the outage reaches, hop by hop.",
  },
  {
    at: 0.88,
    eyebrow: "Recovery",
    title: "Then it tells you what to fix, in order.",
    body: "Restore the source, validate, backfill, rebuild in dependency order, verify each consumer. Flow returns.",
  },
];

export function StoryScroll({
  topology,
  simulation,
}: {
  topology: Topology | null;
  simulation: Simulation | null;
}) {
  const { ref, progress, progressRef } = useScrollProgress();
  const reduced = useReducedMotion();

  if (!topology) return null;

  // Reduced motion: no pinned canvas, no scroll choreography — just the story.
  if (reduced) {
    return (
      <section className="mx-auto max-w-[1120px] px-6 py-20">
        <div className="grid gap-10 md:grid-cols-2">
          {SCENES.map((s) => (
            <div key={s.eyebrow} className="border-t border-border pt-4">
              <p className="text-caption text-tertiary">{s.eyebrow}</p>
              <h3 className="pt-2 text-heading text-primary">{s.title}</h3>
              <p className="pt-1.5 text-small leading-relaxed text-secondary">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const active = SCENES.reduce((best, s, i) => (progress >= s.at ? i : best), 0);

  return (
    <section ref={ref} className="relative" style={{ height: "460vh" }}>
      {/* Pinned stage */}
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-[1120px] px-6 pt-16">
          <div className="overflow-hidden rounded-xl border border-border bg-stage">
            <div className="flex h-9 items-center gap-2 border-b border-border bg-canvas px-3">
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

          {/* Caption — crossfades between scenes, no layout shift */}
          <div className="relative mt-7 h-[132px]">
            {SCENES.map((s, i) => (
              <div
                key={s.eyebrow}
                aria-hidden={i !== active}
                className="absolute inset-0 transition-opacity duration-slow ease-standard"
                style={{ opacity: i === active ? 1 : 0 }}
              >
                <p className="text-caption text-tertiary">{s.eyebrow}</p>
                <h3 className="max-w-[26ch] pt-2 text-[1.5rem] font-medium leading-tight tracking-[-0.02em] text-primary md:text-[1.75rem]">
                  {s.title}
                </h3>
                <p className="max-w-[58ch] pt-2 text-small leading-relaxed text-secondary">
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          {/* Scene progress — five ticks, not a scrollbar */}
          <ol className="flex gap-1.5 pt-5" aria-label="Story progress">
            {SCENES.map((s, i) => (
              <li key={s.eyebrow} className="flex-1">
                <span
                  className={`block h-[3px] rounded-full transition-colors duration-base ${
                    i <= active ? "bg-primary" : "bg-border"
                  }`}
                />
                <span className="sr-only">
                  {s.eyebrow}
                  {i === active ? " (current)" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
