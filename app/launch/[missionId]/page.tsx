"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getMissionById } from "@/engine/data/missions";
import { useBuilderStore } from "@/stores/useBuilderStore";
import { useFlightStore } from "@/stores/useFlightStore";
import { useSimulation } from "@/hooks/useSimulation";
import { ENGINES } from "@/engine/data/engines";
import TelemetryHUD from "@/components/launch/TelemetryHUD";
import FlightControls from "@/components/launch/FlightControls";
import FlightScene3D from "@/components/launch/FlightScene3D";
import EventLog from "@/components/launch/EventLog";
import {
  formatDistance,
  formatVelocity,
  formatMissionTime,
} from "@/lib/formatters";

const COUNTDOWN_CALLOUTS: Record<number, string> = {
  10: "Go for launch",
  9: "Internal power",
  8: "Guidance is internal",
  7: "Engine chill",
  6: "Hydraulics nominal",
  5: "Startup",
  4: "Main engine start",
  3: "Main engine start",
  2: "Main engine start",
  1: "Ignition",
};

/** Format seconds as SS:cc (seconds:centiseconds) for the countdown clock */
function formatCountdown(seconds: number): string {
  const s = Math.floor(seconds);
  const cs = Math.floor((seconds - s) * 100);
  return `${String(s).padStart(2, "0")}:${String(cs).padStart(2, "0")}`;
}

export default function LaunchPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = use(params);
  const mission = getMissionById(missionId);
  const getRocketConfig = useBuilderStore((s) => s.getRocketConfig);
  const rocketConfig = getRocketConfig();
  const { isPaused, currentSnapshot, result, timeScale, reset: resetFlight } =
    useFlightStore();

  // Reset flight state when entering the launch page so previous results don't persist
  useEffect(() => {
    resetFlight();
  }, [resetFlight]);

  const [launchPhase, setLaunchPhase] = useState<"idle" | "countdown" | "flight">("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownStartRef = useRef<number>(0);
  const countdownRafRef = useRef<number>(0);

  const { start, setThrottle, setPitch, triggerStaging, abort, setWarp } =
    useSimulation({
      config: rocketConfig,
      mission: mission ?? null,
      engineDefs: ENGINES,
    });

  const beginCountdown = useCallback(() => {
    setLaunchPhase("countdown");
    setCountdown(10);
    countdownStartRef.current = performance.now();
  }, []);

  // Countdown ticker using requestAnimationFrame for smooth ms display
  useEffect(() => {
    if (launchPhase !== "countdown") return;

    const tick = (now: number) => {
      const elapsed = (now - countdownStartRef.current) / 1000;
      const remaining = Math.max(0, 10 - elapsed);

      setCountdown(remaining);

      if (remaining <= 0) {
        setLaunchPhase("flight");
        start();
        return;
      }

      countdownRafRef.current = requestAnimationFrame(tick);
    };

    countdownRafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(countdownRafRef.current);
    };
  }, [launchPhase, start]);

  const hasLaunched = launchPhase === "flight";

  if (!mission) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="panel p-6">
          <span className="status-dot status-dot--danger mr-2" />
          <span className="font-mono text-base text-[var(--nasa-red)]">
            Mission not found: {missionId}
          </span>
        </div>
      </div>
    );
  }

  if (rocketConfig.stages.length === 0) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="panel p-8 text-center">
          <span className="status-dot status-dot--warning mr-2" />
          <span className="font-mono text-base text-[var(--nasa-gold)] block mb-4">
            No vehicle configured
          </span>
          <p className="text-sm text-[var(--muted)] mb-6">
            Build your rocket in the Assembly phase before launching.
          </p>
          <Link
            href={`/builder/${missionId}`}
            className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-8 py-3 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors inline-block"
          >
            Go to Assembly
          </Link>
        </div>
      </div>
    );
  }

  const alt = currentSnapshot?.altitude ?? 0;
  const vel = currentSnapshot?.velocity ?? 0;
  const time = currentSnapshot?.time ?? 0;
  const stageCount = rocketConfig.stages.length;
  const currentStage = currentSnapshot?.currentStage ?? 0;

  // Status indicator
  const flightStatus = result
    ? result.outcome === "mission_complete" || result.outcome === "orbit_achieved"
      ? { label: "Complete", color: "var(--nasa-green)", dot: "active" }
      : { label: "Terminated", color: "var(--nasa-red)", dot: "danger" }
    : isPaused
      ? { label: "Paused", color: "var(--nasa-gold)", dot: "warning" }
      : launchPhase === "countdown"
        ? { label: `T-${formatCountdown(countdown ?? 0)}`, color: "var(--nasa-gold)", dot: "warning" }
        : hasLaunched
          ? { label: "Flight Active", color: "var(--nasa-green)", dot: "active" }
          : { label: "Pre-Launch", color: "var(--nasa-blue-light)", dot: "info" };

  return (
    <div className="h-[calc(100vh-84px)] flex flex-col">
      {/* Flight HUD header */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
              {mission.codename}
            </span>
            <div className="h-4 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span
                className={`status-dot status-dot--${flightStatus.dot}`}
              />
              <span
                className="font-mono text-[0.75rem] tracking-wider uppercase"
                style={{ color: flightStatus.color }}
              >
                {flightStatus.label}
              </span>
            </div>
          </div>

          {/* Telemetry strip */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div>
                <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  MET
                </span>
                <span className="font-mono text-sm text-[var(--data)]">
                  {formatMissionTime(time)}
                </span>
              </div>
              <div>
                <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  ALT
                </span>
                <span className="font-mono text-sm text-[var(--data)]">
                  {formatDistance(alt)}
                </span>
              </div>
              <div>
                <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  VEL
                </span>
                <span className="font-mono text-sm text-[var(--data)]">
                  {formatVelocity(vel)}
                </span>
              </div>
              <div>
                <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  Stage
                </span>
                <span className="font-mono text-sm text-[var(--foreground)]">
                  {currentStage + 1} / {stageCount || "—"}
                </span>
              </div>
            </div>
            <div className="h-4 w-px bg-[var(--border)]" />
            <div>
              <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                Warp
              </span>
              <span className="font-mono text-sm text-[var(--foreground)]">
                {timeScale}x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main flight workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center: Trajectory visualization */}
        <div className="flex-1 relative">
          <FlightScene3D targetOrbit={mission.requirements.targetOrbit} />

          {/* Pre-launch overlay */}
          {launchPhase !== "flight" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
              <div className="text-center">
                {launchPhase === "idle" ? (
                  <>
                    <div className="panel p-8 mb-4">
                      <div className="panel-header mb-6">Launch Sequence</div>
                      <div className="mb-6 space-y-2">
                        <div className="flex items-center justify-between gap-8">
                          <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--muted)]">
                            Mission
                          </span>
                          <span className="font-mono text-sm text-[var(--foreground)]">
                            {mission.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-8">
                          <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--muted)]">
                            Vehicle
                          </span>
                          <span className="font-mono text-sm text-[var(--foreground)]">
                            {stageCount} Stage{stageCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-8">
                          <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--muted)]">
                            Mass
                          </span>
                          <span className="font-mono text-sm text-[var(--data)]">
                            {(rocketConfig.totalMass / 1000).toFixed(1)}t
                          </span>
                        </div>
                      </div>

                      <p className="font-mono text-[0.625rem] tracking-wider text-[var(--muted)] mb-4">
                        Use throttle and pitch controls to perform your gravity turn.
                        <br />
                        Stage separation is manual — watch your fuel!
                      </p>

                      <button
                        onClick={beginCountdown}
                        className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-10 py-3 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors glow-red"
                      >
                        Begin Launch Sequence
                      </button>
                    </div>

                    <Link
                      href={`/builder/${missionId}`}
                      className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Return to Builder
                    </Link>
                  </>
                ) : (
                  /* Countdown overlay */
                  <div className="panel p-12">
                    <span className="font-mono text-[0.7rem] tracking-[0.3em] uppercase text-[var(--muted)] block mb-4">
                      {countdown !== null && countdown > 0
                        ? COUNTDOWN_CALLOUTS[Math.ceil(countdown)] ?? "Launch sequence"
                        : "Liftoff"}
                    </span>
                    <span
                      className={`font-mono font-bold block transition-all duration-300 ${
                        countdown !== null && countdown <= 0
                          ? "text-[5rem] text-[var(--nasa-red)] glow-red"
                          : countdown !== null && countdown <= 3
                            ? "text-[5rem] text-[var(--nasa-gold)]"
                            : "text-[4rem] text-[var(--foreground)]"
                      }`}
                    >
                      {countdown !== null && countdown <= 0
                        ? "LIFTOFF"
                        : `T-${formatCountdown(countdown ?? 0)}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Post-flight result modal */}
          {result && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 animate-fade-in">
              <div className="panel p-6 max-w-lg w-full mx-4 animate-scale-in">
                {/* Outcome header */}
                <div className="text-center mb-5">
                  <span
                    className={`font-mono text-[1rem] tracking-[0.2em] uppercase font-bold block ${
                      result.outcome === "mission_complete" ||
                      result.outcome === "orbit_achieved"
                        ? "text-[var(--nasa-green)]"
                        : "text-[var(--nasa-red)]"
                    }`}
                  >
                    {result.outcome === "mission_complete"
                      ? "Mission Complete"
                      : result.outcome === "orbit_achieved"
                        ? "Orbit Achieved"
                        : result.outcome === "crash"
                          ? "Vehicle Lost"
                          : result.outcome === "aborted"
                            ? "Mission Aborted"
                            : result.outcome === "suborbital"
                              ? "Suborbital Only"
                              : "Fuel Exhausted"}
                  </span>
                  <div className="nasa-stripe mt-3" />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="p-3 rounded-sm border border-[var(--border)] bg-black/20 text-center">
                    <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1">
                      Max Altitude
                    </span>
                    <span className="font-mono text-base text-[var(--data)]">
                      {formatDistance(result.maxAltitude)}
                    </span>
                  </div>
                  <div className="p-3 rounded-sm border border-[var(--border)] bg-black/20 text-center">
                    <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1">
                      Duration
                    </span>
                    <span className="font-mono text-base text-[var(--data)]">
                      {formatMissionTime(result.flightDuration)}
                    </span>
                  </div>
                  <div className="p-3 rounded-sm border border-[var(--border)] bg-black/20 text-center">
                    <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1">
                      Delta-V Used
                    </span>
                    <span className="font-mono text-base text-[var(--data)]">
                      {result.totalDeltaVUsed.toFixed(0)} m/s
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  <Link
                    href={`/debrief/${missionId}`}
                    className="flex-1 text-center font-mono text-[0.8rem] tracking-[0.1em] uppercase py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
                  >
                    Debrief
                  </Link>
                  <Link
                    href={`/builder/${missionId}`}
                    className="flex-1 text-center font-mono text-[0.8rem] tracking-[0.1em] uppercase py-2.5 border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 rounded-sm transition-colors"
                  >
                    Rebuild
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: Telemetry + Controls */}
        <div className="w-72 border-l border-[var(--border)] flex-shrink-0 flex flex-col overflow-y-auto">
          {/* Telemetry */}
          <div className="p-3 border-b border-[var(--border)]">
            <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-2">
              Telemetry
            </span>
            <TelemetryHUD
              launchPhase={launchPhase}
              countdown={countdown}
              initialFuel={rocketConfig.stages[0]?.fuelMass ?? 0}
              initialMass={rocketConfig.totalMass}
              fuelCapacity={rocketConfig.stages[0]?.fuelCapacity ?? 0}
            />
          </div>

          {/* Controls */}
          {hasLaunched && !result && (
            <div className="p-3 border-b border-[var(--border)]">
              <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-2">
                Flight Controls
              </span>
              <FlightControls
                onThrottleChange={setThrottle}
                onPitchChange={setPitch}
                onStaging={triggerStaging}
                onAbort={abort}
                onWarpChange={setWarp}
                stageCount={stageCount}
                currentStage={currentStage}
              />
            </div>
          )}

          {/* Event Log */}
          <div className="p-3 flex-1">
            <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-2">
              Events
            </span>
            <EventLog />
          </div>
        </div>
      </div>
    </div>
  );
}
