"use client";

import { useRef, useMemo, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, Html, useTexture } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { useFlightStore } from "@/stores/useFlightStore";
import { useBuilderStore } from "@/stores/useBuilderStore";
import { getEngineById } from "@/engine/data/engines";
import { EARTH_RADIUS, KARMAN_LINE, MOON_RADIUS } from "@/engine/physics/constants";
import { getActiveBodies, getBodyPosition } from "@/engine/physics/bodies";
import type { CelestialBody } from "@/engine/physics/bodies";
import EarthSphere from "@/components/three/EarthSphere";
import StarField from "@/components/three/StarField";
import type { OrbitalTarget, MissionTier } from "@/types/mission";
import type { Mission } from "@/types/mission";

// --- Real proportional scale ---
// Earth visual radius is 3 scene units = 6371 km.
// Altitudes map proportionally: 100km = 0.047 units, 400km = 0.188 units.
// The camera stays close to the rocket so these small distances are visible.
const EARTH_VISUAL_R = 3;
const SCALE = EARTH_VISUAL_R / EARTH_RADIUS; // scene units per meter

// --- Cape Canaveral launch site (28.5°N, 80.6°W) ---
const ORBITAL_PLANE_Q = (() => {
  const latRad = 28.5 * (Math.PI / 180);
  const lonRad = -80.6 * (Math.PI / 180);
  const qLat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    latRad
  );
  const qLon = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    lonRad
  );
  return new THREE.Quaternion().multiplyQuaternions(qLon, qLat);
})();

/** Convert real altitude (meters) to scene-space radius from Earth center */
function altToRadius(alt: number): number {
  return EARTH_VISUAL_R + alt * SCALE;
}

/** Convert simulation position to local orbital-plane 3D position */
function simToScene(pos: { x: number; y: number }, altitude: number): THREE.Vector3 {
  const angle = Math.atan2(pos.y, pos.x);
  const r = altToRadius(altitude);
  return new THREE.Vector3(
    Math.cos(angle) * r,
    0,
    -Math.sin(angle) * r
  );
}

/** Convert simulation position (meters from Earth center) to scene-space 3D in orbital plane */
function simPosToScene(pos: { x: number; y: number }): THREE.Vector3 {
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
  const alt = r - EARTH_RADIUS;
  return simToScene(pos, alt);
}

/** Convert simulation position to world-space 3D (with orbital plane rotation) */
function simToWorld(pos: { x: number; y: number }, altitude: number): THREE.Vector3 {
  return simToScene(pos, altitude).applyQuaternion(ORBITAL_PLANE_Q);
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

/** Render the Moon as a textured sphere at its computed position */
function MoonBody({ simTime }: { simTime: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { currentSnapshot } = useFlightStore();
  const moonTexture = useTexture("/textures/moon.jpg");

  useFrame(() => {
    if (!meshRef.current) return;
    const time = currentSnapshot?.time ?? simTime;
    const moonBody = getActiveBodies({ tier: 3 } as Mission).find((b) => b.id === "moon");
    if (!moonBody) return;
    const moonPos = getBodyPosition(moonBody, time);
    const scenePos = simPosToScene(moonPos);
    meshRef.current.position.copy(scenePos);
  });

  const moonVisualR = MOON_RADIUS * SCALE; // ~0.82 scene units

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[moonVisualR, 64, 64]} />
        <meshStandardMaterial map={moonTexture} roughness={0.95} metalness={0.05} />
      </mesh>
    </group>
  );
}

/** SOI boundary ring for a body */
function SOIRing({ body, simTime }: { body: CelestialBody; simTime: number }) {
  const { currentSnapshot } = useFlightStore();
  const groupRef = useRef<THREE.Group>(null);

  const soiSceneR = body.soiRadius * SCALE;

  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta) * soiSceneR, 0, Math.sin(theta) * soiSceneR));
    }
    return pts;
  }, [soiSceneR]);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = currentSnapshot?.time ?? simTime;
    const bodyPos = getBodyPosition(body, time);
    const scenePos = simPosToScene(bodyPos);
    groupRef.current.position.copy(scenePos);
  });

  return (
    <group ref={groupRef}>
      <Line
        points={points}
        color="#ffcc44"
        lineWidth={0.5}
        transparent
        opacity={0.15}
        dashed
        dashSize={soiSceneR * 0.03}
        gapSize={soiSceneR * 0.02}
      />
    </group>
  );
}

/** Distant body marker (for Mars, Jupiter, Saturn — too far to render at scale) */
function DistantBodyMarker({ body, simTime }: { body: CelestialBody; simTime: number }) {
  const { currentSnapshot } = useFlightStore();
  const markerRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!markerRef.current) return;
    const time = currentSnapshot?.time ?? simTime;
    const bodyPos = getBodyPosition(body, time);
    // Show as a direction indicator at a fixed distance from Earth
    const dist = Math.sqrt(bodyPos.x * bodyPos.x + bodyPos.y * bodyPos.y);
    const dir = { x: bodyPos.x / dist, y: bodyPos.y / dist };
    // Place marker at 30 scene units from Earth (visual indicator, not to scale)
    const markerDist = 30;
    const angle = Math.atan2(dir.y, dir.x);
    markerRef.current.position.set(
      Math.cos(angle) * markerDist,
      0,
      -Math.sin(angle) * markerDist
    );
  });

  const colors: Record<string, string> = {
    mars: "#e06040",
    jupiter: "#d4a060",
    saturn: "#e0d080",
  };

  return (
    <group ref={markerRef}>
      <mesh>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={colors[body.id] ?? "#ffffff"} />
      </mesh>
      <Html center distanceFactor={15} style={{ pointerEvents: "none" }}>
        <div className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-white/60 whitespace-nowrap">
          {body.name}
        </div>
      </Html>
    </group>
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

/** A single jettisoned stage that drifts and tumbles away */
interface JettisonedStageData {
  id: number;
  spawnTime: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
  radius: number;
  height: number;
  engineCount: number;
  // Drift direction in world space (downward + slight sideways)
  driftDir: THREE.Vector3;
  // Random tumble axis
  tumbleAxis: THREE.Vector3;
  tumbleSpeed: number;
}

let jettisonCounter = 0;

function JettisonedStage({ data }: { data: JettisonedStageData }) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const bellR = Math.min(0.09, data.radius * 0.35);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    elapsed.current += delta;
    const t = elapsed.current;

    // Drift away: accelerating slightly (gravity pull)
    const driftDist = t * 0.4 + t * t * 0.15;
    groupRef.current.position.copy(data.position)
      .addScaledVector(data.driftDir, driftDist * data.scale);

    // Tumble rotation
    const tumbleQuat = new THREE.Quaternion().setFromAxisAngle(
      data.tumbleAxis,
      t * data.tumbleSpeed
    );
    groupRef.current.quaternion.copy(data.quaternion).multiply(tumbleQuat);

    groupRef.current.scale.setScalar(data.scale);

    // Fade out via children opacity
    const opacity = Math.max(0, 1 - t / 5);
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial;
        if (!mat.transparent) {
          mat.transparent = true;
          mat.depthWrite = false;
        }
        mat.opacity = opacity;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {/* Stage body */}
      <mesh>
        <cylinderGeometry args={[data.radius, data.radius, data.height, 16]} />
        <meshPhysicalMaterial color="#e8e4de" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Engine bells */}
      {data.engineCount > 0 && (
        <group position={[0, -data.height / 2, 0]}>
          {Array.from({ length: Math.min(data.engineCount, 7) }).map((_, ei) => {
            const a = data.engineCount === 1
              ? 0
              : (ei / Math.min(data.engineCount, 7)) * Math.PI * 2;
            const off = data.engineCount === 1 ? 0 : data.radius * 0.5;
            return (
              <mesh key={ei} position={[Math.sin(a) * off, -bellR * 1.5, Math.cos(a) * off]}>
                <coneGeometry args={[bellR, bellR * 3.5, 12]} />
                <meshPhysicalMaterial color="#1a1a1a" roughness={0.15} metalness={0.95} />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}

function JettisonedStages() {
  const { currentSnapshot } = useFlightStore();
  const { stages } = useBuilderStore();
  const prevStage = useRef(-1);
  const [jettisoned, setJettisoned] = useState<JettisonedStageData[]>([]);

  // Compute stageData locally (same logic as FlightRocketModel)
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

  useFrame(() => {
    if (!currentSnapshot) return;
    const activeStage = currentSnapshot.currentStage;

    // Detect stage change
    if (prevStage.current >= 0 && activeStage > prevStage.current) {
      const droppedIndex = prevStage.current;
      const dropped = stageData[droppedIndex];
      if (dropped) {
        const baseRadius = 0.35;
        const r = baseRadius * (0.4 + dropped.widthFactor * 0.6);

        // Get rocket's current world position and orientation
        const pos = simToScene(currentSnapshot.position, currentSnapshot.altitude);
        const altScene = currentSnapshot.altitude * SCALE;
        const totalModelH = stageData.length > 0
          ? stageData[stageData.length - 1].yOffset + stageData[stageData.length - 1].height / 2
          : 1;
        const scale = Math.max(0.015, altScene * 0.15 + 0.01) / Math.max(totalModelH, 1);

        // Rocket orientation
        const outward = pos.clone().normalize();
        const prograde = new THREE.Vector3(-outward.z, 0, outward.x);
        const pitchRad = (currentSnapshot.pitchAngle ?? 0) * (Math.PI / 180);
        const rocketUp = new THREE.Vector3()
          .addScaledVector(outward, Math.cos(pitchRad))
          .addScaledVector(prograde, Math.sin(pitchRad))
          .normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          rocketUp
        );

        // Spawn position: offset along rocket axis to the dropped stage's actual position
        const stageWorldPos = pos.clone().addScaledVector(rocketUp, dropped.yOffset * scale);

        // Drift direction: opposite to rocket heading + slight random sideways
        const driftDir = rocketUp.clone().negate();
        const side = new THREE.Vector3().crossVectors(rocketUp, outward).normalize();
        driftDir.addScaledVector(side, (Math.random() - 0.5) * 0.4).normalize();

        // Random tumble
        const tumbleAxis = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();

        const newEntry: JettisonedStageData = {
          id: ++jettisonCounter,
          spawnTime: currentSnapshot.time,
          position: stageWorldPos,
          quaternion: quat.clone(),
          scale,
          radius: r,
          height: dropped.height,
          engineCount: dropped.engineCount,
          driftDir,
          tumbleAxis,
          tumbleSpeed: 1.5 + Math.random() * 2,
        };
        setJettisoned((prev) => [...prev, newEntry]);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          setJettisoned((prev) => prev.filter((j) => j.id !== newEntry.id));
        }, 5000);
      }
    }
    prevStage.current = activeStage;
  });

  return (
    <>
      {jettisoned.map((j) => (
        <JettisonedStage key={j.id} data={j} />
      ))}
    </>
  );
}

/** Full rocket model in flight — reads builder stage data, orients along velocity */
function FlightRocketModel() {
  const { currentSnapshot } = useFlightStore();
  const { stages } = useBuilderStore();
  const groupRef = useRef<THREE.Group>(null);
  const currentQuat = useRef(new THREE.Quaternion());

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

    // Scale to be visible relative to camera distance
    const altScene = currentSnapshot.altitude * SCALE;
    const desiredHeight = Math.max(0.015, altScene * 0.15 + 0.01);
    const scale = desiredHeight / totalModelHeight;
    groupRef.current.scale.setScalar(scale);

    // Offset position so the bottom of the rocket sits on the surface point,
    // not the center of the model
    const outwardDir = pos.clone().normalize();
    const bottomOffset = stageData.length > 0 ? stageData[0].yOffset - stageData[0].height / 2 : 0;
    const halfHeight = (totalModelHeight / 2 - bottomOffset) * scale;
    groupRef.current.position.copy(pos).addScaledVector(outwardDir, halfHeight);

    // Orient rocket: +Y aligns with flight direction (radial + prograde)
    const outward = pos.clone().normalize();
    const prograde = new THREE.Vector3(-outward.z, 0, outward.x);
    const pitchRad = (currentSnapshot.pitchAngle ?? 0) * (Math.PI / 180);
    const rocketUp = new THREE.Vector3()
      .addScaledVector(outward, Math.cos(pitchRad))
      .addScaledVector(prograde, Math.sin(pitchRad))
      .normalize();
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      rocketUp
    );
    currentQuat.current.slerp(targetQuat, 0.06);
    groupRef.current.quaternion.copy(currentQuat.current);
  });

  if (!currentSnapshot || stageData.length === 0) return null;

  const baseRadius = 0.35;
  const hasFuel = (currentSnapshot.fuel ?? 0) > 0;
  const throttle = currentSnapshot.throttle ?? 0;
  const activeStage = currentSnapshot.currentStage;

  // Only render stages from activeStage upward — keep original Y offsets
  // so the rocket doesn't shift position when stages are jettisoned
  const visible = stageData.slice(activeStage);

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
function FollowCamera({ missionTier }: { missionTier: number }) {
  const { currentSnapshot } = useFlightStore();
  const { camera, gl } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 3, 5));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const orbitAngle = useRef({ theta: 0, phi: 0.3 }); // spherical angles around rocket
  const userHasRotated = useRef(false); // true once user drags — disables auto-camera

  // Mouse/touch handlers for camera rotation (always active during flight)
  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: MouseEvent) => {
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = (e.clientX - dragStart.current.x) * 0.005;
      const dy = (e.clientY - dragStart.current.y) * 0.005;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        userHasRotated.current = true;
      }
      orbitAngle.current.theta += dx;
      orbitAngle.current.phi = Math.max(-1.2, Math.min(1.2, orbitAngle.current.phi + dy));
      dragStart.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => { isDragging.current = false; };
    // Double-click resets to auto-camera
    const onDblClick = () => {
      userHasRotated.current = false;
      orbitAngle.current.theta = 0;
      orbitAngle.current.phi = 0.3;
    };
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onUp);
    canvas.addEventListener("dblclick", onDblClick);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onUp);
      canvas.removeEventListener("dblclick", onDblClick);
    };
  }, [gl]);

  useFrame(() => {
    if (!currentSnapshot) {
      // Pre-launch: position camera to see Cape Canaveral launch site
      const launchPoint = new THREE.Vector3(EARTH_VISUAL_R, 0, 0)
        .applyQuaternion(ORBITAL_PLANE_Q);
      const outward = launchPoint.clone().normalize();
      targetPos.current.copy(launchPoint)
        .add(outward.clone().multiplyScalar(1.5))
        .add(new THREE.Vector3(0, 1.5, 0));
      targetLookAt.current.copy(launchPoint).multiplyScalar(0.8);
    } else {
      // Flight: follow rocket in world space
      const rocketPos = simToWorld(currentSnapshot.position, currentSnapshot.altitude);
      const altScene = currentSnapshot.altitude * SCALE;

      // Compute camera distance based on altitude
      const deepSpaceThreshold = 50_000_000 * SCALE; // 50,000 km
      const isDeepSpace = altScene > deepSpaceThreshold && missionTier >= 3;

      const camDist = isDeepSpace
        ? Math.max(5, Math.log10(altScene) * 8)
        : Math.max(0.08, altScene * 2.5 + 0.05);

      if (userHasRotated.current) {
        // User-controlled orbit: spherical coordinates centered on rocket
        const { theta, phi } = orbitAngle.current;
        const camOffset = new THREE.Vector3(
          Math.cos(phi) * Math.sin(theta) * camDist,
          Math.sin(phi) * camDist,
          Math.cos(phi) * Math.cos(theta) * camDist
        );
        targetPos.current.copy(rocketPos).add(camOffset);
      } else {
        // Auto-camera: offset from rocket using outward + up direction
        const outward = rocketPos.clone().normalize();
        targetPos.current.copy(rocketPos)
          .add(outward.clone().multiplyScalar(camDist * 0.5))
          .add(new THREE.Vector3(0, camDist * 0.7, 0));
      }

      targetLookAt.current.copy(rocketPos);
    }

    camera.position.lerp(targetPos.current, 0.04);
    camera.lookAt(targetLookAt.current);
  });

  return null;
}

// --- Inner 3D scene ---

function FlightSceneInner({ targetOrbit, mission }: { targetOrbit?: OrbitalTarget; mission?: Mission }) {
  const { currentSnapshot } = useFlightStore();
  const activeBodies = useMemo(() => {
    if (!mission) return [];
    return getActiveBodies(mission);
  }, [mission]);

  const moonBody = activeBodies.find((b) => b.id === "moon");
  const distantBodies = activeBodies.filter((b) => b.parentBody === "sun");

  return (
    <>
      {/* Sun — strong directional from upper-right, warm white */}
      <directionalLight position={[15, 10, 12]} intensity={3} color="#fff5e0" />
      {/* Fill — softer from opposite side */}
      <directionalLight position={[-8, 3, -6]} intensity={0.5} color="#aaccff" />
      {/* Ambient — keep dark side slightly visible */}
      <ambientLight intensity={0.15} color="#ffffff" />

      <StarField radius={500} />
      <EarthSphere radius={EARTH_VISUAL_R} showAtmosphere rotationSpeed={currentSnapshot ? 0.002 : 0} atmosphereIntensity={0.04} />

      {/* Orbital plane — rotated so launch is from Cape Canaveral */}
      <group quaternion={ORBITAL_PLANE_Q}>
        <KarmanRing />
        {targetOrbit && !mission?.requirements.targetBody && <TargetOrbitRing targetOrbit={targetOrbit} />}
        <CurrentOrbitLine />
        {/* TrajectoryTrail removed — was choppy at high warp */}
        <FlightRocketModel />
        <JettisonedStages />

        {/* Moon — always visible */}
        <MoonBody simTime={0} />
        {moonBody && <SOIRing body={moonBody} simTime={0} />}

        {/* Distant body direction markers */}
        {distantBodies.map((body) => (
          <DistantBodyMarker key={body.id} body={body} simTime={0} />
        ))}
      </group>

      <FollowCamera missionTier={mission?.tier ?? 1} />

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
  mission?: Mission;
}

export default function FlightScene3D({ targetOrbit, mission }: FlightScene3DProps) {
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
        camera={{ fov: 50, near: 0.001, far: 1000, position: [0, 3, 5] }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        onCreated={() => setSceneReady(true)}
      >
        <Suspense fallback={null}>
          <FlightSceneInner targetOrbit={targetOrbit} mission={mission} />
        </Suspense>
      </Canvas>
    </div>
  );
}
