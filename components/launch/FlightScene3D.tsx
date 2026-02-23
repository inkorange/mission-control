"use client";

import { useRef, useMemo, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { useFlightStore } from "@/stores/useFlightStore";
import { useBuilderStore } from "@/stores/useBuilderStore";
import { getEngineById } from "@/engine/data/engines";
import { EARTH_RADIUS, KARMAN_LINE } from "@/engine/physics/constants";
import EarthSphere from "@/components/three/EarthSphere";
import StarField from "@/components/three/StarField";
import type { OrbitalTarget } from "@/types/mission";

// --- Real proportional scale ---
// Earth visual radius is 3 scene units = 6371 km.
// Altitudes map proportionally: 100km = 0.047 units, 400km = 0.188 units.
// The camera stays close to the rocket so these small distances are visible.
const EARTH_VISUAL_R = 3;
const SCALE = EARTH_VISUAL_R / EARTH_RADIUS; // scene units per meter

/** Convert real altitude (meters) to scene-space radius from Earth center */
function altToRadius(alt: number): number {
  return EARTH_VISUAL_R + alt * SCALE;
}

/** Convert simulation position to scene-space 3D position (real scale) */
function simToScene(pos: { x: number; y: number }, altitude: number): THREE.Vector3 {
  const angle = Math.atan2(pos.y, pos.x);
  const r = altToRadius(altitude);
  return new THREE.Vector3(
    Math.cos(angle) * r,
    0,
    -Math.sin(angle) * r
  );
}

// --- Scene sub-components ---

function KarmanRing() {
  const r = altToRadius(KARMAN_LINE);
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r));
    }
    return pts;
  }, [r]);

  return (
    <Line
      points={points}
      color="#4da6ff"
      lineWidth={0.5}
      transparent
      opacity={0.25}
      dashed
      dashSize={0.02}
      gapSize={0.015}
    />
  );
}

function TargetOrbitRing({ targetOrbit }: { targetOrbit: OrbitalTarget }) {
  const apoAlt = useMemo(() => {
    const min = targetOrbit.apoapsis.min;
    const max = targetOrbit.apoapsis.max;
    if (!isFinite(min)) return null;
    return isFinite(max) ? (min + max) / 2 : min;
  }, [targetOrbit]);

  const periAlt = useMemo(() => {
    const min = targetOrbit.periapsis.min;
    const max = targetOrbit.periapsis.max;
    if (!isFinite(min) || !isFinite(max)) return null;
    return (min + max) / 2;
  }, [targetOrbit]);

  const apoR = apoAlt !== null ? altToRadius(apoAlt) : 0;
  const periR = periAlt !== null ? altToRadius(Math.max(0, periAlt)) : apoR;

  const points = useMemo(() => {
    if (apoR <= 0) return null;
    const pts: THREE.Vector3[] = [];
    const a = (apoR + periR) / 2;
    const b = Math.sqrt(apoR * periR);
    const cOffset = (apoR - periR) / 2;
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(theta) * a - cOffset,
        0,
        Math.sin(theta) * b
      ));
    }
    return pts;
  }, [apoR, periR]);

  if (!points) return null;

  return (
    <Line
      points={points}
      color="#00ff88"
      lineWidth={1.5}
      transparent
      opacity={0.4}
      dashed
      dashSize={0.03}
      gapSize={0.02}
    />
  );
}

function CurrentOrbitLine() {
  const { currentOrbit } = useFlightStore();

  const points = useMemo(() => {
    if (!currentOrbit || currentOrbit.eccentricity >= 1 || currentOrbit.semiMajorAxis <= 0) return null;
    const apoR = altToRadius(currentOrbit.apoapsis);
    const periR = altToRadius(Math.max(0, currentOrbit.periapsis));
    const a = (apoR + periR) / 2;
    const b = Math.sqrt(apoR * periR);
    const cOffset = (apoR - periR) / 2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(theta) * a - cOffset,
        0,
        Math.sin(theta) * b
      ));
    }
    return pts;
  }, [currentOrbit]);

  if (!points) return null;

  return (
    <Line
      points={points}
      color="#88ccff"
      lineWidth={1}
      transparent
      opacity={0.4}
    />
  );
}

/** Curved ogive nosecone for flight scene */
function FlightNoseCone({ radius, height, position }: { radius: number; height: number; position: [number, number, number] }) {
  const geometry = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new THREE.Vector2(radius * Math.cos(t * Math.PI / 2), t * height));
    }
    return new THREE.LatheGeometry(pts, 16);
  }, [radius, height]);

  return (
    <mesh position={position} geometry={geometry}>
      <meshPhysicalMaterial color="#e0dcd6" roughness={0.3} metalness={0.05} clearcoat={0.3} />
    </mesh>
  );
}

/** Full rocket model in flight — reads builder stage data, orients along velocity */
function FlightRocketModel() {
  const { currentSnapshot } = useFlightStore();
  const { stages } = useBuilderStore();
  const groupRef = useRef<THREE.Group>(null);

  const stageData = useMemo(() => {
    if (stages.length === 0) return [];
    const rawData = stages.map((stage, i) => {
      let engineMass = 0;
      let engineCount = 0;
      for (const ec of stage.engines) {
        const engine = getEngineById(ec.engineId);
        if (engine) {
          engineMass += engine.mass * ec.count;
          engineCount += ec.count;
        }
      }
      const totalMass = stage.fuelMass + stage.structuralMass + engineMass;
      return { index: i, totalMass, engineCount };
    });
    const maxMass = Math.max(...rawData.map((s) => s.totalMass), 1);
    let y = 0;
    return rawData.map((s) => {
      const widthFactor = s.totalMass / maxMass;
      const height = Math.max(0.3, Math.min(1.2, (s.totalMass / maxMass) * 1.0 + 0.2));
      const yOffset = y + height / 2;
      y += height + 0.06;
      return { ...s, widthFactor, height, yOffset };
    });
  }, [stages]);

  const totalModelHeight = useMemo(() => {
    if (stageData.length === 0) return 1;
    const top = stageData[stageData.length - 1];
    const topRadius = 0.35 * (0.4 + top.widthFactor * 0.6);
    return top.yOffset + top.height / 2 + topRadius * 2;
  }, [stageData]);

  useFrame(() => {
    if (!groupRef.current || !currentSnapshot) return;

    const pos = simToScene(currentSnapshot.position, currentSnapshot.altitude);
    groupRef.current.position.copy(pos);

    // Scale to be visible relative to camera distance
    const altScene = currentSnapshot.altitude * SCALE;
    const desiredHeight = Math.max(0.015, altScene * 0.15 + 0.01);
    groupRef.current.scale.setScalar(desiredHeight / totalModelHeight);

    // Orient rocket: +Y aligns with flight direction (radial + prograde)
    const outward = pos.clone().normalize();
    const prograde = new THREE.Vector3(-outward.z, 0, outward.x);
    const pitchRad = (currentSnapshot.pitchAngle ?? 0) * (Math.PI / 180);
    const rocketUp = new THREE.Vector3()
      .addScaledVector(outward, Math.cos(pitchRad))
      .addScaledVector(prograde, Math.sin(pitchRad))
      .normalize();
    groupRef.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      rocketUp
    );
  });

  if (!currentSnapshot || stageData.length === 0) return null;

  const baseRadius = 0.35;
  const hasFuel = (currentSnapshot.fuel ?? 0) > 0;
  const throttle = currentSnapshot.throttle ?? 0;
  const activeStage = currentSnapshot.currentStage;

  // Only render stages from activeStage upward (lower stages jettisoned)
  let adjY = 0;
  const visible = stageData.slice(activeStage).map((s) => {
    const yOff = adjY + s.height / 2;
    adjY += s.height + 0.06;
    return { ...s, yOffset: yOff };
  });

  return (
    <group ref={groupRef}>
      {visible.map((stage, i) => {
        const r = baseRadius * (0.4 + stage.widthFactor * 0.6);
        const bellR = Math.min(0.09, r * 0.35);
        return (
          <group key={stage.index} position={[0, stage.yOffset, 0]}>
            {/* Stage body */}
            <mesh>
              <cylinderGeometry args={[r, r, stage.height, 16]} />
              <meshPhysicalMaterial color="#e8e4de" roughness={0.3} metalness={0.1} clearcoat={0.3} />
            </mesh>

            {/* Engine bells + exhaust — bottom visible stage only */}
            {i === 0 && stage.engineCount > 0 && (
              <group position={[0, -stage.height / 2, 0]}>
                {Array.from({ length: Math.min(stage.engineCount, 7) }).map((_, ei) => {
                  const a = stage.engineCount === 1
                    ? 0
                    : (ei / Math.min(stage.engineCount, 7)) * Math.PI * 2;
                  const off = stage.engineCount === 1 ? 0 : r * 0.5;
                  return (
                    <group key={ei} position={[Math.sin(a) * off, 0, Math.cos(a) * off]}>
                      {/* Nozzle bell */}
                      <mesh position={[0, -bellR * 1.5, 0]}>
                        <coneGeometry args={[bellR, bellR * 3.5, 12]} />
                        <meshPhysicalMaterial color="#1a1a1a" roughness={0.15} metalness={0.95} />
                      </mesh>
                      {/* Exhaust plume — subtle cone */}
                      {hasFuel && throttle > 0 && (
                        <mesh position={[0, -bellR * 5, 0]}>
                          <coneGeometry args={[bellR * 0.7, bellR * 8, 8]} />
                          <meshBasicMaterial
                            color="#ff8844"
                            transparent
                            opacity={0.2 * throttle}
                            depthWrite={false}
                          />
                        </mesh>
                      )}
                    </group>
                  );
                })}
              </group>
            )}

            {/* Interstage adapter */}
            {i < visible.length - 1 && (
              <mesh position={[0, stage.height / 2 + 0.035, 0]}>
                <cylinderGeometry args={[r * 0.55, r * 0.98, 0.07, 16]} />
                <meshPhysicalMaterial color="#888" roughness={0.3} metalness={0.6} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Curved nosecone */}
      {visible.length > 0 && (() => {
        const top = visible[visible.length - 1];
        const topR = baseRadius * (0.4 + top.widthFactor * 0.6);
        return (
          <FlightNoseCone
            radius={topR}
            height={topR * 2}
            position={[0, top.yOffset + top.height / 2, 0]}
          />
        );
      })()}

      {/* Subtle exhaust light */}
      {hasFuel && throttle > 0 && (
        <pointLight
          color="#ff7744"
          intensity={0.3 * throttle}
          distance={0.4}
          decay={2}
          position={[0, -0.1, 0]}
        />
      )}
    </group>
  );
}

/** Trajectory trail */
function TrajectoryTrail() {
  const { currentSnapshot } = useFlightStore();
  const trailRef = useRef<THREE.Vector3[]>([]);
  const lastTimeRef = useRef(-1);

  if (currentSnapshot && currentSnapshot.time !== lastTimeRef.current) {
    const timeDiff = currentSnapshot.time - lastTimeRef.current;
    if (lastTimeRef.current < 0 || timeDiff >= 0.5) {
      const pt = simToScene(currentSnapshot.position, currentSnapshot.altitude);
      trailRef.current.push(pt);
      if (trailRef.current.length > 1000) {
        trailRef.current = trailRef.current.slice(-800);
      }
      lastTimeRef.current = currentSnapshot.time;
    }
  }

  if (trailRef.current.length < 2) return null;

  return (
    <Line
      points={trailRef.current}
      color="#ff8855"
      lineWidth={2}
      transparent
      opacity={0.8}
    />
  );
}

/** Camera: close to rocket, Earth's curvature fills background */
function FollowCamera() {
  const { currentSnapshot } = useFlightStore();
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 3, 5));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    if (!currentSnapshot) {
      // Pre-launch: view of Earth from a moderate distance
      targetPos.current.set(0, 3, 5);
      targetLookAt.current.set(0, 0, 0);
    } else {
      const rocketPos = simToScene(currentSnapshot.position, currentSnapshot.altitude);
      const altScene = currentSnapshot.altitude * SCALE; // altitude in scene units

      // Camera distance from rocket scales with altitude:
      // At ground level: very close (~0.1 units)
      // At 400km (~0.19 units above surface): pull back to ~0.5 units
      // At higher altitudes: continue pulling back proportionally
      const camDist = Math.max(0.08, altScene * 2.5 + 0.05);

      // Position camera outward from Earth center (same radial direction as rocket)
      // and slightly "above" the orbital plane (Y-up)
      const outward = rocketPos.clone().normalize();
      targetPos.current.copy(rocketPos)
        .add(outward.clone().multiplyScalar(camDist * 0.5))
        .add(new THREE.Vector3(0, camDist * 0.7, 0));

      // Look at the rocket
      targetLookAt.current.copy(rocketPos);
    }

    camera.position.lerp(targetPos.current, 0.04);
    camera.lookAt(targetLookAt.current);
  });

  return null;
}

// --- Inner 3D scene ---

function FlightSceneInner({ targetOrbit }: { targetOrbit?: OrbitalTarget }) {
  return (
    <>
      {/* Sun — strong directional from upper-right, warm white */}
      <directionalLight position={[15, 10, 12]} intensity={3} color="#fff5e0" />
      {/* Fill — softer from opposite side */}
      <directionalLight position={[-8, 3, -6]} intensity={0.5} color="#aaccff" />
      {/* Ambient — keep dark side slightly visible */}
      <ambientLight intensity={0.15} color="#ffffff" />

      <StarField radius={50} />
      <EarthSphere radius={EARTH_VISUAL_R} showAtmosphere rotationSpeed={0.002} atmosphereIntensity={0.04} />
      <KarmanRing />

      {targetOrbit && <TargetOrbitRing targetOrbit={targetOrbit} />}
      <CurrentOrbitLine />
      <TrajectoryTrail />
      <FlightRocketModel />

      <FollowCamera />

      {/* Post-processing */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.8}
          luminanceSmoothing={0.3}
          intensity={0.4}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.1} darkness={0.5} />
      </EffectComposer>
    </>
  );
}

// --- Main export ---

interface FlightScene3DProps {
  targetOrbit?: OrbitalTarget;
}

export default function FlightScene3D({ targetOrbit }: FlightScene3DProps) {
  const [sceneReady, setSceneReady] = useState(false);

  return (
    <div className="w-full h-full bg-[#020510] relative">
      {!sceneReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#020510]">
          <p className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--muted)] animate-pulse">
            Initializing flight systems...
          </p>
        </div>
      )}
      <Canvas
        camera={{ fov: 50, near: 0.001, far: 200, position: [0, 3, 5] }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        onCreated={() => setSceneReady(true)}
      >
        <Suspense fallback={null}>
          <FlightSceneInner targetOrbit={targetOrbit} />
        </Suspense>
      </Canvas>
    </div>
  );
}
