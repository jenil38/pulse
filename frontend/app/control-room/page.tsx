"use client";

import { useEffect, useState } from "react";
import { usePulse } from "@/lib/store";
import { useChaosMode } from "@/lib/mode";
import { useGraphKeyboard } from "@/hooks/useGraphKeyboard";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { AppShell } from "@/components/room/AppShell";
import { AssetTable } from "@/components/room/AssetTable";
import { Inspector } from "@/components/room/Inspector";
import { MobileRoom } from "@/components/room/MobileRoom";
import { SelectionAnnouncer } from "@/components/room/SelectionAnnouncer";
import { Toolbar } from "@/components/room/Toolbar";
import { TopologyStage } from "@/components/room/TopologyStage";
import { Tabs } from "@/components/ui/primitives";
import { ErrorState, LoadingState } from "@/components/ui/AsyncState";

/**
 * Control Room — the primary product surface.
 *
 * Layout: sidebar / main / inspector. The main column splits vertically so the
 * topology (the visual signature) and the asset table (the dense, scannable
 * truth) are both first-class rather than one being hidden behind the other.
 */
type View = "map" | "assets" | "split";

export default function ControlRoomPage() {
  const loadTopology = usePulse((s) => s.loadTopology);
  const loading = usePulse((s) => s.loading);
  const error = usePulse((s) => s.error);
  const topology = usePulse((s) => s.topology);
  const simulation = usePulse((s) => s.simulation);
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<View>("split");

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  // The environment darkens only while a simulation is active, and always
  // restores itself when this surface unmounts.
  useChaosMode(!!simulation);

  useGraphKeyboard(isDesktop);

  if (!isDesktop) return <MobileRoom />;

  return (
    <AppShell>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Toolbar title="Control Room">
          <div className="hidden lg:block">
            <Tabs<View>
            value={view}
            onChange={setView}
            tabs={[
              { value: "split", label: "Split" },
              { value: "map", label: "Map" },
              { value: "assets", label: "Assets" },
              ]}
            />
          </div>
        </Toolbar>

        {error && !topology ? (
          <ErrorState error={error} onRetry={loadTopology} what="the system topology" />
        ) : loading && !topology ? (
          <LoadingState label="Loading topology…" />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {view !== "assets" && <TopologyStage />}

            {view !== "map" && (
              <div
                className={`min-h-0 overflow-y-auto ${
                  view === "split" ? "h-[42%] shrink-0 border-t border-border" : "flex-1"
                }`}
              >
                <AssetTable />
              </div>
            )}
          </div>
        )}

        <SelectionAnnouncer />
      </div>

      <Inspector />
    </AppShell>
  );
}
