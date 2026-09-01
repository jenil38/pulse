"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { usePulse } from "@/lib/store";
import { useGraphKeyboard } from "@/hooks/useGraphKeyboard";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { SelectionAnnouncer } from "@/components/room/SelectionAnnouncer";
import { Inspector } from "@/components/room/Inspector";
import { MobileRoom } from "@/components/room/MobileRoom";
import { NavRail } from "@/components/room/NavRail";
import { StatusBar } from "@/components/room/StatusBar";
import { SystemsPanel } from "@/components/room/SystemsPanel";
import { TopologyLegend } from "@/components/room/TopologyLegend";

// The WebGL scene is client-only and code-split — the room is usable without it.
const TopologyScene = dynamic(
  () => import("@/components/three/TopologyScene").then((m) => m.TopologyScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Initialising system map…
        </span>
      </div>
    ),
  }
);

export default function ControlRoomPage() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const loading = usePulse((s) => s.loading);
  const error = usePulse((s) => s.error);
  const topology = usePulse((s) => s.topology);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  // Traverse lineage with the keyboard (arrows/Home/Escape) — the 3D map is
  // pointer-driven, so this is what makes the graph navigable without a mouse.
  useGraphKeyboard(isDesktop);

  // Mobile: 2D-first room. WebGL is never forced onto a phone.
  if (!isDesktop) return <MobileRoom />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <StatusBar />

      <div className="flex min-h-0 flex-1">
        <NavRail />

        {/* Left: systems / assets */}
        <div className="hidden w-[248px] shrink-0 md:block">
          <SystemsPanel />
        </div>

        {/* Centre: the system map (hero) */}
        <main className="relative min-w-0 flex-1 haze">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-failed">
                Cannot reach the PULSE API
              </p>
              <p className="max-w-sm font-mono text-[10px] leading-relaxed text-ink-mute">
                {error}
              </p>
              <p className="max-w-sm font-mono text-[9px] leading-relaxed text-ink-faint">
                Start it with:  python -m uvicorn backend.app.main:app --port 8000
              </p>
            </div>
          ) : loading && !topology ? (
            <div className="flex h-full items-center justify-center">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                Loading topology…
              </span>
            </div>
          ) : (
            <>
              <TopologyScene />
              <TopologyLegend />
              <SelectionAnnouncer />
            </>
          )}
        </main>

        {/* Right: inspector */}
        <div className="hidden w-[296px] shrink-0 lg:block">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
