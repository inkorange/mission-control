"use client";

import * as THREE from "three";
import { useTexture } from "@react-three/drei";

interface StarFieldProps {
  radius?: number;
}

/**
 * Star field rendered as a textured skybox sphere.
 * Uses /textures/stars.jpg mapped onto the inside of a large sphere.
 */
export default function StarField({ radius = 50 }: StarFieldProps) {
  const starsMap = useTexture("/textures/stars.jpg");

  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshBasicMaterial
        map={starsMap}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
