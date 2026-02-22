"use client";

import { useMemo } from "react";
import { useFlightStore } from "@/stores/useFlightStore";
import { EARTH_RADIUS, KARMAN_LINE } from "@/engine/physics/constants";
import type { OrbitalTarget } from "@/types/mission";

interface TrajectoryViewProps {
  targetOrbit?: OrbitalTarget;
}

/**
 * 2D SVG orbital trajectory visualization.
 * Renders Earth, atmosphere, target orbit, and the rocket's live trajectory.
 */
export default function TrajectoryView({ targetOrbit }: TrajectoryViewProps) {
  const { currentSnapshot, currentOrbit, result } = useFlightStore();

  // SVG viewport is 600x600, centered at 300,300
  const viewSize = 600;
  const cx = viewSize / 2;
  const cy = viewSize / 2;

  // Auto-scale: show Earth plus some extra space
  // Determine the max distance we need to show
  const maxAlt = useMemo(() => {
    const snapshotAlt = currentSnapshot?.altitude ?? 0;
    const targetApo = targetOrbit?.apoapsis.max ?? 0;
    const orbitApo = currentOrbit?.apoapsis ?? 0;
    return Math.max(200_000, snapshotAlt * 1.5, targetApo * 1.3, orbitApo * 1.3);
  }, [currentSnapshot?.altitude, targetOrbit, currentOrbit?.apoapsis]);

  // Scale: map real meters to SVG pixels
  // Earth radius + max altitude = fills about 90% of half the view
  const maxRadius = EARTH_RADIUS + maxAlt;
  const scale = (viewSize * 0.42) / maxRadius;
  const earthR = EARTH_RADIUS * scale;
  const atmosR = (EARTH_RADIUS + KARMAN_LINE) * scale;

  // Convert position (meters from Earth center) to SVG coords
  const toSvg = (x: number, y: number) => ({
    sx: cx + x * scale,
    sy: cy - y * scale, // Flip Y for SVG
  });

  // Rocket position
  const rocketPos = currentSnapshot?.position ?? { x: 0, y: EARTH_RADIUS };
  const { sx: rocketSx, sy: rocketSy } = toSvg(rocketPos.x, rocketPos.y);

  // Target orbit ellipse (if defined)
  const targetOuter = targetOrbit
    ? (EARTH_RADIUS + (targetOrbit.apoapsis.min + targetOrbit.apoapsis.max) / 2) * scale
    : 0;
  const targetInner = targetOrbit
    ? (EARTH_RADIUS + (targetOrbit.periapsis.min + targetOrbit.periapsis.max) / 2) * scale
    : 0;
  const targetSma = (targetOuter + targetInner) / 2;
  const targetSmi = Math.sqrt(targetOuter * targetInner);

  // Current orbit ellipse
  const hasOrbit = currentOrbit && currentOrbit.semiMajorAxis > 0 && currentOrbit.eccentricity < 1;
  let orbitRx = 0;
  let orbitRy = 0;
  let orbitCxOffset = 0;
  if (hasOrbit && currentOrbit) {
    const a = currentOrbit.semiMajorAxis * scale;
    const e = currentOrbit.eccentricity;
    orbitRx = a;
    orbitRy = a * Math.sqrt(1 - e * e);
    orbitCxOffset = -a * e; // Offset center by ae
  }

  // Build trajectory trail from flight history stored in result or from recent positions
  // We'll use the snapshot position for a simple trail dot

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[var(--nasa-dark)] to-[#020510] relative">
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Earth gradient */}
          <radialGradient id="earthGrad" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#1a4a7a" />
            <stop offset="70%" stopColor="#0d2844" />
            <stop offset="100%" stopColor="#091a30" />
          </radialGradient>
          {/* Atmosphere glow */}
          <radialGradient id="atmosGrad" cx="50%" cy="50%">
            <stop offset="85%" stopColor="transparent" />
            <stop offset="100%" stopColor="#4da6ff" stopOpacity="0.15" />
          </radialGradient>
          {/* Rocket glow */}
          <filter id="rocketGlow">
            <feGaussianBlur stdDeviation="3" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Star field - simple dots */}
        {useMemo(
          () =>
            Array.from({ length: 60 }).map((_, i) => {
              const sx = ((i * 7919 + 3571) % viewSize);
              const sy = ((i * 6271 + 1237) % viewSize);
              const r = (i % 3 === 0 ? 1.2 : 0.6);
              const opacity = 0.3 + (i % 5) * 0.1;
              return (
                <circle
                  key={i}
                  cx={sx}
                  cy={sy}
                  r={r}
                  fill="white"
                  opacity={opacity}
                />
              );
            }),
          []
        )}

        {/* Atmosphere band */}
        <circle
          cx={cx}
          cy={cy}
          r={atmosR}
          fill="none"
          stroke="#4da6ff"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.25"
        />

        {/* Earth */}
        <circle
          cx={cx}
          cy={cy}
          r={earthR}
          fill="url(#earthGrad)"
          stroke="#1a4a7a"
          strokeWidth="1"
        />

        {/* Atmosphere glow ring */}
        <circle
          cx={cx}
          cy={cy}
          r={earthR + 2}
          fill="none"
          stroke="#4da6ff"
          strokeWidth="3"
          opacity="0.1"
        />

        {/* Target orbit (dashed) */}
        {targetOrbit && targetSma > 0 && (
          <ellipse
            cx={cx}
            cy={cy}
            rx={targetSma}
            ry={targetSmi || targetSma}
            fill="none"
            stroke="var(--nasa-green)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            opacity="0.5"
          />
        )}

        {/* Current orbit projection */}
        {hasOrbit && orbitRx > 0 && (
          <ellipse
            cx={cx + orbitCxOffset}
            cy={cy}
            rx={orbitRx}
            ry={orbitRy}
            fill="none"
            stroke="var(--data)"
            strokeWidth="1"
            opacity="0.4"
          />
        )}

        {/* Apoapsis / Periapsis markers */}
        {hasOrbit && currentOrbit && (
          <>
            {/* Apoapsis (top of orbit) */}
            <circle
              cx={cx + orbitCxOffset + orbitRx}
              cy={cy}
              r="3"
              fill="none"
              stroke="var(--data)"
              strokeWidth="1"
              opacity="0.6"
            />
            <text
              x={cx + orbitCxOffset + orbitRx + 8}
              y={cy + 3}
              className="font-mono"
              fontSize="8"
              fill="var(--data)"
              opacity="0.6"
            >
              Ap {(currentOrbit.apoapsis / 1000).toFixed(0)}km
            </text>

            {/* Periapsis */}
            <circle
              cx={cx + orbitCxOffset - orbitRx}
              cy={cy}
              r="3"
              fill="none"
              stroke={currentOrbit.periapsis > 0 ? "var(--nasa-green)" : "var(--nasa-red)"}
              strokeWidth="1"
              opacity="0.6"
            />
            <text
              x={cx + orbitCxOffset - orbitRx - 8}
              y={cy + 3}
              className="font-mono"
              fontSize="8"
              fill={currentOrbit.periapsis > 0 ? "var(--nasa-green)" : "var(--nasa-red)"}
              opacity="0.6"
              textAnchor="end"
            >
              Pe {(currentOrbit.periapsis / 1000).toFixed(0)}km
            </text>
          </>
        )}

        {/* Rocket position */}
        <circle
          cx={rocketSx}
          cy={rocketSy}
          r="4"
          fill="var(--nasa-red)"
          filter="url(#rocketGlow)"
        />
        {/* Rocket trail dot */}
        <circle
          cx={rocketSx}
          cy={rocketSy}
          r="6"
          fill="none"
          stroke="var(--nasa-red)"
          strokeWidth="1"
          opacity="0.4"
        />

        {/* Altitude label near rocket */}
        {currentSnapshot && (
          <text
            x={rocketSx + 10}
            y={rocketSy - 8}
            className="font-mono"
            fontSize="9"
            fill="var(--foreground)"
            opacity="0.8"
          >
            {(currentSnapshot.altitude / 1000).toFixed(1)} km
          </text>
        )}

        {/* Karman line label */}
        <text
          x={cx + atmosR + 4}
          y={cy - 2}
          className="font-mono"
          fontSize="7"
          fill="#4da6ff"
          opacity="0.35"
        >
          100km
        </text>

        {/* Outcome overlay */}
        {result && (
          <text
            x={cx}
            y={40}
            textAnchor="middle"
            className="font-mono"
            fontSize="14"
            fontWeight="bold"
            fill={
              result.outcome === "mission_complete" || result.outcome === "orbit_achieved"
                ? "var(--nasa-green)"
                : "var(--nasa-red)"
            }
          >
            {result.outcome === "mission_complete"
              ? "MISSION COMPLETE"
              : result.outcome === "orbit_achieved"
                ? "ORBIT ACHIEVED"
                : result.outcome === "crash"
                  ? "VEHICLE LOST"
                  : result.outcome === "aborted"
                    ? "MISSION ABORTED"
                    : result.outcome === "suborbital"
                      ? "SUBORBITAL TRAJECTORY"
                      : "FUEL EXHAUSTED"}
          </text>
        )}
      </svg>
    </div>
  );
}
