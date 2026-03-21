"use client";

import { useRef, useCallback, useEffect } from "react";
import { FlightSimulator } from "@/engine/simulation/FlightSimulator";
import { useFlightStore } from "@/stores/useFlightStore";
import { useProgressionStore } from "@/stores/useProgressionStore";
import { calculateMissionResult } from "@/engine/simulation/calculateMissionResult";
import type { FlightResult } from "@/types/physics";
import type { RocketConfig } from "@/types/rocket";
import type { Mission } from "@/types/mission";
import type { EngineDef } from "@/types/rocket";

interface UseSimulationOptions {
  config: RocketConfig;
  mission: Mission | null;
  engineDefs: EngineDef[];
}

export function useSimulation({ config, mission, engineDefs }: UseSimulationOptions) {
  const simRef = useRef<FlightSimulator | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const launchWallTimeRef = useRef<number>(0); // Wall-clock timestamp when simulation started
  const validationStartRef = useRef<number>(0); // Wall-clock when validation started
  const deferredResultRef = useRef<FlightResult | null>(null); // Success result waiting to be shown
  const deepSpaceCutoffRef = useRef<number>(0); // Wall-clock when TLI/transfer cutoff was detected
  const MIN_FLIGHT_WALL_TIME = 20_000; // 20 seconds real time before showing success (Earth orbit)
  // Deep space: 45s at 10,000× = 450,000 sim-seconds ≈ 5.2 days — enough to watch the coast to Moon
  const DEEP_SPACE_COAST_TIME = 45_000;
  const VALIDATION_TIMEOUT = 8_000; // 8 seconds real time to validate orbit

  const {
    isActive,
    isPaused,
    startFlight,
    updateSnapshot,
    updateOrbit,
    setEvents,
    setTimeScale,
    endFlight,
    reset,
  } = useFlightStore();

  // Use ref for progression to avoid re-creating callbacks when store updates
  const completeMissionRef = useRef(useProgressionStore.getState().completeMission);
  useEffect(() => {
    completeMissionRef.current = useProgressionStore.getState().completeMission;
  });

  // Save flight result to progression store
  const saveToProgression = useCallback((flightResult: FlightResult) => {
    if (!mission) return;
    const missionResult = calculateMissionResult(flightResult, mission, config);
    completeMissionRef.current(missionResult);
  }, [mission, config]);

  // Create simulator instance (stable across renders)
  const getSimulator = useCallback(() => {
    if (!simRef.current && mission) {
      simRef.current = new FlightSimulator(config, mission, engineDefs);
    }
    return simRef.current;
  }, [config, mission, engineDefs]);

  // Animation loop
  const loop = useCallback(
    (timestamp: number) => {
      const sim = simRef.current;
      if (!sim) return;
      // Don't bail if sim stopped but we have a success result — it will be resumed
      if (!sim.running && !useFlightStore.getState().result) return;

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const dtReal = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1); // Cap at 100ms
      lastTimeRef.current = timestamp;

      // Check if a deferred success result is ready to be shown
      if (deferredResultRef.current && !useFlightStore.getState().result) {
        const isDeepSpace = !!mission?.requirements.targetBody;

        if (isDeepSpace) {
          // Deep space: show after DEEP_SPACE_COAST_TIME seconds from TLI cutoff (at max warp).
          // Timer starts the first frame after the cutoff is detected (see below).
          if (deepSpaceCutoffRef.current > 0) {
            const coastElapsed = performance.now() - deepSpaceCutoffRef.current;
            if (coastElapsed >= DEEP_SPACE_COAST_TIME) {
              const result = deferredResultRef.current;
              deferredResultRef.current = null;
              useFlightStore.setState({ result, isValidating: false, timeScale: useFlightStore.getState().timeScale });
              saveToProgression(result);
            }
          }
        } else {
          // Earth orbit: show after MIN_FLIGHT_WALL_TIME from launch
          const wallElapsed = performance.now() - launchWallTimeRef.current;
          if (wallElapsed >= MIN_FLIGHT_WALL_TIME) {
            const result = deferredResultRef.current;
            deferredResultRef.current = null;
            useFlightStore.setState({ result, isValidating: false, timeScale: useFlightStore.getState().timeScale });
            saveToProgression(result);
          }
        }
      }

      if (!useFlightStore.getState().isPaused && sim.running) {
        sim.tick(dtReal);

        // Push state to store
        const state = sim.currentState;
        const history = sim.getResult().history;
        const latestSnapshot = history[history.length - 1];
        if (latestSnapshot) {
          updateSnapshot(latestSnapshot);
        }
        updateOrbit(sim.getCurrentOrbit());
        setEvents(sim.flightEvents);

        // Check if orbit validation should start (auto-warp to coast to apoapsis)
        // Only trigger if no result yet (don't re-trigger after success)
        if (sim.isValidating && !useFlightStore.getState().isValidating && !useFlightStore.getState().result) {
          useFlightStore.getState().startValidating();
          sim.setTimeScale(1000);
          validationStartRef.current = performance.now();
        }

        // Deep space coast: throttle locked for transfer orbit, coasting to target body.
        // Auto-warp so the user watches the coast. Delay the guidance fade-out
        // so it appears closer to the actual encounter (~60% through the coast).
        if (sim.isCoasting && deepSpaceCutoffRef.current === 0 && !useFlightStore.getState().result) {
          deepSpaceCutoffRef.current = performance.now();
          sim.setTimeScale(10000);
          setTimeScale(10000);
        }

        // Start validating overlay at ~60% through the deep space coast
        if (deepSpaceCutoffRef.current > 0 && !useFlightStore.getState().isValidating && !useFlightStore.getState().result) {
          const coastElapsed = performance.now() - deepSpaceCutoffRef.current;
          if (coastElapsed >= DEEP_SPACE_COAST_TIME * 0.6) {
            useFlightStore.getState().startValidating();
          }
        }

        // Validation timeout — after 8s real time, force a determination
        if (useFlightStore.getState().isValidating && validationStartRef.current > 0
            && !useFlightStore.getState().result) {
          const valElapsed = performance.now() - validationStartRef.current;
          if (valElapsed >= VALIDATION_TIMEOUT) {
            const snap = useFlightStore.getState().currentSnapshot;
            const targetBody = mission?.requirements.targetBody;

            if (targetBody) {
              // Target body mission: bump to max warp and let the sim coast
              // The sim has its own time limit (7 days for Moon) and detection (flyby, SOI entry)
              // Don't try to predict success/failure from distance — the Moon might be anywhere in its orbit
              sim.setTimeScale(10000);
              useFlightStore.setState({ timeScale: 10000 });
              // Don't reset timer — let it keep coasting without further interruption
              validationStartRef.current = 0; // Disable further timeout checks
            } else {
              // Earth orbit mission: check altitude against target
              const target = mission?.requirements.targetOrbit;
              const targetAlt = target && isFinite(target.apoapsis.min) ? target.apoapsis.min : 0;
              const currentAlt = snap?.altitude ?? 0;

              if (currentAlt >= targetAlt * 0.9) {
                const result = sim.getResult();
                result.outcome = "mission_complete";
                useFlightStore.setState({ result, isValidating: false, timeScale: 500 });
                sim.setTimeScale(500);
                saveToProgression(result);
                sim.resume();
              } else {
                const result = sim.getResult();
                result.outcome = "orbit_achieved";
                endFlight(result);
                saveToProgression(result);
                return;
              }
            }
          }
        }

        // Check if sim ended
        if (!sim.running) {
          const result = sim.getResult();
          const isSuccess = result.outcome === "mission_complete" ||
            result.outcome === "orbit_achieved" ||
            result.outcome === "target_reached" ||
            result.outcome === "escaped";

          if (isSuccess) {
            const wallElapsed = performance.now() - launchWallTimeRef.current;
            const isSuborbital = mission?.requirements.targetOrbit?.periapsis.min === -Infinity &&
              !mission?.requirements.targetBody;
            const isDeepSpace = !!mission?.requirements.targetBody;

            if (!useFlightStore.getState().result) {
              if (isSuborbital) {
                // Suborbital: show immediately
                const currentTimeScale = useFlightStore.getState().timeScale;
                useFlightStore.setState({ result, isValidating: false, timeScale: currentTimeScale });
                saveToProgression(result);
              } else if (isDeepSpace) {
                // Deep space (lunar, Mars, etc.): always defer and run at max warp so the player
                // watches the rocket coast toward the target body before the popup appears.
                deferredResultRef.current = result;
                if (deepSpaceCutoffRef.current === 0) {
                  deepSpaceCutoffRef.current = performance.now();
                  sim.setTimeScale(10000);
                  setTimeScale(10000);
                  // Fade out Guidance/FIDO — nothing actionable once transfer orbit is locked
                  useFlightStore.getState().startValidating();
                }
              } else if (wallElapsed >= MIN_FLIGHT_WALL_TIME) {
                // Earth orbit with enough wall time: show immediately
                const currentTimeScale = useFlightStore.getState().timeScale;
                useFlightStore.setState({ result, isValidating: false, timeScale: currentTimeScale });
                saveToProgression(result);
              } else {
                // Earth orbit too early: defer
                deferredResultRef.current = result;
              }
            }
            // Resume sim so rocket continues its natural arc
            sim.resume();
          } else {
            // Failure — stop everything immediately regardless of wall time
            endFlight(result);
            saveToProgression(result);
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    },
    [updateSnapshot, updateOrbit, setEvents, endFlight, saveToProgression]
  );

  // Start the simulation
  const start = useCallback(() => {
    const sim = getSimulator();
    if (!sim) return;
    reset();
    startFlight();
    sim.start();
    // Sync simulator timeScale with the store's preferred speed
    sim.setTimeScale(useFlightStore.getState().timeScale);
    lastTimeRef.current = 0;
    launchWallTimeRef.current = performance.now();
    validationStartRef.current = 0;
    deferredResultRef.current = null;
    deepSpaceCutoffRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [getSimulator, reset, startFlight, loop]);

  // Throttle control
  const setThrottle = useCallback((value: number) => {
    simRef.current?.setThrottle(value);
  }, []);

  // Pitch control
  const setPitch = useCallback((degrees: number) => {
    simRef.current?.setPitchAngle(degrees);
  }, []);

  // Stage separation
  const triggerStaging = useCallback(() => {
    simRef.current?.triggerStageSeparation();
  }, []);

  // Abort
  const abort = useCallback(() => {
    simRef.current?.abort();
    const sim = simRef.current;
    if (sim) {
      const result = sim.getResult();
      endFlight(result);
      saveToProgression(result);
    }
  }, [endFlight, saveToProgression]);

  // Time warp
  const setWarp = useCallback(
    (scale: number) => {
      simRef.current?.setTimeScale(scale);
      setTimeScale(scale);
    },
    [setTimeScale]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      simRef.current = null;
    };
  }, []);

  return {
    start,
    setThrottle,
    setPitch,
    triggerStaging,
    abort,
    setWarp,
    simulator: simRef,
  };
}
