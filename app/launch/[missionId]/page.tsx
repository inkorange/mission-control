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
import PitchArcControl from "@/components/launch/PitchArcControl";
import FlightAdvisory from "@/components/launch/FlightAdvisory";
import GuidanceTimeline from "@/components/launch/GuidanceTimeline";
import MissionTicker from "@/components/launch/MissionTicker";
import EventLog from "@/components/launch/EventLog";
import {
  formatDistance,
  formatVelocity,
  formatMissionTime,
} from "@/lib/formatters";

const COUNTDOWN_CALLOUTS: Record<number, string> = {
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
  const { isPaused, isValidating, currentSnapshot, result, timeScale, reset: resetFlight } =
    useFlightStore();

  // Reset flight state when entering the launch page so previous results don't persist
  useEffect(() => {
    resetFlight();
  }, [resetFlight]);

  const [launchPhase, setLaunchPhase] = useState<"idle" | "countdown" | "flight">("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pitchValue, setPitchValue] = useState(0);
  const [targetPitchValue, setTargetPitchValue] = useState(0);
  const [throttleValue, setThrottleValue] = useState(100);
  const [autopilot, setAutopilot] = useState(true);
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
    setCountdown(5);
    countdownStartRef.current = performance.now();
  }, []);

  // Countdown ticker using requestAnimationFrame for smooth ms display
  useEffect(() => {
    if (launchPhase !== "countdown") return;

    const tick = (now: number) => {
      const elapsed = (now - countdownStartRef.current) / 1000;
      const remaining = Math.max(0, 5 - elapsed);

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

  const handleThrottleChange = useCallback(
    (value: number) => {
      setThrottleValue(Math.round(value * 100));
      setThrottle(value);
    },
    [setThrottle]
  );

  const handlePitchChange = useCallback(
    (degrees: number) => {
      setPitchValue(degrees);
      setPitch(degrees);
    },
    [setPitch]
  );

  const stageCount = rocketConfig.stages.length;

  // Helper: interpolate a pitch profile at a given altitude
  const interpolateProfile = useCallback((profile: [number, number][], alt: number): number => {
    if (alt >= profile[profile.length - 1][0]) return 90;
    for (let i = 1; i < profile.length; i++) {
      if (alt <= profile[i][0]) {
        const [a0, p0] = profile[i - 1];
        const [a1, p1] = profile[i];
        const t = (alt - a0) / (a1 - a0);
        return p0 + t * (p1 - p0);
      }
    }
    return 0;
  }, []);

  // Autopilot: pitch, throttle, and staging
  const lastAutoStageRef = useRef(-1);
  const pitchRef = useRef(0);
  const throttleRef = useRef(100);
  useEffect(() => {
    if (!autopilot || !currentSnapshot || result) return;

    const alt = currentSnapshot.altitude;
    const vel = currentSnapshot.velocity;
    const fuel = currentSnapshot.fuel;
    const stage = currentSnapshot.currentStage;

    // === DETERMINE MISSION TYPE ===
    const targetOrbit = mission?.requirements.targetOrbit;
    const targetBody = mission?.requirements.targetBody;
    const orb = currentSnapshot.orbitalElements;
    const r = 6_371_000 + alt;
    const vCirc = Math.sqrt(3.986e14 / r);

    // Classify mission type
    const isSuborbital = targetOrbit &&
      (!isFinite(targetOrbit.periapsis.min) || !isFinite(targetOrbit.periapsis.max));

    const targetPeriMin = targetOrbit ? (isFinite(targetOrbit.periapsis.min) ? targetOrbit.periapsis.min : 0) : 0;
    const targetApoMin = targetOrbit ? (isFinite(targetOrbit.apoapsis.min) ? targetOrbit.apoapsis.min : 0) : 0;
    const avgTargetAlt = (targetPeriMin + targetApoMin) / 2;

    // Mission categories:
    // suborbital: just go up (First Light)
    // low_orbit: target < 500km (Orbit!, Payload Delivery)
    // high_orbit: target 500-2000km (Higher Ground)
    // transfer: target > 2000km or has target body (GTO, GEO, lunar, Mars, Jupiter, Saturn, escape)
    const missionCategory = isSuborbital ? "suborbital"
      : targetBody ? "transfer"
      : avgTargetAlt > 300_000 ? "transfer"
      : "low_orbit";

    // === PITCH ===
    let targetPitch = 0;

    if (missionCategory === "suborbital") {
      // Go straight up, slight pitch at high altitude
      targetPitch = alt < 50_000 ? 0 : Math.min(10, (alt - 50_000) / 10_000);

    } else if (missionCategory === "transfer") {
      // Use the same proven gravity turn as low_orbit to reach parking orbit,
      // then switch to prograde (90°) once near-orbital velocity is achieved for TLI.
      const transferProfile: [number, number][] = [
        [0, 0], [5_000, 0], [8_000, 5], [15_000, 12], [30_000, 25],
        [50_000, 38], [70_000, 50], [90_000, 60], [100_000, 68],
        [120_000, 78], [140_000, 85], [160_000, 88], [180_000, 90],
      ];
      const gravityTurnPitch = interpolateProfile(transferProfile, alt);

      // Once in orbit (periapsis established), burn prograde for TLI
      if (orb && orb.periapsis > 80_000) {
        targetPitch = 90;
      } else {
        targetPitch = gravityTurnPitch;
      }

    } else {
      // Low orbit: standard gravity turn
      const lowProfile: [number, number][] = [
        [0, 0], [5_000, 0], [8_000, 5], [15_000, 12], [30_000, 25],
        [50_000, 38], [70_000, 50], [90_000, 60], [100_000, 68],
        [120_000, 78], [140_000, 85], [160_000, 88], [180_000, 90],
      ];
      targetPitch = interpolateProfile(lowProfile, alt);
    }

    // Store the raw target for the guidance graph
    const roundedTarget = Math.round(targetPitch);
    setTargetPitchValue(roundedTarget);

    // Set pitch — use ref to avoid dependency loop
    if (roundedTarget !== pitchRef.current) {
      pitchRef.current = roundedTarget;
      setPitchValue(roundedTarget);
      setPitch(roundedTarget);
    }

    // === THROTTLE ===
    let targetThrottle = 1.0; // Full throttle by default

    if (missionCategory === "suborbital") {
      // Cut throttle once past target altitude
      const targetApo = targetOrbit ? (isFinite(targetOrbit.apoapsis.min) ? targetOrbit.apoapsis.min : 100_000) : 100_000;
      if (alt > targetApo * 1.1) {
        targetThrottle = 0;
      }
    } else if (orb && alt > 100_000) {
      if (targetBody) {
        // Target body missions: let the sim's auto-cutoff handle throttle
        // Read back the sim's throttle state so React doesn't override it
        targetThrottle = currentSnapshot.throttle;
      } else if (targetOrbit) {
        // Earth orbit missions: cut when orbit approaches target
        const apoMax = isFinite(targetOrbit.apoapsis.max) ? targetOrbit.apoapsis.max : Infinity;
        if (isFinite(apoMax) && orb.apoapsis > apoMax * 0.7 && orb.periapsis > -100_000) {
          targetThrottle = 0;
        }
      } else if (orb.periapsis > 100_000) {
        targetThrottle = 0;
      }
    }

    if (targetBody) {
      // Target body missions: sim handles throttle via auto-cutoff, just update display
      const simThrottle = Math.round((currentSnapshot.throttle ?? 1) * 100);
      if (simThrottle !== throttleRef.current) {
        throttleRef.current = simThrottle;
        setThrottleValue(simThrottle);
      }
    } else {
      const throttlePercent = Math.round(targetThrottle * 100);
      if (throttlePercent !== throttleRef.current) {
        throttleRef.current = throttlePercent;
        setThrottleValue(throttlePercent);
        setThrottle(targetThrottle);
      }
    }

  }, [autopilot, currentSnapshot, result, setPitch, setThrottle]);

  // Auto-staging: always jettison spent stages (regardless of autopilot)
  useEffect(() => {
    if (!currentSnapshot || result) return;
    const fuel = currentSnapshot.fuel;
    const stage = currentSnapshot.currentStage;
    if (fuel <= 0 && stage < stageCount - 1 && stage !== lastAutoStageRef.current) {
      lastAutoStageRef.current = stage;
      triggerStaging();
    }
  }, [currentSnapshot, result, stageCount, triggerStaging]);

  const hasLaunched = launchPhase === "flight";

  // True when the last stage has run dry in space — nothing left to control
  const allFuelSpent = !!currentSnapshot &&
    currentSnapshot.fuel <= 0 &&
    currentSnapshot.currentStage >= stageCount - 1 &&
    currentSnapshot.altitude > 100_000;

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
  const currentStage = currentSnapshot?.currentStage ?? 0;

  // Status indicator
  const isSuccessOutcome = result?.outcome === "mission_complete" ||
    result?.outcome === "orbit_achieved" ||
    result?.outcome === "target_reached" ||
    result?.outcome === "escaped";

  const flightStatus = result
    ? isSuccessOutcome
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
        <div className="px-6 py-5 flex items-center gap-4">
          <div className="flex items-center gap-4 flex-shrink-0">
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

          {/* Inline ticker — fills available space between left and right */}
          {(
            <div className="flex-1 min-w-0 mx-2">
              <MissionTicker
                missionName={mission.name}
                missionCodename={mission.codename}
                missionDescription={mission.description}
              />
            </div>
          )}

          {/* Telemetry strip */}
          <div className="flex items-center gap-6 flex-shrink-0">
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
        <div className="flex-1 relative min-w-0 overflow-hidden">
          <FlightScene3D targetOrbit={mission.requirements.targetOrbit} mission={mission} />

          {/* Pitch arc overlay — fades out during validation / post-success */}
          {hasLaunched && !result && (
            <div
              className="absolute inset-0 z-20 pointer-events-none"
              style={{
                opacity: (isValidating || allFuelSpent) ? 0 : 1,
                transition: "opacity 1.5s ease-out",
              }}
            >
              <div className="pointer-events-auto">
                <PitchArcControl
                  pitch={pitchValue}
                  onPitchChange={handlePitchChange}
                />
              </div>
              <GuidanceTimeline
                snapshot={currentSnapshot}
                pitch={pitchValue}
                targetPitch={autopilot ? targetPitchValue : pitchValue}
                throttle={throttleValue}
                hasResult={!!result}
              />
              <FlightAdvisory
                snapshot={currentSnapshot}
                pitch={pitchValue}
                hasResult={!!result}
              />
            </div>
          )}

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
                        {autopilot
                          ? "Autopilot will handle pitch, throttle, and staging automatically."
                          : "Use throttle and pitch controls to perform your gravity turn."}
                        <br />
                        Stage separation is automatic.
                      </p>

                      {/* Autopilot toggle */}
                      <button
                        onClick={() => setAutopilot(!autopilot)}
                        className={`w-full py-2.5 mb-3 font-mono text-[0.75rem] tracking-[0.1em] uppercase rounded-sm border transition-colors ${
                          autopilot
                            ? "border-[var(--nasa-green)] bg-[var(--nasa-green)]/15 text-[var(--nasa-green)]"
                            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30"
                        }`}
                      >
                        {autopilot ? "Autopilot Enabled" : "Enable Autopilot"}
                      </button>

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

          {/* Orbit validation overlay */}
          {isValidating && !result && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
              <div className="panel-glass px-8 py-4 flex items-center gap-4">
                <div className="w-5 h-5 border-2 border-[var(--nasa-green)] border-t-transparent rounded-full animate-spin" />
                <div>
                  <span className="font-mono text-[0.85rem] tracking-[0.1em] uppercase text-[var(--nasa-green)] block">
                    Validating Orbital Success
                  </span>
                  <span className="font-mono text-[0.65rem] text-[var(--muted)]">
                    Coasting to apoapsis at {timeScale}x warp — altitude: {((currentSnapshot?.altitude ?? 0) / 1000).toFixed(0)}km
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Post-flight result */}
          {result && !isSuccessOutcome && (
            /* Failure: full-screen modal */
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 animate-fade-in">
              <div className="panel p-6 max-w-lg w-full mx-4 animate-scale-in">
                <div className="text-center mb-5">
                  <span className="font-mono text-[1rem] tracking-[0.2em] uppercase font-bold block text-[var(--nasa-red)]">
                    {result.outcome === "crash"
                      ? (result.maxAltitude > 500_000_000 ? "Lost to Space" : "Vehicle Lost")
                      : result.outcome === "aborted"
                        ? "Mission Aborted"
                        : result.outcome === "suborbital"
                          ? "Suborbital Only"
                          : "Fuel Exhausted"}
                  </span>
                  <div className="nasa-stripe mt-3" />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="p-3 rounded-sm border border-[var(--border)] bg-black/20 text-center">
                    <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1">Max Altitude</span>
                    <span className="font-mono text-base text-[var(--data)]">{formatDistance(result.maxAltitude)}</span>
                  </div>
                  <div className="p-3 rounded-sm border border-[var(--border)] bg-black/20 text-center">
                    <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1">Duration</span>
                    <span className="font-mono text-base text-[var(--data)]">{formatMissionTime(result.flightDuration)}</span>
                  </div>
                  <div className="p-3 rounded-sm border border-[var(--border)] bg-black/20 text-center">
                    <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1">Delta-V Used</span>
                    <span className="font-mono text-base text-[var(--data)]">{result.totalDeltaVUsed.toFixed(0)} m/s</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/debrief/${missionId}`} className="flex-1 text-center font-mono text-[0.8rem] tracking-[0.1em] uppercase py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors">
                    Debrief
                  </Link>
                  <Link href={`/builder/${missionId}`} className="flex-1 text-center font-mono text-[0.8rem] tracking-[0.1em] uppercase py-2.5 border border-[var(--nasa-gold)]/40 text-[var(--nasa-gold)] hover:bg-[var(--nasa-gold)]/10 hover:border-[var(--nasa-gold)] rounded-sm transition-colors">
                    Retry
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Success: bottom banner with green glow — sim keeps running behind it */}
          {result && isSuccessOutcome && (
            <div className="absolute bottom-0 left-0 right-0 z-10 animate-slide-up mb-8">
              <div className="mx-6 rounded-lg overflow-hidden" style={{ border: '2px solid var(--nasa-green)', boxShadow: '0 0 24px rgba(0, 230, 118, 0.25), inset 0 0 24px rgba(0, 230, 118, 0.05)', background: 'rgba(6, 13, 31, 0.85)', backdropFilter: 'blur(20px)' }}>
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                      <div className="flex items-center gap-3">
                        <span className="status-dot status-dot--active" />
                        <span className="font-mono text-[1.1rem] tracking-[0.2em] uppercase font-bold text-[var(--nasa-green)]">
                          {result.outcome === "mission_complete" ? "Mission Complete" : result.outcome === "orbit_achieved" ? "Orbit Achieved" : result.outcome === "target_reached" ? "Target Reached" : "Escape Achieved"}
                        </span>
                      </div>
                      <div className="h-6 w-px bg-[var(--nasa-green)]/30" />
                      <div className="flex items-center gap-5">
                        <div>
                          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--nasa-green)]/60 block">Max Alt</span>
                          <span className="font-mono text-[0.8rem] text-[var(--nasa-green)]">{formatDistance(result.maxAltitude)}</span>
                        </div>
                        <div>
                          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--nasa-green)]/60 block">Delta-V</span>
                          <span className="font-mono text-[0.8rem] text-[var(--nasa-green)]">{result.totalDeltaVUsed.toFixed(0)} m/s</span>
                        </div>
                        <div>
                          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--nasa-green)]/60 block">MET</span>
                          <span className="font-mono text-[0.8rem] text-[var(--nasa-green)]">{formatMissionTime(result.flightDuration)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href={`/debrief/${missionId}`} className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-6 py-2.5 bg-[var(--nasa-green)] hover:bg-[var(--nasa-green)]/80 text-black font-bold rounded-sm transition-colors">
                        Debrief
                      </Link>
                      <Link href={`/builder/${missionId}`} className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-6 py-2.5 border border-[var(--nasa-green)]/30 text-[var(--nasa-green)] hover:bg-[var(--nasa-green)]/10 rounded-sm transition-colors">
                        Retry
                      </Link>
                    </div>
                  </div>
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
              targetBody={mission.requirements.targetBody}
            />
          </div>

          {/* Time Warp — always visible */}
          <div className="p-3 border-b border-[var(--border)]">
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
              Time Warp
            </span>
            <div className="flex gap-1 flex-wrap">
              {[1, 5, 10, 50, 100, 1000, 10000].map((w) => (
                <button
                  key={w}
                  onClick={() => setWarp(w)}
                  className={`flex-1 min-w-[2rem] py-1 font-mono text-[0.6rem] rounded-sm border transition-colors ${
                    timeScale === w
                      ? "border-[var(--nasa-blue-light)] bg-[var(--nasa-blue)]/20 text-[var(--nasa-blue-light)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30"
                  }`}
                >
                  {w >= 1000 ? `${w / 1000}k` : w}x
                </button>
              ))}
            </div>
          </div>

          {/* Autopilot toggle — available during countdown and flight */}
          {launchPhase === "countdown" && (
            <div className="p-3 border-b border-[var(--border)]">
              <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-2">
                Flight Mode
              </span>
              <button
                onClick={() => setAutopilot(!autopilot)}
                className={`w-full py-2.5 font-mono text-[0.75rem] tracking-[0.1em] uppercase rounded-sm border transition-colors ${
                  autopilot
                    ? "border-[var(--nasa-green)] bg-[var(--nasa-green)]/15 text-[var(--nasa-green)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30"
                }`}
              >
                {autopilot ? "Autopilot Enabled" : "Enable Autopilot"}
              </button>
              {autopilot && (
                <p className="font-mono text-[0.5rem] text-[var(--nasa-green)]/70 mt-1.5 leading-snug">
                  Full auto: pitch, throttle &amp; staging controlled automatically.
                </p>
              )}
            </div>
          )}

          {/* Controls */}
          {hasLaunched && !result && (
            <div className="p-3 border-b border-[var(--border)]">
              <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-2">
                Flight Controls
              </span>
              <FlightControls
                onThrottleChange={handleThrottleChange}
                onPitchChange={handlePitchChange}
                onStaging={triggerStaging}
                onAbort={abort}
                onWarpChange={setWarp}
                stageCount={stageCount}
                currentStage={currentStage}
                autopilot={autopilot}
                onAutopilotToggle={setAutopilot}
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
