"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { usePulse } from "@/lib/store";
import { useOnScreen } from "@/hooks/useOnScreen";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { STATE } from "@/lib/visual";
import { FlowEdges } from "./FlowEdges";
import { NodeMesh } from "./NodeMesh";

/**
 * The PULSE 3D system map.
 *
 * One WebGL context. Deterministic server-supplied positions. Damped camera.
 * The scene reads as an instrumented machine room: graphite void, volumetric
 * haze, restrained key light — never a neon grid.
 */

/** Centre of the whole topology — the resting camera target. */
const GRAPH_CENTER = new THREE.Vector3(10, 0, 0);

/** Smoothly frames the selected node without snapping the camera. */
function CameraDirector({ focusId }: { focusId: string | null }) {
  const target = useRef(GRAPH_CENTER.clone());
  const assetById = usePulse((s) => s.assetById);
  const reduced = useReducedMotion();

  useFrame(() => {
    const asset = focusId ? assetById(focusId) : undefined;
    const want = asset?.position
      ? new THREE.Vector3(asset.position.x, asset.position.y, asset.position.z)
      : GRAPH_CENTER;
    // Critically damped follow — weighted, never springy.
    target.current.lerp(want, reduced ? 1 : 0.045);
  });

  return <DampedControls targetRef={target} />;
}

function DampedControls({ targetRef }: { targetRef: React.RefObject<THREE.Vector3> }) {
  const ref = useRef<any>(null);
  useFrame(() => {
    if (ref.current && targetRef.current) {
      ref.current.target.lerp(targetRef.current, 0.12);
      ref.current.update();
    }
  });
  return (
    <OrbitControls
      ref={ref}
      enablePan
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.45}
      panSpeed={0.6}
      zoomSpeed={0.7}
      minDistance={22}
      maxDistance={320}
      maxPolarAngle={Math.PI * 0.85}
      minPolarAngle={Math.PI * 0.08}
    />
  );
}

function SceneContents() {
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const hoveredId = usePulse((s) => s.hoveredId);
  const tracedIds = usePulse((s) => s.tracedIds);
  const select = usePulse((s) => s.select);
  const hover = usePulse((s) => s.hover);
  const stateOf = usePulse((s) => s.stateOf);
  const simulation = usePulse((s) => s.simulation);
  const propagationHops = usePulse((s) => s.propagationHops);
  const reduced = useReducedMotion();

  // Re-read state per render tick via the store selector so simulation
  // propagation is reflected without prop-drilling every node.
  const assets = topology?.assets ?? [];
  const dependencies = topology?.dependencies ?? [];

  const hasTrace = tracedIds.size > 0;

  return (
    <>
      {/* Lighting: one restrained key + cool fill. Physically believable. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[40, 60, 30]} intensity={0.7} color="#cfe6e4" />
      <directionalLight position={[-50, -20, -40]} intensity={0.25} color="#5FA8C8" />

      {/* Volumetric haze + depth falloff — distant lanes recede into the void. */}
      <fog attach="fog" args={["#060708", 150, 430]} />

      <FlowEdges
        assets={assets}
        dependencies={dependencies}
        stateOf={stateOf}
        tracedIds={tracedIds}
        dimmed={false}
        reducedMotion={reduced}
      />

      {assets.map((a) => {
        const st = stateOf(a.id);
        const inTrace = tracedIds.has(a.id);
        const inSim =
          !simulation ||
          simulation.blast_radius.nodes.some(
            (n) => n.id === a.id && n.hops <= propagationHops
          );
        const dimmed = (hasTrace && !inTrace) || (!!simulation && !inSim);
        return (
          <NodeMesh
            key={a.id}
            asset={a}
            state={st}
            selected={selectedId === a.id}
            hovered={hoveredId === a.id}
            dimmed={dimmed}
            traced={inTrace}
            onSelect={select}
            onHover={hover}
            reducedMotion={reduced}
          />
        );
      })}

      <HoverLabel />
      <CameraDirector focusId={selectedId} />
    </>
  );
}

/** Minimal floating label — editorial, not a game tooltip. */
function HoverLabel() {
  const hoveredId = usePulse((s) => s.hoveredId);
  const assetById = usePulse((s) => s.assetById);
  const stateOf = usePulse((s) => s.stateOf);
  const asset = hoveredId ? assetById(hoveredId) : undefined;
  if (!asset?.position) return null;
  const st = stateOf(asset.id);
  return (
    <Html
      position={[asset.position.x, asset.position.y + 4.2, asset.position.z]}
      center
      distanceFactor={60}
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div className="whitespace-nowrap border border-line bg-base/95 px-2.5 py-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
          {asset.name}
        </div>
        <div className="flex items-center gap-1.5 pt-0.5">
          <span
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: STATE[st].hex }}
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
            {STATE[st].label}
          </span>
        </div>
      </div>
    </Html>
  );
}

export function TopologyScene({
  className = "",
  cursor = "INSPECT",
}: {
  className?: string;
  cursor?: string;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useOnScreen<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-cursor={cursor}
      className={`relative h-full w-full ${className}`}
    >
      <Canvas
        // Cap DPR — quality without melting laptops.
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
        }}
        // Establishing shot: slightly above and off-axis so the pipeline reads
        // left-to-right with real depth, framing the whole graph.
        // The graph spans ~124 units on X and the centre canvas is narrower than
        // the window (side panels), so we sit back far enough to frame it whole.
        camera={{ position: [-6, 62, 196], fov: 42, near: 0.5, far: 900 }}
        onCreated={({ gl }) => {
          gl.setClearColor("#060708", 1);
        }}
        // Pause rendering when reduced motion is requested OR the map is
        // scrolled offscreen — no runaway rAF loops (DESIGN.md §33).
        frameloop={reduced || !visible ? "demand" : "always"}
      >
        <Suspense fallback={null}>
          <SceneContents />
        </Suspense>
      </Canvas>
    </div>
  );
}
