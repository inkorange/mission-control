"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { FlightSnapshot } from "@/types/physics";
import type { FlightKeyEvent } from "@/engine/analysis/FlightAnalyzer";

interface FlightChartsProps {
  history: FlightSnapshot[];
  keyEvents: FlightKeyEvent[];
}

export default function FlightCharts({ history, keyEvents }: FlightChartsProps) {
  // Downsample for rendering performance
  const data = useMemo(() => {
    if (history.length <= 200) return history;
    const step = Math.max(1, Math.floor(history.length / 200));
    const points: FlightSnapshot[] = [];
    for (let i = 0; i < history.length; i++) {
      if (i % step === 0 || i === history.length - 1) {
        points.push(history[i]);
      }
    }
    return points;
  }, [history]);

  if (data.length === 0) return null;

  const altData = data.map((s) => ({
    time: s.time,
    altitude: s.altitude / 1000, // km
  }));

  const velData = data.map((s) => ({
    time: s.time,
    velocity: s.velocity,
  }));

  // Only show a few key events as reference lines to avoid clutter
  const eventLines = keyEvents.filter(
    (e) => e.type === "stage_separation" || e.type === "karman_line" || e.type === "max_q"
  );

  return (
    <div className="panel mb-6">
      <div className="panel-header">Flight Profile</div>
      <div className="p-4 space-y-4">
        {/* Altitude chart */}
        <div>
          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
            Altitude (km)
          </span>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={altData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                stroke="rgba(255,255,255,0.25)"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
                tickFormatter={formatTime}
              />
              <YAxis
                stroke="rgba(255,255,255,0.25)"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
                tickFormatter={(v: number) => `${v.toFixed(0)}`}
              />
              <Tooltip content={<ChartTooltip unit="km" />} />
              {eventLines.map((e, i) => (
                <ReferenceLine
                  key={i}
                  x={e.time}
                  stroke="rgba(255, 184, 0, 0.5)"
                  strokeDasharray="4 4"
                  label={{
                    value: e.label,
                    position: "top",
                    fill: "rgba(255, 184, 0, 0.7)",
                    fontSize: 8,
                    fontFamily: "monospace",
                  }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="altitude"
                stroke="#00E5FF"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Velocity chart */}
        <div>
          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
            Velocity (m/s)
          </span>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={velData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                stroke="rgba(255,255,255,0.25)"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
                tickFormatter={formatTime}
              />
              <YAxis
                stroke="rgba(255,255,255,0.25)"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`}
              />
              <Tooltip content={<ChartTooltip unit="m/s" />} />
              {eventLines.map((e, i) => (
                <ReferenceLine
                  key={i}
                  x={e.time}
                  stroke="rgba(255, 184, 0, 0.5)"
                  strokeDasharray="4 4"
                />
              ))}
              <Line
                type="monotone"
                dataKey="velocity"
                stroke="#00E676"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: number;
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0].value;
  const formatted =
    unit === "km"
      ? `${value.toFixed(1)} km`
      : value >= 1000
        ? `${(value / 1000).toFixed(2)} km/s`
        : `${value.toFixed(0)} m/s`;

  return (
    <div className="px-2 py-1 rounded-sm bg-[var(--surface)] border border-[var(--border)]">
      <span className="font-mono text-[0.65rem] text-[var(--data)]">{formatted}</span>
    </div>
  );
}
