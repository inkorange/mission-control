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

  // Compute acceleration from velocity differences
  const accelData = useMemo(() => {
    const points: { time: number; acceleration: number }[] = [];
    for (let i = 1; i < data.length; i++) {
      const dt = data[i].time - data[i - 1].time;
      if (dt <= 0) continue;
      const dv = data[i].velocity - data[i - 1].velocity;
      points.push({
        time: data[i].time,
        acceleration: dv / dt, // m/s²
      });
    }
    return points;
  }, [data]);

  // Separate stage separation events from other key events
  const separationEvents = keyEvents.filter((e) => e.type === "stage_separation");
  const otherEvents = keyEvents.filter(
    (e) => e.type === "karman_line" || e.type === "max_q"
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
                type="number"
                domain={["dataMin", "dataMax"]}
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
              {otherEvents.map((e: FlightKeyEvent, i: number) => (
                <ReferenceLine
                  key={`other-${i}`}
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
              {separationEvents.map((e: FlightKeyEvent, i: number) => (
                <ReferenceLine
                  key={`sep-${i}`}
                  x={e.time}
                  stroke="rgba(255, 95, 95, 0.7)"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: e.label,
                    position: "top",
                    fill: "rgba(255, 95, 95, 0.9)",
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
                type="number"
                domain={["dataMin", "dataMax"]}
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
              {otherEvents.map((e: FlightKeyEvent, i: number) => (
                <ReferenceLine
                  key={`other-${i}`}
                  x={e.time}
                  stroke="rgba(255, 184, 0, 0.5)"
                  strokeDasharray="4 4"
                />
              ))}
              {separationEvents.map((e: FlightKeyEvent, i: number) => (
                <ReferenceLine
                  key={`sep-${i}`}
                  x={e.time}
                  stroke="rgba(255, 95, 95, 0.7)"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: e.label,
                    position: "top",
                    fill: "rgba(255, 95, 95, 0.9)",
                    fontSize: 8,
                    fontFamily: "monospace",
                  }}
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

        {/* Acceleration chart */}
        {accelData.length > 0 && (
          <div>
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
              Acceleration (m/s²)
            </span>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={accelData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  stroke="rgba(255,255,255,0.25)"
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
                  tickFormatter={formatTime}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.25)"
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
                  tickFormatter={(v: number) => `${v.toFixed(1)}`}
                />
                <Tooltip content={<ChartTooltip unit="m/s²" />} />
                {otherEvents.map((e: FlightKeyEvent, i: number) => (
                  <ReferenceLine
                    key={`other-${i}`}
                    x={e.time}
                    stroke="rgba(255, 184, 0, 0.5)"
                    strokeDasharray="4 4"
                  />
                ))}
                {separationEvents.map((e: FlightKeyEvent, i: number) => (
                  <ReferenceLine
                    key={`sep-${i}`}
                    x={e.time}
                    stroke="rgba(255, 95, 95, 0.7)"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{
                      value: e.label,
                      position: "top",
                      fill: "rgba(255, 95, 95, 0.9)",
                      fontSize: 8,
                      fontFamily: "monospace",
                    }}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="acceleration"
                  stroke="#FF9100"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-2 border-t border-[var(--border)]">
          {separationEvents.length > 0 && (
            <LegendItem color="rgba(255, 95, 95, 0.9)" dashed label="Stage Separation" />
          )}
          {otherEvents.some((e) => e.type === "max_q") && (
            <LegendItem color="rgba(255, 184, 0, 0.7)" dashed label="Max-Q" />
          )}
          {otherEvents.some((e) => e.type === "karman_line") && (
            <LegendItem color="rgba(255, 184, 0, 0.7)" dashed label="Kármán Line" />
          )}
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
      : unit === "m/s²"
        ? `${value.toFixed(2)} m/s²`
        : value >= 1000
          ? `${(value / 1000).toFixed(2)} km/s`
          : `${value.toFixed(0)} m/s`;

  return (
    <div className="px-2 py-1 rounded-sm bg-[var(--surface)] border border-[var(--border)]">
      <span className="font-mono text-[0.65rem] text-[var(--data)]">{formatted}</span>
    </div>
  );
}

function LegendItem({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="20" height="10">
        <line
          x1="0" y1="5" x2="20" y2="5"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={dashed ? "3 3" : undefined}
        />
      </svg>
      <span className="font-mono text-[0.6rem] tracking-wide" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
