"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { usePulse } from "@/lib/store";
import { useMode, token } from "@/lib/mode";
import { useOnScreen } from "@/hooks/useOnScreen";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { NODE_LABEL, STATE } from "@/lib/visual";
import { FlowEdges } from "./FlowEdges";
import { NodeMesh } from "./NodeMesh";
import { NodeLabels } from "./NodeLabels";

/**
 * The PULSE system map.
 *
 * NORMAL MODE — a 2.5D technical diagram. A long lens (low FOV) flattens
 * perspective so the pipeline reads cleanly left-to-right, like a drawing.
 * Calm, legible, no drama.
 *
 * CHAOS MODE — the same graph gains depth: a wider lens, a lower and more
 * angled camera, darker ground. Nothing about the data changes; only the
 * environment, which is what makes the simulation feel consequential.
 */

const GRAPH_CENTER = new THREE.Vector3(10, 0, 0);

/**
 * Lens and framing per mode. The graph is auto-fitted to the viewport, so these
 * describe *character* (how flat, how angled) rather than absolute positions.
 */
const VIEW = {
  //  flat, diagram-like, viewed nearly head-on
  normal: { fov: 26, dir: new THREE.Vector3(0.02, 0.15, 1).normalize(), margin: 1.24 },
  //  wider lens, lower and angled — the graph gains depth
  chaos: { fov: 42, dir: new THREE.Vector3(-0.16, 0.34, 1).normalize(), margin: 1.34 },
};

/** Distance at which the graph's bounds fill the viewport with margin. */
function fitDistance(
  bounds: THREE.Box3,
  fovDeg: number,
  aspect: number,
  margin: number
): number {
  const size = bounds.getSize(new THREE.Vector3());
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  // Fit whichever axis is the binding constraint.
  const distV = size.y / 2 / Math.tan(vFov / 2);
  const distH = size.x / 2 / Math.tan(hFov / 2);
  return Math.max(distV, distH, 40) * margin + size.z / 2;
}

function CameraRig({ focusId, mode }: { focusId: string | null; mode: string }) {
  const { camera, size } = useThree();
  const assetById = usePulse((s) => s.assetById);
  const topology = usePulse((s) => s.topology);
  const reduced = useReducedMotion();
  const target = useRef(GRAPH_CENTER.clone());
  const controls = useRef<any>(null);
  const userMoved = useRef(false);

  // Bounds of the whole graph, from the server-supplied positions.
  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    let any = false;
    for (const a of topology?.assets ?? []) {
      if (!a.position) continue;
      box.expandByPoint(new THREE.Vector3(a.position.x, a.position.y, a.position.z));
      any = true;
    }
    if (!any) box.expandByPoint(new THREE.Vector3(60, 20, 40));
    return box;
  }, [topology]);

  const center = useMemo(() => bounds.getCenter(new THREE.Vector3()), [bounds]);

  // Re-frame whenever the mode, the viewport or the graph changes — unless the
  // user has taken manual control of the camera.
  useEffect(() => {
    userMoved.current = false;
  }, [mode]);

  // "Reset view" from the stage chrome hands framing back to the rig.
  useEffect(() => {
    const onReset = () => {
      userMoved.current = false;
    };
    window.addEventListener("pulse:reset-view", onReset);
    return () => window.removeEventListener("pulse:reset-view", onReset);
  }, []);

  useFrame(() => {
    const view = mode === "chaos" ? VIEW.chaos : VIEW.normal;
    const cam = camera as THREE.PerspectiveCamera;
    const k = reduced ? 1 : 0.06;

    if (Math.abs(cam.fov - view.fov) > 0.01) {
      cam.fov += (view.fov - cam.fov) * k;
      cam.updateProjectionMatrix();
    }

    const asset = focusId ? assetById(focusId) : undefined;
    const want = asset?.position
      ? new THREE.Vector3(asset.position.x, asset.position.y, asset.position.z)
      : center;
    target.current.lerp(want, reduced ? 1 : 0.05);

    if (!userMoved.current && !focusId) {
      const aspect = Math.max(size.width / Math.max(size.height, 1), 0.5);
      const dist = fitDistance(bounds, view.fov, aspect, view.margin);
      const desired = center.clone().add(view.dir.clone().multiplyScalar(dist));
      cam.position.lerp(desired, reduced ? 1 : 0.07);
    }

    if (controls.current) {
      controls.current.target.lerp(target.current, 0.12);
      controls.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      // Once the user drives the camera we stop auto-framing, so their view
      // is never yanked away mid-inspection.
      onStart={() => {
        userMoved.current = true;
      }}
      enablePan
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.4}
      panSpeed={0.6}
      zoomSpeed={0.6}
      minDistance={40}
      maxDistance={500}
      maxPolarAngle={Math.PI * 0.52}
      minPolarAngle={Math.PI * 0.06}
    />
  );
}

function SceneContents({ mode }: { mode: string }) {
  const topology = usePulse((s) => s.topology);
  const selectedId = usePulse((s) => s.selectedId);
  const hoveredId = usePulse((s) => s.hoveredId);
  const tracedIds = usePulse((s) => s.tracedIds);
  const systemFilter = usePulse((s) => s.systemFilter);
  const select = usePulse((s) => s.select);
  const hover = usePulse((s) => s.hover);
  const stateOf = usePulse((s) => s.stateOf);
  const simulation = usePulse((s) => s.simulation);
  const propagationHops = usePulse((s) => s.propagationHops);
  const reduced = useReducedMotion();

  const assets = topology?.assets ?? [];
  const dependencies = topology?.dependencies ?? [];
  const hasTrace = tracedIds.size > 0;
  const chaos = mode === "chaos";

  return (
    <>
      {/* Lighting: one key, one fill. Physically believable, never theatrical. */}
      <ambientLight intensity={chaos ? 0.5 : 0.85} />
      <directionalLight
        position={[60, 90, 60]}
        intensity={chaos ? 0.85 : 1.15}
        castShadow={false}
      />
      <directionalLight position={[-60, 20, -40]} intensity={chaos ? 0.3 : 0.35} />

      <GroundPlane mode={mode} />

      <FlowEdges
        assets={assets}
        dependencies={dependencies}
        stateOf={stateOf}
        tracedIds={tracedIds}
        reducedMotion={reduced}
        modeKey={mode}
      />

      {assets.map((a) => {
        const st = stateOf(a.id);
        const inTrace = tracedIds.has(a.id);
        const inSim =
          !simulation ||
          simulation.blast_radius.nodes.some(
            (n) => n.id === a.id && n.hops <= propagationHops
          );
        const filtered = !!systemFilter && a.system !== systemFilter;
        const dimmed = (hasTrace && !inTrace) || (!!simulation && !inSim) || filtered;
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
            modeKey={mode}
          />
        );
      })}

      <NodeLabels />
      <HoverLabel />
      <CameraRig focusId={selectedId} mode={mode} />
    </>
  );
}

/**
 * Ground plane — a faint grid the graph sits on.
 *
 * The cheapest honest way to give a 2.5D diagram depth: it establishes a floor,
 * so nodes read as objects in space rather than shapes floating in a void. It
 * is drawn from the border token and sits far below the content in contrast, so
 * it never competes with the data.
 */
function GroundPlane({ mode }: { mode: string }) {
  const [color, setColor] = useState(() => token("border"));
  useEffect(() => setColor(token("border")), [mode]);

  const grid = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    const halfX = 130;
    const halfZ = 78;
    const step = 13;
    for (let x = -halfX; x <= halfX; x += step) pts.push(x, 0, -halfZ, x, 0, halfZ);
    for (let z = -halfZ; z <= halfZ; z += step) pts.push(-halfX, 0, z, halfX, 0, z);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  return (
    <lineSegments geometry={grid} position={[10, -24, 0]}>
      <lineBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
    </lineSegments>
  );
}

/** Hover label — a real UI tooltip in the design system, drawn in 3D space. */
function HoverLabel() {
  const hoveredId = usePulse((s) => s.hoveredId);
  const assetById = usePulse((s) => s.assetById);
  const stateOf = usePulse((s) => s.stateOf);
  const asset = hoveredId ? assetById(hoveredId) : undefined;
  if (!asset?.position) return null;
  const st = stateOf(asset.id);

  return (
    <Html
      position={[asset.position.x, asset.position.y + 5, asset.position.z]}
      center
      distanceFactor={110}
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div className="whitespace-nowrap rounded border border-border bg-surface px-2 py-1.5 shadow-raised">
        <div className="text-small font-medium text-primary">{asset.name}</div>
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className={`h-[6px] w-[6px] rounded-full ${STATE[st].dot}`} />
          <span className="text-caption text-tertiary">
            {STATE[st].label} · {NODE_LABEL[asset.type]}
          </span>
        </div>
      </div>
    </Html>
  );
}

export function TopologyScene({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const { ref, visible } = useOnScreen<HTMLDivElement>();
  const [mode] = useMode();
  const [clear, setClear] = useState(() => token("stage"));

  // Keep the WebGL clear colour in step with the CSS environment.
  useEffect(() => {
    setClear(token("stage"));
  }, [mode]);

  return (
    <div ref={ref} className={`relative h-full w-full ${className}`}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
        camera={{ position: [4, 34, 250], fov: 26, near: 1, far: 1200 }}
        // Pause when reduced motion is requested or the map is offscreen.
        frameloop={reduced || !visible ? "demand" : "always"}
      >
        <color attach="background" args={[clear]} />
        <Suspense fallback={null}>
          <SceneContents mode={mode} />
        </Suspense>
      </Canvas>
    </div>
  );
}
