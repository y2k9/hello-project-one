"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

const ENERGY = 0.7;
const VALENCE = 0.6;
const POPULARITY = 0.3;
const RANGE = 0.8;
const DEPTH = 0.5;

const POINTS = 120;
const HEIGHT = 10;

function valenceToColor(): THREE.Color {
  const offbeat = 1 - POPULARITY;
  const saturation = 0.3 + offbeat * 0.7;
  // hue: valence 0 → blue (0.667), 0.5 → purple (0.778), 1 → orange (0.083)
  let hue: number;
  if (VALENCE <= 0.5) {
    hue = THREE.MathUtils.lerp(0.667, 0.778, VALENCE * 2);
  } else {
    hue = THREE.MathUtils.lerp(0.778, 1.083, (VALENCE - 0.5) * 2);
    if (hue > 1) hue -= 1;
  }
  return new THREE.Color().setHSL(hue, saturation, 0.6);
}

function Helix() {
  const color = useMemo(() => valenceToColor(), []);
  const baseRadius = 0.8 + ENERGY * 1.2;
  const rungCount = Math.round(40 + DEPTH * 80);

  const { geo1, geo2, rungGeos } = useMemo(() => {
    const s1: THREE.Vector3[] = [];
    const s2: THREE.Vector3[] = [];

    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      const y = (t - 0.5) * HEIGHT;
      const angle = t * Math.PI * 8;
      const r = baseRadius * (1 + RANGE * 0.2 * Math.sin(i));
      s1.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
      s2.push(new THREE.Vector3(Math.cos(angle + Math.PI) * r, y, Math.sin(angle + Math.PI) * r));
    }

    const geo1 = new THREE.BufferGeometry().setFromPoints(
      new THREE.CatmullRomCurve3(s1).getPoints(400)
    );
    const geo2 = new THREE.BufferGeometry().setFromPoints(
      new THREE.CatmullRomCurve3(s2).getPoints(400)
    );

    const rungGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < rungCount; i++) {
      const idx = Math.floor((i / rungCount) * (POINTS - 1));
      rungGeos.push(new THREE.BufferGeometry().setFromPoints([s1[idx], s2[idx]]));
    }

    return { geo1, geo2, rungGeos };
  }, [baseRadius, rungCount]);

  return (
    <>
      {/* @ts-expect-error R3F line element */}
      <line geometry={geo1}>
        <lineBasicMaterial color={color} />
      </line>
      {/* @ts-expect-error R3F line element */}
      <line geometry={geo2}>
        <lineBasicMaterial color={color} />
      </line>
      {rungGeos.map((geo, i) => (
        // @ts-expect-error R3F line element
        <line key={i} geometry={geo}>
          <lineBasicMaterial color={color} transparent opacity={0.4} />
        </line>
      ))}
    </>
  );
}

export default function DNAPage() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0b0b0f" }}>
      <Canvas camera={{ position: [0, 0, 12], fov: 50 }}>
        <Helix />
      </Canvas>
    </div>
  );
}
