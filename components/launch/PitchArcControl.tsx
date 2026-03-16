"use client";

import { useCallback, useRef, useState } from "react";

interface PitchArcControlProps {
  pitch: number; // 0 = vertical, 90 = horizontal
  onPitchChange: (degrees: number) => void;
  disabled?: boolean;
}

/**
 * Visual arc-style pitch control overlaid on the flight scene.
 * Drag the handle along the arc to change pitch angle.
 */
export default function PitchArcControl({
  pitch,
  onPitchChange,
  disabled,
}: PitchArcControlProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Arc geometry — center positioned so the full arc + labels fit
  const r = 110;
  const padding = 40; // space for labels, handle, ticks
  const cx = padding;
  const cy = r + padding;
  const svgW = cx + r + padding + 30; // room for HORIZ label on right
  const svgH = cy + padding;

  // Convert pitch (0-90) to angle on the arc
  const svgAngle = -90 + pitch;
  const rad = (svgAngle * Math.PI) / 180;
  const handleX = cx + r * Math.cos(rad);
  const handleY = cy + r * Math.sin(rad);

  // Arc endpoints
  const arcStart = {
    x: cx + r * Math.cos((-90 * Math.PI) / 180),
    y: cy + r * Math.sin((-90 * Math.PI) / 180),
  };
  const arcEnd = {
    x: cx + r * Math.cos((0 * Math.PI) / 180),
    y: cy + r * Math.sin((0 * Math.PI) / 180),
  };

  const filledArcEnd = { x: handleX, y: handleY };

  const computePitchFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = svgW / rect.width;
      const scaleY = svgH / rect.height;
      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;
      const angle = Math.atan2(py - cy, px - cx) * (180 / Math.PI);
      const newPitch = Math.round(Math.max(0, Math.min(90, angle + 90)));
      onPitchChange(newPitch);
    },
    [onPitchChange, svgW, svgH, cx, cy]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);
      computePitchFromPointer(e.clientX, e.clientY);
    },
    [disabled, computePitchFromPointer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();
      computePitchFromPointer(e.clientX, e.clientY);
    },
    [dragging, computePitchFromPointer]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      setDragging(false);
    },
    []
  );

  const active = dragging || hovered;

  const ticks = [0, 15, 30, 45, 60, 75, 90];

  return (
    <div
      className="absolute bottom-4 left-4 z-20 select-none touch-none rounded-lg overflow-hidden"
      style={{ backgroundColor: "rgba(255, 255, 255, 0.5)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Label bar */}
      <div className="px-4 pt-3 pb-0 flex items-baseline gap-2">
        <span
          className={`font-mono text-[0.7rem] tracking-[0.2em] uppercase font-bold transition-colors duration-200 ${
            active ? "text-[#1565C0]" : "text-black/50"
          }`}
        >
          Pitch
        </span>
        <span
          className={`font-mono text-[1.1rem] font-bold transition-colors duration-200 ${
            active ? "text-black" : "text-black/70"
          }`}
        >
          {pitch}°
        </span>
      </div>

      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background arc track */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={8}
          strokeLinecap="round"
        />

        {/* Filled arc to current pitch */}
        {pitch > 0 && (
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${filledArcEnd.x} ${filledArcEnd.y}`}
            fill="none"
            stroke={active ? "rgba(21,101,192,0.7)" : "rgba(21,101,192,0.45)"}
            strokeWidth={8}
            strokeLinecap="round"
            className="transition-all duration-150"
          />
        )}

        {/* Tick marks */}
        {ticks.map((t) => {
          const a = ((-90 + t) * Math.PI) / 180;
          const inner = r - 14;
          const outer = r + 6;
          const isMajor = t % 45 === 0;
          return (
            <g key={t}>
              <line
                x1={cx + inner * Math.cos(a)}
                y1={cy + inner * Math.sin(a)}
                x2={cx + outer * Math.cos(a)}
                y2={cy + outer * Math.sin(a)}
                stroke={isMajor ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)"}
                strokeWidth={isMajor ? 2 : 1}
              />
              {isMajor && (
                <text
                  x={cx + (r + 22) * Math.cos(a)}
                  y={cy + (r + 22) * Math.sin(a)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="rgba(0,0,0,0.5)"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {t}°
                </text>
              )}
            </g>
          );
        })}

        {/* Direction line from center to handle */}
        <line
          x1={cx}
          y1={cy}
          x2={handleX}
          y2={handleY}
          stroke={active ? "rgba(21,101,192,0.5)" : "rgba(21,101,192,0.25)"}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          className="transition-all duration-150"
        />

        {/* Draggable handle — outer ring */}
        <circle
          cx={handleX}
          cy={handleY}
          r={active ? 14 : 12}
          fill={
            dragging
              ? "rgba(21,101,192,0.4)"
              : active
                ? "rgba(21,101,192,0.25)"
                : "rgba(21,101,192,0.12)"
          }
          stroke={active ? "rgba(21,101,192,1)" : "rgba(21,101,192,0.6)"}
          strokeWidth={2.5}
          className="transition-all duration-150"
        />
        {/* Handle — inner dot */}
        <circle
          cx={handleX}
          cy={handleY}
          r={4}
          fill={active ? "rgba(21,101,192,1)" : "rgba(21,101,192,0.8)"}
          className="transition-all duration-150"
        />

        {/* Pulse ring when pitch is 0 to invite interaction */}
        {!dragging && pitch === 0 && (
          <circle
            cx={handleX}
            cy={handleY}
            r={12}
            fill="none"
            stroke="rgba(21,101,192,0.6)"
            strokeWidth={2}
            className="animate-ping-slow"
          />
        )}

        {/* Endpoint labels */}
        <text
          x={cx}
          y={cy - r - 20}
          textAnchor="middle"
          fill="rgba(0,0,0,0.5)"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
          letterSpacing="0.12em"
        >
          VERT
        </text>
        <text
          x={cx + r + 20}
          y={cy + 4}
          textAnchor="start"
          fill="rgba(0,0,0,0.5)"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
          letterSpacing="0.12em"
        >
          HORIZ
        </text>
      </svg>
    </div>
  );
}
