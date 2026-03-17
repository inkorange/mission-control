"use client";

import { useRef, useMemo, useEffect, useCallback } from "react";
import type { FlightSnapshot } from "@/types/physics";

interface GuidanceTimelineProps {
  snapshot: FlightSnapshot | null;
  pitch: number;
  targetPitch: number; // Autopilot's computed target pitch
  throttle: number; // Commanded throttle 0-100
  hasResult: boolean;
}

// Ideal gravity turn guidance profile
// Each checkpoint: { altitude (m), time (approx s), pitch (deg), throttle (0-1), label }
const GUIDANCE_CHECKPOINTS = [
  { alt: 0,       pitch: 0,  throttle: 1.0, label: "Liftoff" },
  { alt: 3_000,   pitch: 0,  throttle: 1.0, label: "Vertical ascent" },
  { alt: 5_000,   pitch: 5,  throttle: 1.0, label: "Pitch kick" },
  { alt: 8_000,   pitch: 18, throttle: 1.0, label: "Gravity turn" },
  { alt: 12_000,  pitch: 30, throttle: 1.0, label: "Turning" },
  { alt: 20_000,  pitch: 45, throttle: 1.0, label: "Max-Q region" },
  { alt: 30_000,  pitch: 55, throttle: 1.0, label: "Accelerating" },
  { alt: 45_000,  pitch: 65, throttle: 1.0, label: "Upper atmo" },
  { alt: 60_000,  pitch: 74, throttle: 1.0, label: "Near space" },
  { alt: 80_000,  pitch: 80, throttle: 1.0, label: "Approaching space" },
  { alt: 100_000, pitch: 85, throttle: 1.0, label: "Kármán line" },
  { alt: 130_000, pitch: 88, throttle: 1.0, label: "Orbit insertion" },
  { alt: 160_000, pitch: 90, throttle: 1.0, label: "Circularize" },
];

/** Interpolate the guidance target for a given altitude */
function getGuidanceAt(alt: number): { pitch: number; throttle: number } {
  if (alt <= GUIDANCE_CHECKPOINTS[0].alt) return GUIDANCE_CHECKPOINTS[0];
  const last = GUIDANCE_CHECKPOINTS[GUIDANCE_CHECKPOINTS.length - 1];
  if (alt >= last.alt) return last;

  for (let i = 1; i < GUIDANCE_CHECKPOINTS.length; i++) {
    if (alt <= GUIDANCE_CHECKPOINTS[i].alt) {
      const prev = GUIDANCE_CHECKPOINTS[i - 1];
      const curr = GUIDANCE_CHECKPOINTS[i];
      const t = (alt - prev.alt) / (curr.alt - prev.alt);
      return {
        pitch: prev.pitch + t * (curr.pitch - prev.pitch),
        throttle: prev.throttle + t * (curr.throttle - prev.throttle),
      };
    }
  }
  return last;
}

interface HistoryPoint {
  time: number;
  alt: number;
  pitch: number;
  throttle: number;
  guidePitch: number;
  guideThrottle: number;
}

const TIMELINE_WIDTH = 800;
const TIMELINE_HEIGHT = 140;
const VISIBLE_SECONDS = 60; // Show 60 seconds of timeline
const PIXELS_PER_SECOND = TIMELINE_WIDTH / VISIBLE_SECONDS;
const CURSOR_X = TIMELINE_WIDTH * 0.3; // Current time at 30% from left

export default function GuidanceTimeline({
  snapshot,
  pitch,
  targetPitch,
  throttle: commandedThrottle,
  hasResult,
}: GuidanceTimelineProps) {
  const historyRef = useRef<HistoryPoint[]>([]);
  const lastSampleTime = useRef(-1);

  // Sample history every 0.5s
  useEffect(() => {
    if (!snapshot || hasResult) return;
    if (snapshot.time - lastSampleTime.current < 0.5) return;
    lastSampleTime.current = snapshot.time;

    historyRef.current.push({
      time: snapshot.time,
      alt: snapshot.altitude,
      pitch: snapshot.pitchAngle,
      throttle: commandedThrottle / 100, // Normalize 0-100 → 0-1
      guidePitch: targetPitch,
      guideThrottle: 1.0, // Autopilot runs full throttle
    });

    // Keep last 5 minutes
    if (historyRef.current.length > 600) {
      historyRef.current = historyRef.current.slice(-600);
    }
  }, [snapshot, hasResult]);

  // Reset on new flight
  useEffect(() => {
    if (!snapshot || snapshot.time < 1) {
      historyRef.current = [];
      lastSampleTime.current = -1;
    }
  }, [snapshot?.time]);

  const currentTime = snapshot?.time ?? 0;
  const currentAlt = snapshot?.altitude ?? 0;
  const currentGuide = { pitch: targetPitch, throttle: 1.0 };

  // Find which checkpoints are visible in the timeline window
  const visibleCheckpoints = useMemo(() => {
    if (!snapshot) return [];
    // Map checkpoints to approximate times using history
    const hist = historyRef.current;
    return GUIDANCE_CHECKPOINTS.map((cp) => {
      // Find the time when we passed this altitude
      let cpTime: number | null = null;
      for (const h of hist) {
        if (h.alt >= cp.alt) {
          cpTime = h.time;
          break;
        }
      }
      // If not yet reached, estimate based on current rate
      if (cpTime === null && currentAlt > 0 && cp.alt > currentAlt) {
        const rate = currentAlt / Math.max(currentTime, 1);
        cpTime = cp.alt / rate;
      }
      return { ...cp, time: cpTime ?? 0 };
    });
  }, [snapshot, currentTime, currentAlt]);

  // Build SVG path for a data series
  const buildPath = useCallback(
    (
      data: HistoryPoint[],
      getValue: (p: HistoryPoint) => number,
      maxVal: number,
      yTop: number,
      yHeight: number
    ) => {
      if (data.length === 0) return "";
      return data
        .map((p, i) => {
          const x = CURSOR_X + (p.time - currentTime) * PIXELS_PER_SECOND;
          const v = getValue(p);
          const y = yTop + yHeight - (v / maxVal) * yHeight;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    },
    [currentTime]
  );

  if (!snapshot || hasResult || currentTime < 0.5) return null;

  const history = historyRef.current;

  // Pitch graph: top half (y: 8 to 62)
  const pitchYTop = 8;
  const pitchYH = 54;
  // Throttle graph: bottom half (y: 76 to 130)
  const thrYTop = 76;
  const thrYH = 54;

  const actualPitchPath = buildPath(history, (p) => p.pitch, 90, pitchYTop, pitchYH);
  const guidePitchPath = buildPath(history, (p) => p.guidePitch, 90, pitchYTop, pitchYH);
  const actualThrPath = buildPath(history, (p) => p.throttle, 1, thrYTop, thrYH);
  const guideThrPath = buildPath(history, (p) => p.guideThrottle, 1, thrYTop, thrYH);

  // Extend guide line into the future — extrapolate from current target pitch
  // Use recent pitch rate to project where target will be
  const futureGuidePoints: { time: number; pitch: number; throttle: number }[] = [];
  const recentHist = history.slice(-20);
  let pitchRate = 0;
  if (recentHist.length >= 2) {
    const first = recentHist[0];
    const last = recentHist[recentHist.length - 1];
    const dt2 = last.time - first.time;
    if (dt2 > 0) pitchRate = (last.guidePitch - first.guidePitch) / dt2;
  }
  for (let dt = 0; dt <= VISIBLE_SECONDS * 0.7; dt += 1) {
    const futureTime = currentTime + dt;
    const futurePitch = Math.min(90, Math.max(0, targetPitch + pitchRate * dt));
    futureGuidePoints.push({ time: futureTime, pitch: futurePitch, throttle: 1.0 });
  }

  const futureGuidePitchPath = futureGuidePoints
    .map((p, i) => {
      const x = CURSOR_X + (p.time - currentTime) * PIXELS_PER_SECOND;
      const y = pitchYTop + pitchYH - (p.pitch / 90) * pitchYH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const futureGuideThrPath = futureGuidePoints
    .map((p, i) => {
      const x = CURSOR_X + (p.time - currentTime) * PIXELS_PER_SECOND;
      const y = thrYTop + thrYH - (p.throttle / 1) * thrYH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Pitch deviation
  const pitchDev = Math.abs(pitch - currentGuide.pitch);
  const devColor =
    pitchDev < 5 ? "var(--nasa-green)" : pitchDev < 15 ? "var(--nasa-gold)" : "var(--nasa-red)";

  return (
    <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
      <div
        className="mx-auto"
        style={{ maxWidth: TIMELINE_WIDTH + 80, padding: "6px 12px" }}
      >
        <div
          className="rounded-b-lg overflow-hidden"
          style={{
            background: "rgba(6, 13, 31, 0.75)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(26, 39, 68, 0.5)",
            borderTop: "none",
          }}
        >
          {/* Labels */}
          <div className="flex items-center justify-between px-3 pt-1.5 pb-0">
            <div className="flex items-center gap-4">
              <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-[var(--nasa-red)]">
                Guidance
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-[2px] rounded"
                    style={{ background: "var(--nasa-cyan)" }}
                  />
                  <span className="font-mono text-[0.6rem] text-[var(--nasa-cyan)]">Pitch</span>
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-[2px] rounded"
                    style={{ background: "var(--nasa-green)" }}
                  />
                  <span className="font-mono text-[0.6rem] text-[var(--nasa-green)]">Throttle</span>
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-[2px] rounded"
                    style={{
                      background: "rgba(255,255,255,0.3)",
                      borderTop: "1px dashed rgba(255,255,255,0.5)",
                    }}
                  />
                  <span className="font-mono text-[0.6rem] text-[var(--muted)]">Target</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[0.65rem] text-[var(--muted)]">
                Pitch: <span style={{ color: devColor }}>{pitch.toFixed(0)}°</span>
                <span className="text-[var(--muted)]"> / {currentGuide.pitch.toFixed(0)}° target</span>
              </span>
            </div>
          </div>

          {/* SVG Timeline */}
          <svg
            viewBox={`0 0 ${TIMELINE_WIDTH} ${TIMELINE_HEIGHT}`}
            className="w-full"
            preserveAspectRatio="none"
            style={{ height: 110 }}
          >
            {/* Grid lines */}
            {Array.from({ length: 7 }).map((_, i) => {
              const x = CURSOR_X + (i - 2) * 10 * PIXELS_PER_SECOND;
              return (
                <line
                  key={i}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={TIMELINE_HEIGHT}
                  stroke="rgba(26, 39, 68, 0.5)"
                  strokeWidth="0.5"
                />
              );
            })}
            {/* Divider between pitch and throttle */}
            <line
              x1={0}
              y1={70}
              x2={TIMELINE_WIDTH}
              y2={70}
              stroke="rgba(26, 39, 68, 0.6)"
              strokeWidth="0.5"
            />

            {/* Y-axis labels */}
            <text x={4} y={pitchYTop + 8} fontSize="7" fill="var(--muted)" opacity="0.5" className="font-mono">90°</text>
            <text x={4} y={pitchYTop + pitchYH} fontSize="7" fill="var(--muted)" opacity="0.5" className="font-mono">0°</text>
            <text x={4} y={thrYTop + 8} fontSize="7" fill="var(--muted)" opacity="0.5" className="font-mono">100%</text>
            <text x={4} y={thrYTop + thrYH} fontSize="7" fill="var(--muted)" opacity="0.5" className="font-mono">0%</text>

            {/* Future guide lines (dashed) */}
            {futureGuidePitchPath && (
              <path
                d={futureGuidePitchPath}
                fill="none"
                stroke="var(--nasa-cyan)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.3"
              />
            )}
            {futureGuideThrPath && (
              <path
                d={futureGuideThrPath}
                fill="none"
                stroke="var(--nasa-green)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.3"
              />
            )}

            {/* Guide lines (past - dashed) */}
            {guidePitchPath && (
              <path
                d={guidePitchPath}
                fill="none"
                stroke="var(--nasa-cyan)"
                strokeWidth="1"
                strokeDasharray="3 2"
                opacity="0.35"
              />
            )}
            {guideThrPath && (
              <path
                d={guideThrPath}
                fill="none"
                stroke="var(--nasa-green)"
                strokeWidth="1"
                strokeDasharray="3 2"
                opacity="0.35"
              />
            )}

            {/* Actual lines (solid) */}
            {actualPitchPath && (
              <path
                d={actualPitchPath}
                fill="none"
                stroke="var(--nasa-cyan)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            )}
            {actualThrPath && (
              <path
                d={actualThrPath}
                fill="none"
                stroke="var(--nasa-green)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            )}

            {/* Current time cursor */}
            <line
              x1={CURSOR_X}
              y1={0}
              x2={CURSOR_X}
              y2={TIMELINE_HEIGHT}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
            />

            {/* NOW marker */}
            <text
              x={CURSOR_X}
              y={TIMELINE_HEIGHT - 3}
              textAnchor="middle"
              fontSize="7"
              fill="rgba(255,255,255,0.5)"
              className="font-mono"
            >
              T+{currentTime.toFixed(0)}s
            </text>

            {/* Checkpoint markers (future) */}
            {visibleCheckpoints.map((cp, i) => {
              const x = CURSOR_X + (cp.time - currentTime) * PIXELS_PER_SECOND;
              if (x < 20 || x > TIMELINE_WIDTH - 10) return null;
              if (cp.alt <= currentAlt) return null; // Already passed
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={TIMELINE_HEIGHT}
                    stroke="var(--nasa-gold)"
                    strokeWidth="0.5"
                    strokeDasharray="2 2"
                    opacity="0.4"
                  />
                  <text
                    x={x}
                    y={7}
                    textAnchor="middle"
                    fontSize="6.5"
                    fill="var(--nasa-gold)"
                    opacity="0.7"
                    className="font-mono"
                  >
                    {cp.label}
                  </text>
                </g>
              );
            })}

            {/* Current position dots */}
            <circle
              cx={CURSOR_X}
              cy={pitchYTop + pitchYH - (pitch / 90) * pitchYH}
              r="3"
              fill="var(--nasa-cyan)"
            />
            <circle
              cx={CURSOR_X}
              cy={thrYTop + thrYH - (commandedThrottle / 100) * thrYH}
              r="3"
              fill="var(--nasa-green)"
            />

            {/* Deviation fill between actual and guide pitch */}
            {history.length > 1 && (() => {
              // Build a filled area between actual and guide pitch
              const areaPoints: string[] = [];
              // Forward: actual line
              for (const p of history) {
                const x = CURSOR_X + (p.time - currentTime) * PIXELS_PER_SECOND;
                const y = pitchYTop + pitchYH - (p.pitch / 90) * pitchYH;
                areaPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
              }
              // Backward: guide line
              for (let i = history.length - 1; i >= 0; i--) {
                const p = history[i];
                const x = CURSOR_X + (p.time - currentTime) * PIXELS_PER_SECOND;
                const y = pitchYTop + pitchYH - (p.guidePitch / 90) * pitchYH;
                areaPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
              }
              return (
                <polygon
                  points={areaPoints.join(" ")}
                  fill={devColor}
                  opacity="0.08"
                />
              );
            })()}
          </svg>
        </div>
      </div>
    </div>
  );
}
