"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Asset, Dependency, HealthState } from "@/lib/types";
import { token } from "@/lib/mode";
import { STATE } from "@/lib/visual";

/**
 * Dependency edges and the data particles travelling along them.
 *
 * This is the one animation that always earns its place: particles move along
 * ACTUAL upstream→downstream paths, and their behaviour *is* the product's
 * state language.
 *
 *   HEALTHY    steady, even flow        DEGRADED   slower, stuttering
 *   STALE      barely moving            FAILED     stopped
 *   RECOVERING gradually resuming
 *
 * All particles live in one InstancedMesh — a single draw call.
 */
const PARTICLES_PER_EDGE = 3;

export function FlowEdges({
  assets,
  dependencies,
  stateOf,
  tracedIds,
  reducedMotion,
  modeKey,
  maxParticles = 900,
}: {
  assets: Asset[];
  dependencies: Dependency[];
  stateOf: (id: string) => HealthState;
  tracedIds: Set<string>;
  reducedMotion: boolean;
  modeKey: string;
  maxParticles?: number;
}) {
  const posById = useMemo(() => {
    const m = new Map<string, THREE.Vector3>();
    for (const a of assets) {
      if (a.position) m.set(a.id, new THREE.Vector3(a.position.x, a.position.y, a.position.z));
    }
    return m;
  }, [assets]);

  const edges = useMemo(() => {
    const out: { from: THREE.Vector3; to: THREE.Vector3; up: string; down: string }[] = [];
    for (const d of dependencies) {
      const from = posById.get(d.upstream);
      const to = posById.get(d.downstream);
      if (from && to) out.push({ from, to, up: d.upstream, down: d.downstream });
    }
    return out;
  }, [dependencies, posById]);

  // Edge + node colours come from design tokens, re-resolved on mode change.
  const [palette, setPalette] = useState(() => ({
    edge: token("edge"),
    node: token("node"),
  }));
  useEffect(() => {
    setPalette({ edge: token("edge"), node: token("node") });
  }, [modeKey]);

  const lineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts = new Float32Array(edges.length * 6);
    edges.forEach((e, i) =>
      pts.set([e.from.x, e.from.y, e.from.z, e.to.x, e.to.y, e.to.z], i * 6)
    );
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, [edges]);

  const count = Math.min(edges.length * PARTICLES_PER_EDGE, maxParticles);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const spec = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        edge: i % Math.max(edges.length, 1),
        offset: (Math.floor(i / Math.max(edges.length, 1)) + 1) / (PARTICLES_PER_EDGE + 1),
        // Deterministic per-particle variation — never Math.random in a loop.
        speedVar: 0.85 + ((i * 37) % 30) / 100,
      })),
    [count, edges.length]
  );

  const progress = useRef<Float32Array>(new Float32Array(count));
  const initialized = useRef(false);
  // Per-frame memo: `stateOf` is asked for both ends of every particle's edge,
  // so without this we'd run tens of thousands of lookups per frame.
  const stateCache = useRef(new Map<string, HealthState>());
  const hexCache = useRef(new Map<string, string>());

  // Colour per state, resolved once per mode rather than per particle.
  useEffect(() => {
    const m = new Map<string, string>();
    (Object.keys(STATE) as HealthState[]).forEach((s) => {
      m.set(s, s === "HEALTHY" ? token("node") : token(STATE[s].varName));
    });
    hexCache.current = m;
  }, [modeKey]);

  useFrame((s, delta) => {
    const mesh = meshRef.current;
    if (!mesh || edges.length === 0) return;

    const dt = Math.min(delta, 0.05);
    const t = s.clock.elapsedTime;

    const cache = stateCache.current;
    cache.clear();
    const stateFor = (id: string): HealthState => {
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
      const upState = stateFor(e.up);
      const downState = stateFor(e.down);
      const upV = STATE[upState];
      const downV = STATE[downState];

      // An edge flows at the rate of its WEAKEST end — a broken producer stops
      // the pipe even when the consumer is nominally fine.
      const flow = Math.min(upV.flow, downV.flow);
      const jitter = Math.max(upV.jitter, downV.jitter);

      if (flow > 0 && !reducedMotion) {
        const stutter =
          jitter > 0 ? 1 + Math.sin(t * 6.1 + sp.edge * 1.7) * jitter * 0.75 : 1;
        progress.current[i] += dt * 0.16 * flow * sp.speedVar * Math.max(0.05, stutter);
        if (progress.current[i] > 1) progress.current[i] -= 1;
      }

      const p = progress.current[i];
      dummy.position.lerpVectors(e.from, e.to, p);

      const fade = Math.sin(Math.PI * p);
      const inTrace =
        tracedIds.size === 0 || tracedIds.has(e.up) || tracedIds.has(e.down);
      const scale = (0.28 + fade * 0.3) * (flow > 0 ? 1 : 0) * (inTrace ? 1 : 0.35);
      dummy.scale.setScalar(Math.max(scale, 0.0001));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Colour comes from the more severe end of the edge.
      const worse = upV.flow <= downV.flow ? upState : downState;
      color.set(hexCache.current.get(worse) ?? palette.node);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments ref={lineRef} geometry={lineGeom}>
        <lineBasicMaterial
          color={palette.edge}
          transparent
          opacity={1}
          depthWrite={false}
        />
      </lineSegments>

      <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(count, 1)]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
