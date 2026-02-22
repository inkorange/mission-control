"use client";

import { useFlightStore } from "@/stores/useFlightStore";
import {
  formatDistance,
  formatVelocity,
  formatMissionTime,
} from "@/lib/formatters";

interface TelemetryHUDProps {
  launchPhase: "idle" | "countdown" | "flight";
  countdown: number | null;
  initialFuel: number;
  initialMass: number;
  fuelCapacity: number;
}

export default function TelemetryHUD({
  launchPhase,
  countdown,
  initialFuel,
  initialMass,
  fuelCapacity,
}: TelemetryHUDProps) {
  const { currentSnapshot, currentOrbit, isActive, timeScale } =
    useFlightStore();

  // During countdown, interpolate fuel from 0 → initialFuel as countdown goes 10 → 0
  const countdownProgress =
    launchPhase === "countdown" && countdown !== null
      ? 1 - countdown / 10
      : launchPhase === "flight"
        ? 1
        : 0;

  // During countdown, always use interpolated values (ignore stale snapshots)
  const inFlight = launchPhase === "flight";
  const alt = inFlight ? (currentSnapshot?.altitude ?? 0) : 0;
  const vel = inFlight ? (currentSnapshot?.velocity ?? 0) : 0;
  const time = inFlight ? (currentSnapshot?.time ?? 0) : 0;
  const fuel = inFlight
    ? (currentSnapshot?.fuel ?? initialFuel)
    : initialFuel * countdownProgress;
  const mass = inFlight ? (currentSnapshot?.mass ?? initialMass) : initialMass;
  const stage = inFlight ? (currentSnapshot?.currentStage ?? 0) : 0;
  const throttle = inFlight ? (currentSnapshot?.throttle ?? 0) : 0;
  const pitch = inFlight ? (currentSnapshot?.pitchAngle ?? 0) : 0;

  // Fuel bar: during countdown, drive directly from countdown progress (0→100%)
  // During flight, use actual fuel vs capacity ratio
  const fuelPct = inFlight
    ? fuelCapacity > 0
      ? (fuel / fuelCapacity) * 100
      : 0
    : countdownProgress * 100;

  return (
    <div className="space-y-3">
      {/* Primary readouts */}
      <div>
        <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
          Primary Telemetry
        </span>
        <div className="grid grid-cols-2 gap-2">
          <TelemetryReadout label="Altitude" value={formatDistance(alt)} />
          <TelemetryReadout label="Velocity" value={formatVelocity(vel)} />
          <TelemetryReadout label="MET" value={formatMissionTime(time)} />
          <TelemetryReadout label="Time Warp" value={`${timeScale}x`} />
        </div>
      </div>

      {/* Vehicle status */}
      <div>
        <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
          Vehicle Status
        </span>
        <div className="grid grid-cols-2 gap-2">
          <TelemetryReadout
            label="Stage"
            value={`${stage + 1}`}
          />
          <TelemetryReadout
            label="Throttle"
            value={`${Math.round(throttle * 100)}%`}
          />
          <TelemetryReadout
            label="Pitch"
            value={`${pitch.toFixed(1)}°`}
          />
          <TelemetryReadout
            label="Mass"
            value={`${(mass / 1000).toFixed(1)}t`}
          />
        </div>
      </div>

      {/* Fuel gauge */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)]">
            Stage Fuel
          </span>
          <span className="font-mono text-[0.7rem] text-[var(--data)]">
            {(fuel / 1000).toFixed(1)}t
          </span>
        </div>
        <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              fuelPct < 10 ? "bg-[var(--nasa-red)]" : "bg-[var(--nasa-blue)]"
            }`}
            style={{ width: `${Math.min(100, fuelPct)}%` }}
          />
        </div>
      </div>

      {/* Orbital data */}
      {currentOrbit && (
        <div>
          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
            Orbital Data
          </span>
          <div className="grid grid-cols-2 gap-2">
            <TelemetryReadout
              label="Apoapsis"
              value={formatDistance(currentOrbit.apoapsis)}
              highlight={currentOrbit.apoapsis > 100_000}
            />
            <TelemetryReadout
              label="Periapsis"
              value={formatDistance(currentOrbit.periapsis)}
              highlight={currentOrbit.periapsis > 0}
            />
            <TelemetryReadout
              label="Eccentricity"
              value={currentOrbit.eccentricity.toFixed(4)}
            />
            <TelemetryReadout
              label="Period"
              value={
                currentOrbit.period > 0
                  ? `${(currentOrbit.period / 60).toFixed(1)}m`
                  : "—"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TelemetryReadout({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="p-1.5 rounded-sm border border-[var(--border)] bg-black/20">
      <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
        {label}
      </span>
      <span
        className={`font-mono text-sm block leading-none mt-0.5 ${
          highlight ? "text-[var(--nasa-green)]" : "text-[var(--data)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
