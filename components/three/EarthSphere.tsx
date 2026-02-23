"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useTexture, Sphere } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

interface EarthSphereProps {
  radius?: number;
  showAtmosphere?: boolean;
  rotationSpeed?: number;
  atmosphereIntensity?: number;
}

// Fresnel atmosphere shader — glows at edges like real atmospheric scattering
const AtmosphereShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    uniform vec3 glowColor;
    uniform float intensity;
    void main() {
      vec3 viewDir = normalize(-vPosition);
      float fresnel = 1.0 - dot(viewDir, vNormal);
      // Steep falloff so glow fades from limb into space, not a solid ring
      fresnel = pow(fresnel, 5.0) * intensity;
      fresnel *= smoothstep(1.0, 0.2, fresnel);
      gl_FragColor = vec4(glowColor, fresnel);
    }
  `,
};

/**
 * Realistic Earth sphere with NASA Blue Marble texture,
 * night lights on dark side, and Fresnel atmosphere glow.
 */
export default function EarthSphere({
  radius = 1,
  showAtmosphere = true,
  rotationSpeed = 0.003,
  atmosphereIntensity = 0.12,
}: EarthSphereProps) {
  const earthRef = useRef<THREE.Mesh>(null);
  const nightRef = useRef<THREE.Mesh>(null);

  // Load textures
  const dayMap = useTexture("/textures/earth_daymap.jpg");
  const nightMap = useTexture("/textures/earth_night.jpg");

  // Slow rotation
  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * rotationSpeed;
    }
    if (nightRef.current) {
      nightRef.current.rotation.y = earthRef.current?.rotation.y ?? 0;
    }
  });

  // Atmosphere — single outer Fresnel glow
  const atmosMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: AtmosphereShader.vertexShader,
        fragmentShader: AtmosphereShader.fragmentShader,
        uniforms: {
          glowColor: { value: new THREE.Color("#4a9ae0") },
          intensity: { value: atmosphereIntensity },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [atmosphereIntensity]
  );

  return (
    <group>
      {/* Earth — day side (lit by scene directional light) */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[radius, 192, 192]} />
        <meshStandardMaterial
          map={dayMap}
          roughness={0.8}
          metalness={0.05}
        />
      </mesh>

      {/* Night lights — emissive layer, visible on dark side */}
      <mesh ref={nightRef}>
        <sphereGeometry args={[radius * 1.001, 192, 192]} />
        <meshBasicMaterial
          map={nightMap}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Fresnel atmosphere glow — single outer layer */}
      {showAtmosphere && (
        <mesh material={atmosMaterial}>
          <sphereGeometry args={[radius * 1.03, 64, 64]} />
        </mesh>
      )}
    </group>
  );
}
