"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HealthState, Simulation, Topology } from "@/lib/types";
import { token } from "@/lib/mode";
import { NODE_SHAPE, STATE } from "@/lib/visual";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useOnScreen } from "@/hooks/useOnScreen";

/**
 * Landing hero visual — the real topology, running the real engine output.
 *
 * This is the one place the marketing site is allowed to be expressive, and it
 * earns it by being *product-truthful*: the nodes, edges, blast radius and
 * propagation order all come from the API. It loops slowly through healthy →
 * failure → recovery so a visitor sees the product's core idea without reading.
 *
 * No scroll hijacking, no camera acrobatics — a slow drift and an honest
 * state cycle.
 */
const CYCLE = 16; // seconds for a full healthy → failure → recovery loop

export function LandingTopology({
  topology,
  simulation,
  progressRef,
}: {
  topology: Topology;
  simulation: Simulation | null;
  /**
   * When supplied, scroll position drives the story instead of a timed loop —
   * the visitor advances the failure themselves. Omit it and the scene loops
   * on its own (used where there is nothing to scroll).
   */
  progressRef?: React.RefObject<number>;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useOnScreen<HTMLDivElement>();
  const [clear, setClear] = useState(() => token("stage"));

  useEffect(() => setClear(token("stage")), []);

  return (
    <div ref={ref} className="h-full w-full">
      <Canvas
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ position: [6, 30, 235], fov: 26, near: 1, far: 1200 }}
        frameloop={reduced || !visible ? "demand" : "always"}
      >
        <color attach="background" args={[clear]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[60, 90, 60]} intensity={1.1} />
        <directionalLight position={[-60, 20, -40]} intensity={0.3} />
        <Scene
          topology={topology}
          simulation={simulation}
          reduced={reduced}
          progressRef={progressRef}
        />
      </Canvas>
    </div>
  );
}

function Scene({
  topology,
  simulation,
  reduced,
  progressRef,
}: {
  topology: Topology;
  simulation: Simulation | null;
  reduced: boolean;
  progressRef?: React.RefObject<number>;
}) {
  const group = useRef<THREE.Group>(null);
  const phase = useRef(0);

  const positions = useMemo(() => {
    const m = new Map<string, THREE.Vector3>();
    for (const a of topology.assets) {
      if (a.position) m.set(a.id, new THREE.Vector3(a.position.x, a.position.y, a.position.z));
    }
    return m;
  }, [topology]);

  const blast = useMemo(() => {
    const hops = new Map<string, number>();
    const states = new Map<string, HealthState>();
    for (const n of simulation?.blast_radius.nodes ?? []) {
      hops.set(n.id, n.hops);
      states.set(n.id, n.state);
    }
    const max = Math.max(1, ...[...hops.values()]);
    return { hops, states, max };
  }, [simulation]);

  // Scroll drives the story when a progress ref is supplied; otherwise the
  // scene loops on its own. Either way the drift stays slow and bounded.
  useFrame((s, delta) => {
    if (progressRef) {
      const target = (progressRef.current ?? 0) * CYCLE;
      // Damped follow, so scrubbing quickly still reads as motion, not a cut.
      phase.current += (target - phase.current) * (reduced ? 1 : 0.12);
      // Camera eases back as the blast radius opens up — the one camera move.
      const pullback = 1 + (progressRef.current ?? 0) * 0.18;
      s.camera.position.z += (235 * pullback - s.camera.position.z) * 0.05;
    } else {
      phase.current = (phase.current + delta) % CYCLE;
    }
    if (group.current && !reduced) {
      group.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.06) * 0.09;
    }
  });

  return (
    <group ref={group}>
      <Edges topology={topology} positions={positions} blast={blast} phase={phase} reduced={reduced} />
      {topology.assets.map((a) => (
        <Node
          key={a.id}
          id={a.id}
          type={a.type}
          criticality={a.criticality}
          position={positions.get(a.id)}
          blast={blast}
          phase={phase}
          reduced={reduced}
        />
      ))}
    </group>
  );
}

/** Where the loop is: 0 healthy → failing → settled → recovering → healthy. */
function stateAt(
  id: string,
  t: number,
  blast: { hops: Map<string, number>; states: Map<string, HealthState>; max: number }
): HealthState {
  const hop = blast.hops.get(id);
  if (hop === undefined) return "HEALTHY";
  const reached = hop / blast.max;

  const failStart = 0.3,
    failEnd = 0.55,
    recStart = 0.72,
    recEnd = 0.95;
  const p = t / CYCLE;

  if (p < failStart) return "HEALTHY";
  if (p < failEnd) {
    const f = (p - failStart) / (failEnd - failStart);
    return f >= reached ? blast.states.get(id) ?? "DEGRADED" : "HEALTHY";
  }
  if (p < recStart) return blast.states.get(id) ?? "DEGRADED";
  if (p < recEnd) {
    const r = (p - recStart) / (recEnd - recStart);
    return r >= reached * 0.9 + 0.1 ? "HEALTHY" : "RECOVERING";
  }
  return "HEALTHY";
}

function Node({
  id,
  type,
  criticality,
  position,
  blast,
  phase,
  reduced,
}: any) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const color = useMemo(() => new THREE.Color(), []);
  const hexes = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const m = new Map<string, string>();
    (Object.keys(STATE) as HealthState[]).forEach((s) =>
      m.set(s, s === "HEALTHY" ? token("node") : token(STATE[s].varName))
    );
    hexes.current = m;
  }, []);

  useFrame(() => {
    if (!mat.current) return;
    const st = stateAt(id, phase.current, blast);
    color.set(hexes.current.get(st) ?? token("node"));
    mat.current.color.lerp(color, reduced ? 1 : 0.08);
  });

  if (!position) return null;
  const scale = criticality === "CRITICAL" ? 1.2 : criticality === "HIGH" ? 1.05 : 0.9;
  const shape = NODE_SHAPE[type as keyof typeof NODE_SHAPE];

  const geom = () => {
    switch (shape) {
      case "octahedron":
        return <octahedronGeometry args={[1.7, 0]} />;
      case "connector":
        return <cylinderGeometry args={[0.55, 0.55, 2.4, 6]} />;
      case "block":
        return <boxGeometry args={[2.2, 1.5, 2.2]} />;
      case "slab":
        return <boxGeometry args={[2.8, 0.8, 2.8]} />;
      case "lens":
        return <cylinderGeometry args={[1.6, 1.6, 0.75, 24]} />;
      case "plane":
        return <boxGeometry args={[3.0, 2.0, 0.28]} />;
      case "sphere":
        return <icosahedronGeometry args={[1.5, 1]} />;
      default:
        return <coneGeometry args={[1.3, 2.3, 4]} />;
    }
  };

  return (
    <mesh position={position} scale={scale}>
      {geom()}
      <meshStandardMaterial ref={mat} roughness={0.68} metalness={0.05} />
    </mesh>
  );
}

function Edges({ topology, positions, blast, phase, reduced }: any) {
  const edges = useMemo(() => {
    const out: { from: THREE.Vector3; to: THREE.Vector3; up: string; down: string }[] = [];
    for (const d of topology.dependencies) {
      const from = positions.get(d.upstream);
      const to = positions.get(d.downstream);
      if (from && to) out.push({ from, to, up: d.upstream, down: d.downstream });
    }
    return out;
  }, [topology, positions]);

  const lineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts = new Float32Array(edges.length * 6);
    edges.forEach((e: any, i: number) =>
      pts.set([e.from.x, e.from.y, e.from.z, e.to.x, e.to.y, e.to.z], i * 6)
    );
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, [edges]);

  const PER = 3;
  const count = Math.min(edges.length * PER, 600);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const progress = useRef(new Float32Array(count));
  const init = useRef(false);
  const hexes = useRef<Map<string, string>>(new Map());
  const [edgeColor, setEdgeColor] = useState(() => token("edge"));

  useEffect(() => {
    const m = new Map<string, string>();
    (Object.keys(STATE) as HealthState[]).forEach((s) =>
      m.set(s, s === "HEALTHY" ? token("node") : token(STATE[s].varName))
    );
    hexes.current = m;
    setEdgeColor(token("edge"));
  }, []);

  const spec = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        edge: i % Math.max(edges.length, 1),
        offset: (Math.floor(i / Math.max(edges.length, 1)) + 1) / (PER + 1),
        speedVar: 0.85 + ((i * 37) % 30) / 100,
      })),
    [count, edges.length]
  );

  useFrame((s, delta) => {
    const m = mesh.current;
    if (!m || edges.length === 0) return;
    const dt = Math.min(delta, 0.05);
    const t = s.clock.elapsedTime;

    if (!init.current) {
      for (let i = 0; i < count; i++) progress.current[i] = spec[i].offset;
      init.current = true;
    }

    const cache = new Map<string, HealthState>();
    const st = (id: string) => {
      let v = cache.get(id);
      if (v === undefined) {
        v = stateAt(id, phase.current, blast);
        cache.set(id, v);
      }
      return v;
    };

    for (let i = 0; i < count; i++) {
      const sp = spec[i];
      const e = edges[sp.edge];
      const upS = st(e.up);
      const downS = st(e.down);
      const flow = Math.min(STATE[upS].flow, STATE[downS].flow);
      const jitter = Math.max(STATE[upS].jitter, STATE[downS].jitter);

      if (flow > 0 && !reduced) {
        const stutter = jitter > 0 ? 1 + Math.sin(t * 6 + sp.edge) * jitter * 0.7 : 1;
        progress.current[i] += dt * 0.16 * flow * sp.speedVar * Math.max(0.05, stutter);
        if (progress.current[i] > 1) progress.current[i] -= 1;
      }

      const p = progress.current[i];
      dummy.position.lerpVectors(e.from, e.to, p);
      const fade = Math.sin(Math.PI * p);
      dummy.scale.setScalar(Math.max((0.2 + fade * 0.22) * (flow > 0 ? 1 : 0), 0.0001));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);

      const worse = STATE[upS].flow <= STATE[downS].flow ? upS : downS;
      color.set(hexes.current.get(worse) ?? token("node"));
      m.setColorAt(i, color);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial color={edgeColor} transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
      <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(count, 1)]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
