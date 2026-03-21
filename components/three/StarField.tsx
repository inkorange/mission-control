"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";

interface StarFieldProps {
  radius?: number;
}

/**
 * Star field rendered as a textured skybox sphere.
 * Uses /textures/stars.jpg mapped onto the inside of a large sphere.
 * Follows the camera so the stars are always surrounding the viewpoint.
 */
export default function StarField({ radius = 50 }: StarFieldProps) {
  const starsMap = useTexture("/textures/stars.jpg");
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshBasicMaterial
        map={starsMap}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
