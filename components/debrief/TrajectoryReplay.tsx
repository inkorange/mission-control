"use client";

import { useMemo } from "react";
import { EARTH_RADIUS, KARMAN_LINE } from "@/engine/physics/constants";
import type { FlightSnapshot, OrbitalElements, FlightOutcome } from "@/types/physics";
import type { OrbitalTarget } from "@/types/mission";
import type { FlightKeyEvent } from "@/engine/analysis/FlightAnalyzer";

interface TrajectoryReplayProps {
  history: FlightSnapshot[];
  targetOrbit?: OrbitalTarget;
  finalOrbit: OrbitalElements | null;
  outcome: FlightOutcome;
  keyEvents?: FlightKeyEvent[];
}

/**
 * Spatial trajectory visualization for the debrief page.
 * Shows the flight path around Earth using an exaggerated altitude scale
 * so that low orbits and suborbital arcs are clearly visible.
 *
 * Uses position data (x, y) from snapshots — not downrangeDistance.
 */
export default function TrajectoryReplay({
  history,
  targetOrbit,
  finalOrbit,
  outcome,
  keyEvents = [],
}: TrajectoryReplayProps) {
  const viewSize = 600;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const isSuccess =
    outcome === "mission_complete" || outcome === "orbit_achieved";

  // Determine the altitude range we need to display
  const maxAlt = useMemo(() => {
    let peak = 0;
    for (const s of history) {
      if (s.altitude > peak) peak = s.altitude;
    }
    if (targetOrbit) {
      const apo = isFinite(targetOrbit.apoapsis.max)
        ? targetOrbit.apoapsis.max
        : isFinite(targetOrbit.apoapsis.min)
          ? targetOrbit.apoapsis.min
          : 0;
      if (apo > peak) peak = apo;
    }
    if (finalOrbit && finalOrbit.apoapsis > peak) peak = finalOrbit.apoapsis;
    return Math.max(peak, 100_000) * 1.25;
  }, [history, targetOrbit, finalOrbit]);

  // Visual layout: Earth gets a fixed portion of the viewport,
  // and altitudes are exaggerated to fill the remaining space.
  const earthVisualR = viewSize * 0.28; // Earth takes up ~28% of the viewport radius
  const spaceVisualR = viewSize * 0.42 - earthVisualR; // Space from surface to edge

  // Map a real altitude (meters) to visual pixels above Earth's surface
  const altToVisual = (alt: number) => earthVisualR + (alt / maxAlt) * spaceVisualR;
  const karmanVisualR = altToVisual(KARMAN_LINE);

  // Convert a snapshot's position to SVG coordinates
  // Uses the actual angle from position data + exaggerated radius
  const toSvg = (pos: { x: number; y: number }, altitude: number) => {
    const angle = Math.atan2(pos.y, pos.x);
    const r = altToVisual(altitude);
    return {
      sx: cx + Math.cos(angle) * r,
      sy: cy - Math.sin(angle) * r,
    };
  };

  // Downsample trajectory to ~300 points
  const pathPoints = useMemo(() => {
    if (history.length <= 300) return history;
    const step = Math.max(1, Math.floor(history.length / 300));
    const out: FlightSnapshot[] = [];
    for (let i = 0; i < history.length; i++) {
      if (i % step === 0 || i === history.length - 1) out.push(history[i]);
    }
    return out;
  }, [history]);

  // Build SVG polyline from position data
  const pathString = useMemo(() => {
    return pathPoints
      .map((s) => {
        const { sx, sy } = toSvg(s.position, s.altitude);
        return `${sx.toFixed(1)},${sy.toFixed(1)}`;
      })
      .join(" ");
  }, [pathPoints, maxAlt]);

  // Stage separation markers
  const stageSeps = useMemo(() => {
    const seps: FlightSnapshot[] = [];
    for (let i = 1; i < history.length; i++) {
      if (history[i].currentStage !== history[i - 1].currentStage) {
        seps.push(history[i]);
      }
    }
    return seps;
  }, [history]);

  // Target orbit (handle Infinity in max values)
  const targetApoAvg = useMemo(() => {
    if (!targetOrbit) return null;
    const min = targetOrbit.apoapsis.min;
    const max = targetOrbit.apoapsis.max;
    if (!isFinite(min)) return null;
    // If max is Infinity, just use min as the target line
    return isFinite(max) ? (min + max) / 2 : min;
  }, [targetOrbit]);

  const targetPeriAvg = useMemo(() => {
    if (!targetOrbit) return null;
    const min = targetOrbit.periapsis.min;
    const max = targetOrbit.periapsis.max;
    if (!isFinite(min) || !isFinite(max)) return null;
    return (min + max) / 2;
  }, [targetOrbit]);

  // Final orbit ellipse: use the exaggerated scale
  const finalOrbitGeo = useMemo(() => {
    if (!finalOrbit || finalOrbit.eccentricity >= 1 || finalOrbit.semiMajorAxis <= 0) return null;
    const apoAlt = finalOrbit.apoapsis; // meters above surface
    const periAlt = finalOrbit.periapsis; // meters above surface
    const rApo = altToVisual(apoAlt);
    const rPeri = altToVisual(Math.max(0, periAlt));
    // Ellipse semi-axes and center offset
    const a = (rApo + rPeri) / 2;
    const b = Math.sqrt(rApo * rPeri);
    const cOffset = (rApo - rPeri) / 2; // focus offset from center
    return { a, b, cOffset, apoAlt, periAlt };
  }, [finalOrbit, maxAlt]);

  // Map key events to SVG positions
  const eventMarkers = useMemo(() => {
    return keyEvents
      .filter((ev) => ev.type !== "max_altitude")
      .map((ev) => {
        let best = history[0];
        let bestDiff = Infinity;
        for (const s of history) {
          const diff = Math.abs(s.time - ev.time);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = s;
          }
        }
        const { sx, sy } = toSvg(best.position, best.altitude);
        return { ...ev, sx, sy };
      });
  }, [keyEvents, history, maxAlt]);

  // Compute a zoomed viewBox that fits the flight path with padding
  const zoomedViewBox = useMemo(() => {
    if (pathPoints.length === 0) return { vb: `0 0 ${viewSize} ${viewSize}`, size: viewSize };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of pathPoints) {
      const { sx, sy } = toSvg(s.position, s.altitude);
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }

    // Include the Earth's edge nearest to the trajectory for context
    // Find the closest point on Earth's circle to the trajectory center
    const trajCx = (minX + maxX) / 2;
    const trajCy = (minY + maxY) / 2;
    const dx = trajCx - cx;
    const dy = trajCy - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const earthEdgeX = cx + (dx / dist) * earthVisualR;
    const earthEdgeY = cy + (dy / dist) * earthVisualR;

    // Include just the nearest Earth edge for context (not deep into the planet)
    const earthPadX1 = cx + (dx / dist) * earthVisualR * 0.92;
    const earthPadY1 = cy + (dy / dist) * earthVisualR * 0.92;
    minX = Math.min(minX, earthEdgeX, earthPadX1);
    maxX = Math.max(maxX, earthEdgeX, earthPadX1);
    minY = Math.min(minY, earthEdgeY, earthPadY1);
    maxY = Math.max(maxY, earthEdgeY, earthPadY1);

    // Add padding (10% of the bounding box size) — tight zoom on flight path
    const padX = (maxX - minX) * 0.1;
    const padY = (maxY - minY) * 0.1;
    minX -= padX;
    minY -= padY;
    maxX += padX;
    maxY += padY;

    // Make it square (use the larger dimension)
    const w = maxX - minX;
    const h = maxY - minY;
    const size = Math.max(w, h);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return { vb: `${(centerX - size / 2).toFixed(1)} ${(centerY - size / 2).toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}`, size };
  }, [pathPoints, maxAlt]);

  // Scale factor so strokes/fonts stay consistent regardless of zoom level
  // Normalizes to look as if rendered in the full 600px viewBox
  const zoomScale = zoomedViewBox.size / viewSize;

  // Stars (deterministic scatter)
  const stars = useMemo(
    () =>
      Array.from({ length: 50 }).map((_, i) => ({
        x: (i * 7919 + 3571) % viewSize,
        y: (i * 6271 + 1237) % viewSize,
        r: i % 3 === 0 ? 1 : 0.5,
        o: 0.2 + (i % 5) * 0.06,
      })),
    []
  );

  return (
    <svg
      viewBox={zoomedViewBox.vb}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="earthGradReplay" cx="40%" cy="40%">
          <stop offset="0%" stopColor="#1a4a7a" />
          <stop offset="70%" stopColor="#0d2844" />
          <stop offset="100%" stopColor="#091a30" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width={viewSize} height={viewSize} fill="#020510" />

      {/* Stars */}
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o} />
      ))}

      {/* Target orbit (dashed circle at target altitude) */}
      {targetApoAvg !== null && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={altToVisual(targetApoAvg)}
            fill="none"
            stroke="var(--nasa-green)"
            strokeWidth={1.5 * zoomScale}
            strokeDasharray={`${6 * zoomScale} ${4 * zoomScale}`}
            opacity="0.35"
          />
          <text
            x={cx}
            y={cy - altToVisual(targetApoAvg) - 5 * zoomScale}
            textAnchor="middle"
            fontSize={11 * zoomScale}
            fill="var(--nasa-green)"
            opacity="0.6"
            className="font-mono"
          >
            Target {(targetApoAvg / 1000).toFixed(0)}km
          </text>
        </>
      )}
      {targetPeriAvg !== null && targetPeriAvg !== targetApoAvg && (
        <circle
          cx={cx}
          cy={cy}
          r={altToVisual(targetPeriAvg)}
          fill="none"
          stroke="var(--nasa-green)"
          strokeWidth={0.5 * zoomScale}
          strokeDasharray={`${4 * zoomScale} ${4 * zoomScale}`}
          opacity="0.25"
        />
      )}

      {/* Karman line */}
      <circle
        cx={cx}
        cy={cy}
        r={karmanVisualR}
        fill="none"
        stroke="#4da6ff"
        strokeWidth={0.5 * zoomScale}
        strokeDasharray={`${4 * zoomScale} ${3 * zoomScale}`}
        opacity="0.25"
      />
      <text
        x={cx + karmanVisualR + 4 * zoomScale}
        y={cy - 2 * zoomScale}
        fontSize={10 * zoomScale}
        fill="#4da6ff"
        opacity="0.35"
        className="font-mono"
      >
        100km
      </text>

      {/* Earth */}
      <circle
        cx={cx}
        cy={cy}
        r={earthVisualR}
        fill="url(#earthGradReplay)"
        stroke="#1a4a7a"
        strokeWidth={1 * zoomScale}
      />
      {/* Atmosphere glow */}
      <circle
        cx={cx}
        cy={cy}
        r={earthVisualR + 2 * zoomScale}
        fill="none"
        stroke="#4da6ff"
        strokeWidth={3 * zoomScale}
        opacity="0.08"
      />

      {/* Final orbit ellipse */}
      {finalOrbitGeo && isSuccess && (
        <>
          <ellipse
            cx={cx - finalOrbitGeo.cOffset}
            cy={cy}
            rx={finalOrbitGeo.a}
            ry={finalOrbitGeo.b}
            fill="none"
            stroke="var(--data)"
            strokeWidth={1 * zoomScale}
            opacity="0.4"
          />
          {/* Ap label */}
          <text
            x={cx - finalOrbitGeo.cOffset + finalOrbitGeo.a + 6 * zoomScale}
            y={cy + 3 * zoomScale}
            fontSize={10 * zoomScale}
            fill="var(--data)"
            opacity="0.6"
            className="font-mono"
          >
            Ap {(finalOrbitGeo.apoAlt / 1000).toFixed(0)}km
          </text>
          {/* Pe label */}
          {finalOrbitGeo.periAlt > 0 && (
            <text
              x={cx - finalOrbitGeo.cOffset - finalOrbitGeo.a - 6 * zoomScale}
              y={cy + 3 * zoomScale}
              fontSize={10 * zoomScale}
              fill={finalOrbitGeo.periAlt > KARMAN_LINE ? "var(--nasa-green)" : "var(--nasa-red)"}
              opacity="0.6"
              textAnchor="end"
              className="font-mono"
            >
              Pe {(finalOrbitGeo.periAlt / 1000).toFixed(0)}km
            </text>
          )}
        </>
      )}

      {/* Flight path */}
      {pathString && (
        <polyline
          points={pathString}
          fill="none"
          stroke={isSuccess ? "var(--data)" : "var(--nasa-red)"}
          strokeWidth={2 * zoomScale}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
      )}

      {/* Stage separation markers */}
      {stageSeps.map((s, i) => {
        const { sx, sy } = toSvg(s.position, s.altitude);
        return (
          <g key={i}>
            <circle
              cx={sx}
              cy={sy}
              r={3 * zoomScale}
              fill="none"
              stroke="var(--nasa-gold)"
              strokeWidth={1 * zoomScale}
            />
            <text
              x={sx + 6 * zoomScale}
              y={sy - 4 * zoomScale}
              fontSize={10 * zoomScale}
              fill="var(--nasa-gold)"
              opacity="0.7"
              className="font-mono"
            >
              Stage {i + 1} Sep
            </text>
          </g>
        );
      })}

      {/* Key event markers */}
      {eventMarkers.map((ev, i) => {
        const color =
          ev.type === "stage_separation"
            ? "var(--nasa-gold)"
            : ev.type === "max_q"
              ? "var(--nasa-red)"
              : ev.type === "orbit_achieved"
                ? "var(--nasa-green)"
                : "#4da6ff";
        // Skip stage_separation since we already handle those above
        if (ev.type === "stage_separation") return null;
        return (
          <g key={`ev-${i}`}>
            <circle cx={ev.sx} cy={ev.sy} r={2.5 * zoomScale} fill={color} opacity="0.8" />
            <text
              x={ev.sx + 6 * zoomScale}
              y={ev.sy - 4 * zoomScale}
              fontSize={10 * zoomScale}
              fill={color}
              opacity="0.8"
              className="font-mono"
            >
              {ev.label}
            </text>
          </g>
        );
      })}

      {/* Launch marker */}
      {history.length > 0 && (() => {
        const { sx, sy } = toSvg(history[0].position, history[0].altitude);
        return (
          <>
            <circle cx={sx} cy={sy} r={3.5 * zoomScale} fill="var(--nasa-green)" />
            <text
              x={sx + 6 * zoomScale}
              y={sy + 3 * zoomScale}
              fontSize={10 * zoomScale}
              fill="var(--nasa-green)"
              opacity="0.7"
              className="font-mono"
            >
              Launch
            </text>
          </>
        );
      })()}

      {/* End marker */}
      {history.length > 1 && (() => {
        const last = history[history.length - 1];
        const { sx, sy } = toSvg(last.position, last.altitude);
        return (
          <circle
            cx={sx}
            cy={sy}
            r={4 * zoomScale}
            fill={isSuccess ? "var(--nasa-green)" : "var(--nasa-red)"}
          />
        );
      })()}

      {/* Outcome label — positioned relative to the zoomed viewBox */}
      {(() => {
        const parts = zoomedViewBox.vb.split(" ").map(Number);
        const vbX = parts[0], vbY = parts[1], vbSize = parts[2];
        return (
          <text
            x={vbX + vbSize / 2}
            y={vbY + 14 * zoomScale}
            textAnchor="middle"
            fontSize={14 * zoomScale}
            fontWeight="bold"
            fill={isSuccess ? "var(--nasa-green)" : "var(--nasa-red)"}
            className="font-mono"
            opacity="0.7"
          >
            {isSuccess
              ? "MISSION COMPLETE"
              : outcome.toUpperCase().replace("_", " ")}
          </text>
        );
      })()}

      {/* Altitude scale reference */}
      {(() => {
        const parts = zoomedViewBox.vb.split(" ").map(Number);
        const vbX = parts[0], vbSize = parts[2], vbY = parts[1];
        return (
          <text
            x={vbX + vbSize - 4 * zoomScale}
            y={vbY + vbSize - 4 * zoomScale}
            textAnchor="end"
            fontSize={10 * zoomScale}
            fill="var(--muted)"
            className="font-mono"
            opacity="0.35"
          >
            Altitude scale exaggerated
          </text>
        );
      })()}
    </svg>
  );
}
