"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Asset, HealthState } from "@/lib/types";
import { token } from "@/lib/mode";
import { NODE_SHAPE, STATE } from "@/lib/visual";

/**
 * A topology node — a matte solid, lit rather than glowing.
 *
 * State is carried by the material's COLOUR, never by emission, so a failing
 * node reads as *marked* rather than *illuminated*. Healthy nodes take the
 * neutral `--node` token so a healthy system renders as calm graphite and only
 * problems introduce hue.
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
  modeKey,
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
  /** Changes when the environment mode flips, so colours are re-resolved. */
  modeKey: string;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const target = useMemo(() => new THREE.Color(), []);

  const pos = asset.position ?? { x: 0, y: 0, z: 0 };
  const shape = NODE_SHAPE[asset.type];
  // Larger overall, with more separation between tiers — at a diagram-like
  // camera distance the previous sizes read as indistinct specks.
  const baseScale =
    asset.criticality === "CRITICAL" ? 1.5 : asset.criticality === "HIGH" ? 1.28 : 1.08;

  // Resolve the state colour from CSS variables so both modes stay in sync
  // with the design system rather than duplicating hex values here.
  // These components are client-only (dynamic, ssr:false), so tokens can be
  // resolved immediately rather than seeded with hard-coded fallbacks.
  const [colors, setColors] = useState(() => ({
    node: token("node"),
    ring: token("text-primary"),
  }));
  useEffect(() => {
    setColors({ node: token("node"), ring: token("text-primary") });
  }, [modeKey]);

  const stateHex =
    state === "HEALTHY" ? colors.node : token(STATE[state].varName);

  useFrame((s) => {
    if (!mat.current || !mesh.current) return;
    const t = s.clock.elapsedTime;

    target.set(stateHex);
    mat.current.color.lerp(target, reducedMotion ? 1 : 0.12);
    mat.current.opacity += ((dimmed ? 0.2 : 1) - mat.current.opacity) * 0.12;

    // A failed node settles very slightly in SCALE — physical, not an alarm.
    let scale = baseScale;
    if (selected) scale *= 1.12;
    else if (hovered) scale *= 1.06;
    if (state === "FAILED" && !reducedMotion) scale *= 1 + Math.sin(t * 1.4) * 0.025;

    mesh.current.scale.lerp(
      new THREE.Vector3(scale, scale, scale),
      reducedMotion ? 1 : 0.16
    );

    if (ring.current) {
      const rs = selected ? 1 : 0;
      ring.current.scale.x += (rs - ring.current.scale.x) * 0.2;
      ring.current.scale.y = ring.current.scale.x;
      ring.current.scale.z = ring.current.scale.x;
    }
  });

  const geom = () => {
    switch (shape) {
      case "octahedron":
        return <octahedronGeometry args={[2.4, 0]} />;
      case "connector":
        return <cylinderGeometry args={[0.8, 0.8, 3.4, 6]} />;
      case "block":
        return <boxGeometry args={[3.1, 2.1, 3.1]} />;
      case "slab":
        return <boxGeometry args={[3.9, 1.1, 3.9]} />;
      case "lens":
        return <cylinderGeometry args={[2.25, 2.25, 1.05, 24]} />;
      case "plane":
        return <boxGeometry args={[4.2, 2.8, 0.4]} />;
      case "sphere":
        return <icosahedronGeometry args={[2.1, 1]} />;
      case "marker":
      default:
        return <coneGeometry args={[1.85, 3.2, 4]} />;
    }
  };

  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(asset.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(asset.id);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh ref={mesh} castShadow receiveShadow>
        {geom()}
        <meshStandardMaterial
          ref={mat}
          color={stateHex}
          roughness={0.42}
          metalness={0.12}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Selection: a thin drawn ring on the ground plane. */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} scale={0} position={[0, -3.0, 0]}>
        <ringGeometry args={[3.4, 3.55, 64]} />
        <meshBasicMaterial
          color={colors.ring}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {traced && !selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.0, 0]}>
          <ringGeometry args={[3.15, 3.25, 48]} />
          <meshBasicMaterial
            color={colors.ring}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
