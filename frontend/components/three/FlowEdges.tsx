"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Asset, Dependency, HealthState } from "@/lib/types";
import { STATE } from "@/lib/visual";

/**
 * Directional dependency edges + the data particles that travel along them.
 *
 * This is the product metaphor made literal:
 *   HEALTHY    steady, even flow
 *   DEGRADED   slower, irregular (jittered) flow
 *   STALE      barely moving
 *   FAILED     flow stopped
 *   RECOVERING flow gradually resuming
 *
 * Particles move along ACTUAL upstream->downstream paths — never decorative.
 * All particles live in a single InstancedMesh for one draw call.
 */

const PARTICLES_PER_EDGE = 3;

interface EdgeGeom {
  from: THREE.Vector3;
  to: THREE.Vector3;
  upstream: string;
  downstream: string;
}

export function FlowEdges({
  assets,
  dependencies,
  stateOf,
  tracedIds,
  dimmed,
  reducedMotion,
  maxParticles = 900,
}: {
  assets: Asset[];
  dependencies: Dependency[];
  stateOf: (id: string) => HealthState;
  tracedIds: Set<string>;
  dimmed: boolean;
  reducedMotion: boolean;
  maxParticles?: number;
}) {
  const posById = useMemo(() => {
    const m = new Map<string, THREE.Vector3>();
    for (const a of assets) {
      if (a.position) m.set(a.id, new THREE.Vector3(a.position.x, a.position.y, a.position.z));
    }
    return m;
  }, [assets]);

  const edges = useMemo<EdgeGeom[]>(() => {
    const out: EdgeGeom[] = [];
    for (const d of dependencies) {
      const from = posById.get(d.upstream);
      const to = posById.get(d.downstream);
      if (from && to) out.push({ from, to, upstream: d.upstream, downstream: d.downstream });
    }
    return out;
  }, [dependencies, posById]);

  // ---- static line geometry (one draw call) ------------------------------
  const lineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts = new Float32Array(edges.length * 6);
    const cols = new Float32Array(edges.length * 6);
    edges.forEach((e, i) => {
      pts.set([e.from.x, e.from.y, e.from.z, e.to.x, e.to.y, e.to.z], i * 6);
      cols.set([0.16, 0.2, 0.22, 0.16, 0.2, 0.22], i * 6);
    });
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    return g;
  }, [edges]);

  const lineRef = useRef<THREE.LineSegments>(null);

  // ---- particles ---------------------------------------------------------
  const count = Math.min(edges.length * PARTICLES_PER_EDGE, maxParticles);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Per-particle: which edge, and its phase offset along that edge.
  const spec = useMemo(() => {
    const arr: { edge: number; offset: number; speedVar: number }[] = [];
    for (let i = 0; i < count; i++) {
      const edge = i % edges.length;
      const slot = Math.floor(i / edges.length);
      arr.push({
        edge,
        offset: (slot + 1) / (PARTICLES_PER_EDGE + 1),
        // Deterministic per-particle variation — no Math.random in the loop.
        speedVar: 0.85 + ((i * 37) % 30) / 100,
      });
    }
    return arr;
  }, [count, edges.length]);

  const progress = useRef<Float32Array>(new Float32Array(count));
  const initialized = useRef(false);
  // Per-frame memo for node states. `stateOf` does linear scans, and the
  // particle loop asks for both ends of an edge on every particle — without
  // this we'd run tens of thousands of array scans per frame.
  const stateCache = useRef(new Map<string, HealthState>());

  useFrame((s, delta) => {
    const mesh = meshRef.current;
    if (!mesh || edges.length === 0) return;

    // Clamp delta so a backgrounded tab doesn't teleport every particle.
    const dt = Math.min(delta, 0.05);
    const t = s.clock.elapsedTime;

    // States can change between frames (propagation), so the cache lives for
    // exactly one frame: at most one `stateOf` call per node per frame.
    const cache = stateCache.current;
    cache.clear();
    const cachedState = (id: string): HealthState => {
      let v = cache.get(id);
      if (v === undefined) {
        v = stateOf(id);
        cache.set(id, v);
      }
      return v;
    };

    if (!initialized.current) {
      for (let i = 0; i < count; i++) progress.current[i] = spec[i].offset;
      initialized.current = true;
    }

    for (let i = 0; i < count; i++) {
      const sp = spec[i];
      const e = edges[sp.edge];
      // An edge flows at the rate of its WEAKEST end — a broken producer
      // stops the pipe even if the consumer is nominally fine.
      const upV = STATE[cachedState(e.upstream)];
      const downV = STATE[cachedState(e.downstream)];
      const flow = Math.min(upV.flow, downV.flow);
      const jitter = Math.max(upV.jitter, downV.jitter);

      if (flow > 0 && !reducedMotion) {
        // Irregularity: degraded pipes stutter rather than glide.
        const stutter =
          jitter > 0
            ? 1 + Math.sin(t * 6.1 + sp.edge * 1.7) * jitter * 0.75
            : 1;
        progress.current[i] += dt * 0.16 * flow * sp.speedVar * Math.max(0.05, stutter);
        if (progress.current[i] > 1) progress.current[i] -= 1;
      }

      const p = progress.current[i];
      dummy.position.lerpVectors(e.from, e.to, p);

      // Particles fade at the ends so edges don't look like hard tracks.
      const edgeFade = Math.sin(Math.PI * p);
      const visible = flow > 0 ? 1 : 0;
      const scale = (0.16 + edgeFade * 0.2) * visible * (dimmed ? 0.4 : 1);
      dummy.scale.setScalar(Math.max(scale, 0.0001));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Colour comes from the more severe end of the edge.
      const worse = upV.flow <= downV.flow ? upV : downV;
      color.set(worse.hex);
      const traceBoost =
        tracedIds.size > 0 && (tracedIds.has(e.upstream) || tracedIds.has(e.downstream))
          ? 1.6
          : 1;
      color.multiplyScalar((dimmed ? 0.45 : 1) * traceBoost);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments ref={lineRef} geometry={lineGeom}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={dimmed ? 0.25 : 0.55}
          depthWrite={false}
        />
      </lineSegments>

      <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(count, 1)]}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
