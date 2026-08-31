"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Asset, HealthState } from "@/lib/types";
import { NODE_SHAPE, STATE } from "@/lib/visual";

/**
 * A single topology node.
 *
 * Geometry varies by node type (see DESIGN.md §H) so the system reads as a
 * machine, not a bag of identical spheres. Motion is restrained: failed nodes
 * get a slow, weighted pulse; nothing floats or spins idly.
 */
export function NodeMesh({
  asset,
  state,
  selected,
  hovered,
  dimmed,
  traced,
  onSelect,
  onHover,
  reducedMotion,
}: {
  asset: Asset;
  state: HealthState;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  traced: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);

  const v = STATE[state];
  const pos = asset.position ?? { x: 0, y: 0, z: 0 };
  const shape = NODE_SHAPE[asset.type];
  const isCritical = asset.criticality === "CRITICAL";
  const scale = isCritical ? 1.28 : asset.criticality === "HIGH" ? 1.1 : 0.95;

  useFrame((s) => {
    if (!mat.current) return;
    const t = s.clock.elapsedTime;

    // Emissive intensity: base by state, lifted on hover/selection.
    let target = state === "HEALTHY" ? 0.5 : 0.85;
    if (state === "FAILED" && !reducedMotion) {
      // Slow, weighted breath — communicates "stopped", not "alarm".
      target = 0.7 + Math.sin(t * 1.6) * 0.35;
    } else if (state === "DEGRADED" && !reducedMotion) {
      // Irregular flicker mirrors irregular data flow.
      target = 0.65 + Math.sin(t * 2.7) * 0.18 + Math.sin(t * 5.3) * 0.08;
    } else if (state === "RECOVERING" && !reducedMotion) {
      target = 0.5 + Math.sin(t * 2.0) * 0.25;
    }
    if (selected) target += 0.5;
    else if (hovered) target += 0.28;

    mat.current.emissiveIntensity += (target - mat.current.emissiveIntensity) * 0.14;
    mat.current.opacity += ((dimmed ? 0.22 : 1) - mat.current.opacity) * 0.12;

    if (ring.current) {
      const rs = selected ? 1 : 0;
      ring.current.scale.x += (rs - ring.current.scale.x) * 0.18;
      ring.current.scale.y = ring.current.scale.x;
      ring.current.scale.z = ring.current.scale.x;
      ring.current.rotation.z = reducedMotion ? 0 : t * 0.25;
    }
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
      case "marker":
      default:
        return <coneGeometry args={[1.3, 2.4, 4]} />;
    }
  };

  return (
    <group
      ref={group}
      position={[pos.x, pos.y, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(asset.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(asset.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "auto";
      }}
    >
      <mesh scale={scale} castShadow={false} receiveShadow={false}>
        {geom()}
        <meshStandardMaterial
          ref={mat}
          color={v.dim}
          emissive={v.hex}
          emissiveIntensity={0.5}
          roughness={0.45}
          metalness={0.15}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Selection ring — flat, technical, no glow bloom. */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} scale={0}>
        <ringGeometry args={[2.6, 2.78, 48]} />
        <meshBasicMaterial color={v.hex} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>

      {/* Trace halo when this node is part of a lineage trace. */}
      {traced && !selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.35, 2.45, 40]} />
          <meshBasicMaterial color={v.hex} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
