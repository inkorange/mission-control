"use client";

import { useMemo } from "react";
import { EARTH_RADIUS, KARMAN_LINE } from "@/engine/physics/constants";
import type { FlightSnapshot, OrbitalElements, FlightOutcome, ProjectedPoint } from "@/types/physics";
import type { OrbitalTarget } from "@/types/mission";
import type { FlightKeyEvent } from "@/engine/analysis/FlightAnalyzer";
import { magnitude } from "@/lib/math";

interface TrajectoryReplayProps {
  history: FlightSnapshot[];
  targetOrbit?: OrbitalTarget;
  finalOrbit: OrbitalElements | null;
  outcome: FlightOutcome;
  keyEvents?: FlightKeyEvent[];
  projectedPath?: ProjectedPoint[];
}

/** Convert an array of SVG points into a smooth Catmull-Rom cubic bezier path string. */
function catmullRomPath(pts: { sx: number; sy: number }[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `M ${pts[0].sx.toFixed(1)},${pts[0].sy.toFixed(1)} L ${pts[1].sx.toFixed(1)},${pts[1].sy.toFixed(1)}`;
  }
  let d = `M ${pts[0].sx.toFixed(1)},${pts[0].sy.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.sx + (p2.sx - p0.sx) / 6;
    const cp1y = p1.sy + (p2.sy - p0.sy) / 6;
    const cp2x = p2.sx - (p3.sx - p1.sx) / 6;
    const cp2y = p2.sy - (p3.sy - p1.sy) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.sx.toFixed(1)},${p2.sy.toFixed(1)}`;
  }
  return d;
}

/**
 * Spatial trajectory visualization for the debrief page.
 *
 * Two rendering modes:
 *  - Altitude mode (Earth orbit missions): exaggerated altitude scale so LEO arcs are visible.
 *  - Physical mode (lunar/interplanetary): actual position vectors scaled to viewport,
 *    so the full transfer arc and target body are shown at correct relative positions.
 */
export default function TrajectoryReplay({
  history,
  targetOrbit,
  finalOrbit,
  outcome,
  keyEvents = [],
  projectedPath,
}: TrajectoryReplayProps) {
  const viewSize = 600;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const isSuccess =
    outcome === "mission_complete" || outcome === "orbit_achieved";

  // Physical mode when a projected coast path exists (lunar / interplanetary missions).
  // In this mode we use actual position vectors × physScale for all coordinates so the
  // trans-lunar arc fills the viewport correctly. Altitude-exaggeration is irrelevant here
  // because the mission spans hundreds of thousands of km, not a few hundred.
  const physicalMode = !!projectedPath && projectedPath.length > 0;

  // Physical scale: fit the farthest point (target body position) inside 82% of viewport radius.
  const physScale = useMemo(() => {
    if (!projectedPath || projectedPath.length === 0) return 1;
    let maxDist = EARTH_RADIUS * 10; // minimum so Earth is distinguishable
    for (const p of projectedPath) {
      const d = magnitude(p.position);
      if (d > maxDist) maxDist = d;
    }
    // Include target body positions
    const last = projectedPath[projectedPath.length - 1];
    for (const pos of Object.values(last.bodyPositions)) {
      const d = magnitude(pos);
      if (d > maxDist) maxDist = d;
    }
    return (viewSize / 2 * 0.82) / maxDist;
  }, [projectedPath]);

  // Earth visual radius depends on mode.
  // Physical mode: proportional to actual size (clamped to minimum 6px so it's visible).
  // Altitude mode: fixed large fraction of viewport for clear LEO visualization.
  const earthVisualR = physicalMode
    ? Math.max(EARTH_RADIUS * physScale, 6)
    : viewSize * 0.28;

  // Altitude mode layout (only used when physicalMode = false)
  const spaceVisualR = viewSize * 0.42 - (viewSize * 0.28); // fixed, based on default earthVisualR
  const altMaxForScale = useMemo(() => {
    if (physicalMode) return 1; // unused in physical mode
    let peak = 0;
    for (const s of history) if (s.altitude > peak) peak = s.altitude;
    if (targetOrbit) {
      const apo = isFinite(targetOrbit.apoapsis.max)
        ? targetOrbit.apoapsis.max
        : isFinite(targetOrbit.apoapsis.min) ? targetOrbit.apoapsis.min : 0;
      if (apo > peak) peak = apo;
    }
    if (finalOrbit && finalOrbit.apoapsis > peak) peak = finalOrbit.apoapsis;
    return Math.max(peak, 100_000) * 1.25;
  }, [physicalMode, history, targetOrbit, finalOrbit]);

  const altToVisual = (alt: number) =>
    (viewSize * 0.28) + (alt / altMaxForScale) * spaceVisualR;
  const karmanVisualR = altToVisual(KARMAN_LINE);

  // Universal coordinate converter — dispatches based on mode.
  const toSvg = (pos: { x: number; y: number }, altitude: number) => {
    if (physicalMode) {
      return {
        sx: cx + pos.x * physScale,
        sy: cy - pos.y * physScale,
      };
    }
    const angle = Math.atan2(pos.y, pos.x);
    const r = altToVisual(altitude);
    return {
      sx: cx + Math.cos(angle) * r,
      sy: cy - Math.sin(angle) * r,
    };
  };

  // Downsample trajectory history to ~300 points for performance
  const pathPoints = useMemo(() => {
    if (history.length <= 300) return history;
    const step = Math.max(1, Math.floor(history.length / 300));
    const out: FlightSnapshot[] = [];
    for (let i = 0; i < history.length; i++) {
      if (i % step === 0 || i === history.length - 1) out.push(history[i]);
    }
    return out;
  }, [history]);

  // History path as smooth Catmull-Rom bezier
  const historyPathD = useMemo(() => {
    const pts = pathPoints.map((s) => toSvg(s.position, s.altitude));
    return catmullRomPath(pts);
  }, [pathPoints, physicalMode, physScale, altMaxForScale]);

  // Projected coast path as smooth Catmull-Rom bezier
  const projectedPathD = useMemo(() => {
    if (!projectedPath || projectedPath.length < 2) return null;
    const pts = projectedPath.map((p) => toSvg(p.position, p.altitude));
    return catmullRomPath(pts);
  }, [projectedPath, physicalMode, physScale]);

  // Moon marker: position of the Moon at the moment spacecraft enters its SOI
  const moonMarker = useMemo(() => {
    if (!projectedPath || projectedPath.length === 0) return null;
    const last = projectedPath[projectedPath.length - 1];
    const moonPos = last.bodyPositions["moon"];
    if (!moonPos) return null;
    // In physical mode: use actual position. In altitude mode: use altitude-mapped coords.
    const moonAlt = magnitude(moonPos) - EARTH_RADIUS;
    const { sx, sy } = toSvg(moonPos, moonAlt);
    return { sx, sy, moonAlt };
  }, [projectedPath, physicalMode, physScale, altMaxForScale]);

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

  // Altitude-mode overlays (unused in physical mode)
  const targetApoAvg = useMemo(() => {
    if (physicalMode || !targetOrbit) return null;
    const min = targetOrbit.apoapsis.min;
    const max = targetOrbit.apoapsis.max;
    if (!isFinite(min)) return null;
    return isFinite(max) ? (min + max) / 2 : min;
  }, [physicalMode, targetOrbit]);

  const targetPeriAvg = useMemo(() => {
    if (physicalMode || !targetOrbit) return null;
    const min = targetOrbit.periapsis.min;
    const max = targetOrbit.periapsis.max;
    if (!isFinite(min) || !isFinite(max)) return null;
    return (min + max) / 2;
  }, [physicalMode, targetOrbit]);

  const finalOrbitGeo = useMemo(() => {
    if (physicalMode || !finalOrbit || finalOrbit.eccentricity >= 1 || finalOrbit.semiMajorAxis <= 0) return null;
    const apoAlt = finalOrbit.apoapsis;
    const periAlt = finalOrbit.periapsis;
    const rApo = altToVisual(apoAlt);
    const rPeri = altToVisual(Math.max(0, periAlt));
    const a = (rApo + rPeri) / 2;
    const b = Math.sqrt(rApo * rPeri);
    const cOffset = (rApo - rPeri) / 2;
    return { a, b, cOffset, apoAlt, periAlt };
  }, [physicalMode, finalOrbit, altMaxForScale]);

  // Key event markers (mapped to SVG positions)
  const eventMarkers = useMemo(() => {
    return keyEvents
      .filter((ev) => ev.type !== "max_altitude")
      .map((ev) => {
        let best = history[0];
        let bestDiff = Infinity;
        for (const s of history) {
          const diff = Math.abs(s.time - ev.time);
          if (diff < bestDiff) { bestDiff = diff; best = s; }
        }
        const { sx, sy } = toSvg(best.position, best.altitude);
        return { ...ev, sx, sy };
      });
  }, [keyEvents, history, physicalMode, physScale, altMaxForScale]);

  // Compute zoomed viewBox to fit the relevant content with padding
  const zoomedViewBox = useMemo(() => {
    if (pathPoints.length === 0) return { vb: `0 0 ${viewSize} ${viewSize}`, size: viewSize };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const expand = (sx: number, sy: number) => {
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    };

    for (const s of pathPoints) {
      const { sx, sy } = toSvg(s.position, s.altitude);
      expand(sx, sy);
    }

    if (projectedPath) {
      for (const p of projectedPath) {
        const { sx, sy } = toSvg(p.position, p.altitude);
        expand(sx, sy);
      }
    }

    if (moonMarker) expand(moonMarker.sx, moonMarker.sy);

    if (physicalMode) {
      // In physical mode, also include Earth circle edge
      expand(cx + earthVisualR, cy);
      expand(cx - earthVisualR, cy);
      expand(cx, cy + earthVisualR);
      expand(cx, cy - earthVisualR);
    } else {
      // Altitude mode: include nearest Earth edge for context
      const trajCx = (minX + maxX) / 2;
      const trajCy = (minY + maxY) / 2;
      const dx = trajCx - cx;
      const dy = trajCy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const earthEdgeX = cx + (dx / dist) * earthVisualR;
      const earthEdgeY = cy + (dy / dist) * earthVisualR;
      const earthPadX1 = cx + (dx / dist) * earthVisualR * 0.92;
      const earthPadY1 = cy + (dy / dist) * earthVisualR * 0.92;
      minX = Math.min(minX, earthEdgeX, earthPadX1);
      maxX = Math.max(maxX, earthEdgeX, earthPadX1);
      minY = Math.min(minY, earthEdgeY, earthPadY1);
      maxY = Math.max(maxY, earthEdgeY, earthPadY1);
    }

    // 10% padding
    const padX = (maxX - minX) * 0.1;
    const padY = (maxY - minY) * 0.1;
    minX -= padX; minY -= padY; maxX += padX; maxY += padY;

    // Make square
    const w = maxX - minX;
    const h = maxY - minY;
    const size = Math.max(w, h);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      vb: `${(centerX - size / 2).toFixed(1)} ${(centerY - size / 2).toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}`,
      size,
    };
  }, [pathPoints, projectedPath, moonMarker, physicalMode, physScale, altMaxForScale]);

  const zoomScale = zoomedViewBox.size / viewSize;

  // Stars (deterministic)
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

      {/* ── Altitude-mode overlays (Earth orbit missions only) ── */}
      {!physicalMode && (
        <>
          {/* Target orbit circle */}
          {targetApoAvg !== null && (
            <>
              <circle
                cx={cx} cy={cy}
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
              cx={cx} cy={cy}
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
            cx={cx} cy={cy}
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

          {/* Final orbit ellipse */}
          {finalOrbitGeo && isSuccess && (
            <>
              <ellipse
                cx={cx - finalOrbitGeo.cOffset} cy={cy}
                rx={finalOrbitGeo.a} ry={finalOrbitGeo.b}
                fill="none"
                stroke="var(--data)"
                strokeWidth={1 * zoomScale}
                opacity="0.4"
              />
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
        </>
      )}

      {/* ── Physical-mode reference ring: Moon's orbital circle ── */}
      {physicalMode && (
        <circle
          cx={cx} cy={cy}
          r={384_400_000 * physScale}
          fill="none"
          stroke="#555"
          strokeWidth={0.5 * zoomScale}
          strokeDasharray={`${5 * zoomScale} ${5 * zoomScale}`}
          opacity="0.3"
        />
      )}

      {/* Earth */}
      <circle
        cx={cx} cy={cy}
        r={earthVisualR}
        fill="url(#earthGradReplay)"
        stroke="#1a4a7a"
        strokeWidth={1 * zoomScale}
      />
      {/* Atmosphere glow */}
      <circle
        cx={cx} cy={cy}
        r={earthVisualR + 2 * zoomScale}
        fill="none"
        stroke="#4da6ff"
        strokeWidth={3 * zoomScale}
        opacity="0.08"
      />

      {/* History flight path (smooth Catmull-Rom) */}
      {historyPathD && (
        <path
          d={historyPathD}
          fill="none"
          stroke={isSuccess ? "var(--data)" : "var(--nasa-red)"}
          strokeWidth={physicalMode ? 1.5 * zoomScale : 2 * zoomScale}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={physicalMode ? 0.6 : 0.8}
        />
      )}

      {/* Projected coast path (smooth Catmull-Rom, dashed) */}
      {projectedPathD && (
        <path
          d={projectedPathD}
          fill="none"
          stroke="var(--data)"
          strokeWidth={2 * zoomScale}
          strokeDasharray={`${8 * zoomScale} ${5 * zoomScale}`}
          strokeLinecap="round"
          opacity="0.7"
        />
      )}

      {/* Moon body marker */}
      {moonMarker && (
        <g>
          <circle
            cx={moonMarker.sx} cy={moonMarker.sy}
            r={8 * zoomScale}
            fill="#666"
            stroke="#999"
            strokeWidth={1.5 * zoomScale}
            opacity="0.9"
          />
          {/* Crater texture hint */}
          <circle
            cx={moonMarker.sx - 2 * zoomScale} cy={moonMarker.sy - 2 * zoomScale}
            r={2 * zoomScale}
            fill="none"
            stroke="#888"
            strokeWidth={0.5 * zoomScale}
            opacity="0.4"
          />
          <text
            x={moonMarker.sx + 11 * zoomScale}
            y={moonMarker.sy + 4 * zoomScale}
            fontSize={12 * zoomScale}
            fill="#ccc"
            opacity="0.85"
            className="font-mono"
          >
            Moon
          </text>
          <text
            x={moonMarker.sx + 11 * zoomScale}
            y={moonMarker.sy + 16 * zoomScale}
            fontSize={10 * zoomScale}
            fill="#888"
            opacity="0.65"
            className="font-mono"
          >
            {(moonMarker.moonAlt / 1e6).toFixed(0)}Mm
          </text>
        </g>
      )}

      {/* Stage separation markers */}
      {stageSeps.map((s, i) => {
        const { sx, sy } = toSvg(s.position, s.altitude);
        return (
          <g key={i}>
            <circle
              cx={sx} cy={sy}
              r={3 * zoomScale}
              fill="none"
              stroke="var(--nasa-gold)"
              strokeWidth={1 * zoomScale}
            />
            {!physicalMode && (
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
            )}
          </g>
        );
      })}

      {/* Key event markers (altitude mode only — in physical mode they cluster near Earth) */}
      {!physicalMode && eventMarkers.map((ev, i) => {
        const color =
          ev.type === "stage_separation" ? "var(--nasa-gold)"
          : ev.type === "max_q" ? "var(--nasa-red)"
          : ev.type === "orbit_achieved" ? "var(--nasa-green)"
          : "#4da6ff";
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
            {!physicalMode && (
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
            )}
          </>
        );
      })()}

      {/* End marker */}
      {history.length > 1 && (() => {
        const last = history[history.length - 1];
        const { sx, sy } = toSvg(last.position, last.altitude);
        return (
          <circle
            cx={sx} cy={sy}
            r={4 * zoomScale}
            fill={isSuccess ? "var(--nasa-green)" : "var(--nasa-red)"}
          />
        );
      })()}

      {/* Outcome label */}
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
            {isSuccess ? "MISSION COMPLETE" : outcome.toUpperCase().replace("_", " ")}
          </text>
        );
      })()}

      {/* Scale reference label */}
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
            {physicalMode ? "Physical scale" : "Altitude scale exaggerated"}
          </text>
        );
      })()}
    </svg>
  );
}
