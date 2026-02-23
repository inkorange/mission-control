"use client";

import { useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  N8AO,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { useBuilderStore } from "@/stores/useBuilderStore";
import { getEngineById } from "@/engine/data/engines";

// --- Inner scene components (must be inside Canvas) ---

interface StageData {
  index: number;
  totalMass: number;
  fuelMass: number;
  fuelCapacity: number;
  engineCount: number;
  widthFactor: number;
  height: number;
  yOffset: number;
}

/** Curved ogive nosecone using LatheGeometry */
function NoseCone({ radius, height, position }: { radius: number; height: number; position: [number, number, number] }) {
  const geometry = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const segs = 20;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new THREE.Vector2(radius * Math.cos(t * Math.PI / 2), t * height));
    }
    return new THREE.LatheGeometry(pts, 32);
  }, [radius, height]);

  return (
    <mesh castShadow position={position} geometry={geometry}>
      <meshPhysicalMaterial
        color="#e0dcd6"
        roughness={0.3}
        metalness={0.05}
        clearcoat={0.4}
        clearcoatRoughness={0.15}
      />
    </mesh>
  );
}

/** Realistic rocket body — white/cream like Falcon 9, Saturn V */
function RocketModel({ stageData }: { stageData: StageData[] }) {
  const groupRef = useRef<THREE.Group>(null);

  // Slow auto-rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
    }
  });

  if (stageData.length === 0) return null;

  const baseRadius = 0.35;

  return (
    <group ref={groupRef}>
      {stageData.map((stage) => {
        const stageRadius = baseRadius * (0.4 + stage.widthFactor * 0.6);
        const fuelFraction = stage.fuelCapacity > 0 ? stage.fuelMass / stage.fuelCapacity : 0;

        return (
          <group key={stage.index} position={[0, stage.yOffset, 0]}>
            {/* Stage body — white with subtle metallic sheen */}
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[stageRadius, stageRadius, stage.height, 32]} />
              <meshPhysicalMaterial
                color="#e8e4de"
                roughness={0.3}
                metalness={0.1}
                clearcoat={0.4}
                clearcoatRoughness={0.15}
              />
            </mesh>

            {/* Panel lines — thin dark rings for realism */}
            {Array.from({ length: Math.max(1, Math.floor(stage.height / 0.2)) }).map((_, ri) => {
              const lineY = -stage.height / 2 + (ri + 1) * (stage.height / (Math.floor(stage.height / 0.2) + 1));
              return (
                <mesh key={ri} position={[0, lineY, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[stageRadius * 1.001, 0.003, 4, 32]} />
                  <meshBasicMaterial color="#888" transparent opacity={0.3} />
                </mesh>
              );
            })}

            {/* Fuel fill indicator — subtle blue band visible through body */}
            {fuelFraction > 0 && (
              <mesh position={[0, -(stage.height * (1 - fuelFraction)) / 2, 0]}>
                <cylinderGeometry
                  args={[stageRadius * 1.002, stageRadius * 1.002, stage.height * fuelFraction, 32]}
                />
                <meshBasicMaterial
                  color="#1a6aaa"
                  transparent
                  opacity={0.12}
                  depthWrite={false}
                />
              </mesh>
            )}

            {/* Stage number band — dark stripe with label area */}
            <mesh position={[0, stage.height * 0.3, 0]}>
              <cylinderGeometry args={[stageRadius * 1.003, stageRadius * 1.003, 0.05, 32]} />
              <meshBasicMaterial color="#333" transparent opacity={0.5} />
            </mesh>

            {/* Engine bells */}
            {stage.engineCount > 0 && (
              <group position={[0, -stage.height / 2, 0]}>
                {Array.from({ length: Math.min(stage.engineCount, 7) }).map((_, ei) => {
                  const angle = stage.engineCount === 1
                    ? 0
                    : (ei / Math.min(stage.engineCount, 7)) * Math.PI * 2;
                  const bellOffset = stage.engineCount === 1
                    ? 0
                    : stageRadius * 0.5;
                  const bx = Math.sin(angle) * bellOffset;
                  const bz = Math.cos(angle) * bellOffset;
                  const bellRadius = Math.min(0.09, stageRadius * 0.35);

                  return (
                    <group key={ei} position={[bx, 0, bz]}>
                      {/* Nozzle — dark metallic bell */}
                      <mesh castShadow position={[0, -bellRadius * 1.5, 0]}>
                        <coneGeometry args={[bellRadius, bellRadius * 3.5, 16]} />
                        <meshPhysicalMaterial
                          color="#1a1a1a"
                          roughness={0.15}
                          metalness={0.95}
                          clearcoat={0.5}
                        />
                      </mesh>
                      {/* Nozzle inner rim — slightly lighter */}
                      <mesh position={[0, -bellRadius * 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[bellRadius * 0.4, 0.006, 8, 16]} />
                        <meshPhysicalMaterial
                          color="#444"
                          roughness={0.2}
                          metalness={0.9}
                        />
                      </mesh>
                    </group>
                  );
                })}
              </group>
            )}

            {/* Interstage adapter */}
            {stage.index < stageData.length - 1 && (
              <mesh castShadow position={[0, stage.height / 2 + 0.035, 0]}>
                <cylinderGeometry args={[stageRadius * 0.55, stageRadius * 0.98, 0.07, 32]} />
                <meshPhysicalMaterial
                  color="#888"
                  roughness={0.3}
                  metalness={0.6}
                />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Nosecone — curved ogive, always present on top stage */}
      {stageData.length > 0 && (() => {
        const topStage = stageData[stageData.length - 1];
        const topRadius = baseRadius * (0.4 + topStage.widthFactor * 0.6);
        const coneHeight = topRadius * 2;
        return (
          <NoseCone
            radius={topRadius}
            height={coneHeight}
            position={[0, topStage.yOffset + topStage.height / 2, 0]}
          />
        );
      })()}

    </group>
  );
}

/** Ground plane that fades off into the distance */
const groundShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    void main() {
      float dist = length(vUv - 0.5) * 2.0;
      float alpha = smoothstep(1.0, 0.15, dist) * 0.5;
      gl_FragColor = vec4(0.08, 0.08, 0.1, alpha);
    }
  `,
};

function GroundPlane({ y }: { y: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[12, 12, 1, 1]} />
      <shaderMaterial
        attach="material"
        vertexShader={groundShader.vertexShader}
        fragmentShader={groundShader.fragmentShader}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/** Auto-adjusts camera distance to fit the rocket */
function AutoCamera({ totalHeight }: { totalHeight: number }) {
  const { camera } = useThree();

  useMemo(() => {
    const dist = Math.max(3, totalHeight * 1.8);
    camera.position.set(dist * 0.6, totalHeight * 0.3, dist * 0.8);
    camera.lookAt(0, totalHeight * 0.3, 0);
  }, [totalHeight, camera]);

  return null;
}

// --- Main component ---

export default function RocketPreview3D() {
  const { stages, payload } = useBuilderStore();
  const [sceneReady, setSceneReady] = useState(false);

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
      return { index: i, totalMass, fuelMass: stage.fuelMass, fuelCapacity: stage.fuelCapacity, engineCount };
    });

    const maxMass = Math.max(...rawData.map((s) => s.totalMass), 1);

    let currentY = 0;
    return rawData.map((s) => {
      const widthFactor = s.totalMass / maxMass;
      const height = Math.max(0.3, Math.min(1.2, (s.totalMass / maxMass) * 1.0 + 0.2));
      const yOffset = currentY + height / 2;
      currentY += height + 0.06;
      return { ...s, widthFactor, height, yOffset };
    });
  }, [stages]);

  const totalHeight = useMemo(() => {
    if (stageData.length === 0) return 2;
    const top = stageData[stageData.length - 1];
    const topRadius = 0.35 * (0.4 + top.widthFactor * 0.6);
    const coneHeight = topRadius * 2;
    return top.yOffset + top.height / 2 + coneHeight;
  }, [stageData]);

  if (stages.length === 0) {
    return (
      <div className="panel flex flex-col h-full">
        <div className="panel-header">Vehicle Preview</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--muted)]">
            Add stages to preview
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">Vehicle Preview</div>
      <div className="flex-1 relative">
        {!sceneReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <p className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--muted)] animate-pulse">
              Loading preview...
            </p>
          </div>
        )}
        <Canvas
          camera={{ fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
          style={{ background: "transparent" }}
          shadows
          onCreated={() => setSceneReady(true)}
        >
          <Suspense fallback={null}>
            {/* Key light — bright sun-like from upper right */}
            <directionalLight
              position={[5, 8, 6]}
              intensity={3}
              color="#ffffff"
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            {/* Fill light — softer from left, slight warm tint */}
            <directionalLight position={[-4, 4, -3]} intensity={1} color="#f0e8dd" />
            {/* Rim / back light — subtle blue */}
            <directionalLight position={[0, 2, -6]} intensity={0.5} color="#88bbff" />
            {/* Ambient — keeps shadows from being pure black */}
            <ambientLight intensity={0.6} color="#ffffff" />
            {/* Environment for realistic reflections */}
            <Environment preset="city" environmentIntensity={0.6} />

            <AutoCamera totalHeight={totalHeight} />
            <OrbitControls
              enablePan={false}
              enableZoom={true}
              minDistance={1.5}
              maxDistance={12}
              target={[0, totalHeight * 0.35, 0]}
            />

            <RocketModel stageData={stageData} />
            <GroundPlane y={stageData[0].yOffset - stageData[0].height / 2 - 0.05} />

            {/* Post-processing */}
            <EffectComposer>
              <Bloom
                luminanceThreshold={0.8}
                luminanceSmoothing={0.3}
                intensity={0.4}
                mipmapBlur
              />
              <N8AO
                aoRadius={0.5}
                intensity={1.5}
                distanceFalloff={0.5}
              />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
