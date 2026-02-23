"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import EarthSphere from "./EarthSphere";
import StarField from "./StarField";

function Scene() {
  return (
    <>
      {/* Dim sunlight — keeps Earth moody so it doesn't overpower UI */}
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#ffeedd" />
      <ambientLight intensity={0.05} />

      {/* Earth — zoomed in, positioned to show a partial globe in lower-right */}
      <group position={[1.2, -1.8, 0]}>
        <EarthSphere radius={3} rotationSpeed={0.008} showAtmosphere />
      </group>

      <StarField radius={60} />
    </>
  );
}

/**
 * Fullscreen 3D Earth background for the homepage.
 * Renders behind page content via fixed positioning + low z-index.
 */
export default function EarthBackground() {
  return (
    <div className="fixed inset-0 top-[84px] z-0">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
        style={{ background: "#000000" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      {/* Subtle dark overlay — kept light so backdrop-filter on cards can blur the 3D scene */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
    </div>
  );
}
