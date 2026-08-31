"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Asset, HealthState, Topology } from "@/lib/types";
import { NODE_SHAPE, STATE } from "@/lib/visual";

/**
 * The cinematic landing scene.
 *
 * ONE WebGL context. Scroll progress drives:
 *   camera position -> topology reveal -> data flow -> failure -> blast radius
 *   -> business impact -> recovery -> settle
 *
 * The hero object is THE DATA SYSTEM ITSELF. Nothing decorative is added on
 * top; every visual change corresponds to a real product state.
 */

/** Which failure the story tells — mirrors the Payments outage scenario. */
const STORY_ORIGIN = "src_payments";

interface SceneProps {
  topology: Topology;
  /** Blast-radius node -> hop distance, from the real engine. */
  blastHops: Map<string, number>;
  blastStates: Map<string, HealthState>;
  progress: React.RefObject<number>;
  reducedMotion: boolean;
}

/** Camera keyframes per scene (position + look-at), interpolated by scroll. */
const KEYS: { at: number; pos: [number, number, number]; look: [number, number, number] }[] = [
  { at: 0.0, pos: [0, 0, 26], look: [0, 0, 0] },        // 1 pinhole on one node
  { at: 0.12, pos: [-40, 14, 90], look: [-30, 4, 0] },   // 2 sources appear
  { at: 0.26, pos: [-14, 20, 96], look: [-6, 0, 0] },    // 3 flow along the pipe
  { at: 0.38, pos: [-6, 62, 196], look: [10, 0, 0] },    // 4 healthy whole system
  { at: 0.50, pos: [-46, 24, 74], look: [-42, 8, -34] }, // 5 failure at the source
  { at: 0.64, pos: [0, 78, 232], look: [10, 0, 0] },     // 6 blast radius pull-back
  { at: 0.76, pos: [46, 18, 92], look: [56, -2, -18] },  // 7 business impact
  { at: 0.88, pos: [-10, 56, 186], look: [10, 0, 0] },   // 8 recovery
  { at: 1.0, pos: [-6, 66, 210], look: [10, 0, 0] },     // 9 settle wide
];

function lerpKeys(p: number) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (p >= KEYS[i].at && p <= KEYS[i + 1].at) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const span = b.at - a.at || 1;
  const t = Math.min(Math.max((p - a.at) / span, 0), 1);
  // Smoothstep for weighted, damped movement between beats.
  const e = t * t * (3 - 2 * t);
  return {
    pos: new THREE.Vector3(
      THREE.MathUtils.lerp(a.pos[0], b.pos[0], e),
      THREE.MathUtils.lerp(a.pos[1], b.pos[1], e),
      THREE.MathUtils.lerp(a.pos[2], b.pos[2], e)
    ),
    look: new THREE.Vector3(
      THREE.MathUtils.lerp(a.look[0], b.look[0], e),
      THREE.MathUtils.lerp(a.look[1], b.look[1], e),
      THREE.MathUtils.lerp(a.look[2], b.look[2], e)
    ),
  };
}

/**
 * The story state at a given scroll position:
 *  - `reveal`   how much of the topology has appeared (0..1 by pipeline stage)
 *  - `failure`  0..1 how far the failure has propagated (in hops)
 *  - `recovery` 0..1 how far recovery has swept back
 */
function storyState(p: number) {
  const reveal =
    p < 0.08 ? 0 : Math.min((p - 0.08) / 0.26, 1); // scenes 2-4 build the system
  const failure =
    p < 0.46 ? 0 : Math.min((p - 0.46) / 0.26, 1); // scenes 5-7 propagate
  const recovery =
    p < 0.8 ? 0 : Math.min((p - 0.8) / 0.16, 1);   // scene 8 heals
  return { reveal, failure, recovery };
}

function SceneContents({
  topology,
  blastHops,
  blastStates,
  progress,
  reducedMotion,
}: SceneProps) {
  const camRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 26));
  const lookRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  const assets = topology.assets;
  const deps = topology.dependencies;

  // Reveal order: by pipeline stage (x position), so the system builds
  // left-to-right the way data actually flows.
  const revealOrder = useMemo(() => {
    const xs = assets.map((a) => a.position?.x ?? 0);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const m = new Map<string, number>();
    for (const a of assets) {
      m.set(a.id, ((a.position?.x ?? 0) - min) / (max - min || 1));
    }
    return m;
  }, [assets]);

  const maxHop = useMemo(
    () => Math.max(1, ...[...blastHops.values()]),
    [blastHops]
  );

  const posById = useMemo(() => {
    const m = new Map<string, THREE.Vector3>();
    for (const a of assets)
      if (a.position) m.set(a.id, new THREE.Vector3(a.position.x, a.position.y, a.position.z));
    return m;
  }, [assets]);

  const edges = useMemo(
    () =>
      deps
        .map((d) => ({
          from: posById.get(d.upstream),
          to: posById.get(d.downstream),
          up: d.upstream,
          down: d.downstream,
        }))
        .filter((e) => e.from && e.to) as {
        from: THREE.Vector3;
        to: THREE.Vector3;
        up: string;
        down: string;
      }[],
    [deps, posById]
  );

  /** Health state of a node at the current story position. */
  const stateAt = (id: string, failure: number, recovery: number): HealthState => {
    const hop = blastHops.get(id);
    if (hop === undefined) return "HEALTHY";
    const reachedAt = hop / maxHop;
    if (recovery > 0) {
      // Recovery sweeps back outward from the origin.
      if (recovery >= reachedAt * 0.9 + 0.1) return "HEALTHY";
      return "RECOVERING";
    }
    if (failure >= reachedAt) return blastStates.get(id) ?? "DEGRADED";
    return "HEALTHY";
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[40, 60, 30]} intensity={0.75} color="#cfe6e4" />
      <directionalLight position={[-50, -20, -40]} intensity={0.28} color="#5FA8C8" />
      <fog attach="fog" args={["#060708", 120, 460]} />

      <CameraRig progress={progress} camRef={camRef} lookRef={lookRef} reduced={reducedMotion} />

      <StoryNodes
        assets={assets}
        revealOrder={revealOrder}
        progress={progress}
        stateAt={stateAt}
        reduced={reducedMotion}
      />
      <StoryEdges
        edges={edges}
        revealOrder={revealOrder}
        progress={progress}
        stateAt={stateAt}
        reduced={reducedMotion}
      />
    </>
  );
}

function CameraRig({
  progress,
  camRef,
  lookRef,
  reduced,
}: {
  progress: React.RefObject<number>;
  camRef: React.RefObject<THREE.Vector3>;
  lookRef: React.RefObject<THREE.Vector3>;
  reduced: boolean;
}) {
  useFrame(({ camera }) => {
    const p = progress.current ?? 0;
    const { pos, look } = lerpKeys(p);
    const damp = reduced ? 1 : 0.075;
    camRef.current.lerp(pos, damp);
    lookRef.current.lerp(look, damp);
    camera.position.copy(camRef.current);
    camera.lookAt(lookRef.current);
  });
  return null;
}

function StoryNodes({
  assets,
  revealOrder,
  progress,
  stateAt,
  reduced,
}: {
  assets: Asset[];
  revealOrder: Map<string, number>;
  progress: React.RefObject<number>;
  stateAt: (id: string, f: number, r: number) => HealthState;
  reduced: boolean;
}) {
  return (
    <group>
      {assets.map((a) => (
        <StoryNode
          key={a.id}
          asset={a}
          revealAt={revealOrder.get(a.id) ?? 0}
          progress={progress}
          stateAt={stateAt}
          reduced={reduced}
        />
      ))}
    </group>
  );
}

function StoryNode({
  asset,
  revealAt,
  progress,
  stateAt,
  reduced,
}: {
  asset: Asset;
  revealAt: number;
  progress: React.RefObject<number>;
  stateAt: (id: string, f: number, r: number) => HealthState;
  reduced: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const color = useMemo(() => new THREE.Color(), []);
  const pos = asset.position ?? { x: 0, y: 0, z: 0 };
  const shape = NODE_SHAPE[asset.type];
  const baseScale =
    asset.criticality === "CRITICAL" ? 1.3 : asset.criticality === "HIGH" ? 1.1 : 0.95;

  useFrame((s) => {
    if (!mesh.current || !mat.current) return;
    const p = progress.current ?? 0;
    const { reveal, failure, recovery } = storyState(p);

    // Staged appearance: a node materialises once the reveal wave passes it.
    const appear = THREE.MathUtils.clamp((reveal - revealAt * 0.85) * 6, 0, 1);
    const target = appear * baseScale;
    mesh.current.scale.lerp(
      new THREE.Vector3(target, target, target),
      reduced ? 1 : 0.14
    );

    const st = stateAt(asset.id, failure, recovery);
    const v = STATE[st];
    color.set(v.hex);
    mat.current.emissive.lerp(color, reduced ? 1 : 0.1);
    const t = s.clock.elapsedTime;
    let ei = st === "HEALTHY" ? 0.55 : 0.9;
    if (st === "FAILED" && !reduced) ei = 0.75 + Math.sin(t * 1.6) * 0.35;
    if (st === "DEGRADED" && !reduced) ei = 0.7 + Math.sin(t * 2.7) * 0.2;
    mat.current.emissiveIntensity += (ei * appear - mat.current.emissiveIntensity) * 0.12;
    mat.current.opacity = appear;
  });

  const geom = () => {
    switch (shape) {
      case "octahedron":
        return <octahedronGeometry args={[1.7, 0]} />;
      case "connector":
        return <cylinderGeometry args={[0.5, 0.5, 2.6, 6]} />;
      case "block":
        return <boxGeometry args={[2.2, 1.5, 2.2]} />;
      case "slab":
        return <boxGeometry args={[2.8, 0.75, 2.8]} />;
      case "lens":
        return <cylinderGeometry args={[1.6, 1.6, 0.7, 24]} />;
      case "plane":
        return <boxGeometry args={[3.2, 2.0, 0.22]} />;
      case "sphere":
        return <icosahedronGeometry args={[1.5, 1]} />;
      default:
        return <coneGeometry args={[1.3, 2.4, 4]} />;
    }
  };

  return (
    <mesh ref={mesh} position={[pos.x, pos.y, pos.z]} scale={0}>
      {geom()}
      <meshStandardMaterial
        ref={mat}
        color="#1a2226"
        emissive="#3FC8BC"
        emissiveIntensity={0}
        roughness={0.45}
        metalness={0.15}
        transparent
        opacity={0}
      />
    </mesh>
  );
}

/** Edges + flowing particles for the story scene. */
function StoryEdges({
  edges,
  revealOrder,
  progress,
  stateAt,
  reduced,
}: {
  edges: { from: THREE.Vector3; to: THREE.Vector3; up: string; down: string }[];
  revealOrder: Map<string, number>;
  progress: React.RefObject<number>;
  stateAt: (id: string, f: number, r: number) => HealthState;
  reduced: boolean;
}) {
  const PER_EDGE = 4;
  const count = Math.min(edges.length * PER_EDGE, 800);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const lineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts = new Float32Array(edges.length * 6);
    edges.forEach((e, i) =>
      pts.set([e.from.x, e.from.y, e.from.z, e.to.x, e.to.y, e.to.z], i * 6)
    );
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, [edges]);

  const spec = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        edge: i % edges.length,
        offset: (Math.floor(i / edges.length) + 1) / (PER_EDGE + 1),
        speedVar: 0.85 + ((i * 37) % 30) / 100,
      })),
    [count, edges.length]
  );
  const prog = useRef(new Float32Array(count));
  const init = useRef(false);

  useFrame((s, delta) => {
    const mesh = meshRef.current;
    if (!mesh || edges.length === 0) return;
    const dt = Math.min(delta, 0.05);
    const t = s.clock.elapsedTime;
    const p = progress.current ?? 0;
    const { reveal, failure, recovery } = storyState(p);

    if (!init.current) {
      for (let i = 0; i < count; i++) prog.current[i] = spec[i].offset;
      init.current = true;
    }

    if (lineRef.current) {
      const m = lineRef.current.material as THREE.LineBasicMaterial;
      m.opacity = THREE.MathUtils.lerp(m.opacity, reveal * 0.4, 0.08);
    }

    for (let i = 0; i < count; i++) {
      const sp = spec[i];
      const e = edges[sp.edge];
      const upState = stateAt(e.up, failure, recovery);
      const downState = stateAt(e.down, failure, recovery);
      const upV = STATE[upState];
      const downV = STATE[downState];
      const flow = Math.min(upV.flow, downV.flow);
      const jitter = Math.max(upV.jitter, downV.jitter);

      // Edge only carries data once both ends have been revealed.
      const revealed = Math.min(
        THREE.MathUtils.clamp((reveal - (revealOrder.get(e.up) ?? 0) * 0.85) * 6, 0, 1),
        THREE.MathUtils.clamp((reveal - (revealOrder.get(e.down) ?? 0) * 0.85) * 6, 0, 1)
      );

      if (flow > 0 && !reduced) {
        const stutter =
          jitter > 0 ? 1 + Math.sin(t * 6.1 + sp.edge * 1.7) * jitter * 0.75 : 1;
        prog.current[i] += dt * 0.17 * flow * sp.speedVar * Math.max(0.05, stutter);
        if (prog.current[i] > 1) prog.current[i] -= 1;
      }

      const pr = prog.current[i];
      dummy.position.lerpVectors(e.from, e.to, pr);
      const fade = Math.sin(Math.PI * pr);
      const scale = (0.17 + fade * 0.22) * (flow > 0 ? 1 : 0) * revealed;
      dummy.scale.setScalar(Math.max(scale, 0.0001));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const worse = upV.flow <= downV.flow ? upV : downV;
      color.set(worse.hex);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments ref={lineRef} geometry={lineGeom}>
        <lineBasicMaterial color="#243036" transparent opacity={0} depthWrite={false} />
      </lineSegments>
      <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(count, 1)]}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

export function CinematicScene(props: SceneProps) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      camera={{ position: [0, 0, 26], fov: 45, near: 0.5, far: 1000 }}
      onCreated={({ gl }) => gl.setClearColor("#060708", 1)}
      frameloop={props.reducedMotion ? "demand" : "always"}
    >
      <SceneContents {...props} />
    </Canvas>
  );
}

export { STORY_ORIGIN };
