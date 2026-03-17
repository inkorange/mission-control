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
        if (sim.isValidating && !useFlightStore.getState().isValidating) {
          useFlightStore.getState().startValidating();
          sim.setTimeScale(1000); // Sync simulator with store
        }

        // Check if sim ended
        if (!sim.running) {
          const result = sim.getResult();
          const isSuccess = result.outcome === "mission_complete" ||
            result.outcome === "orbit_achieved" ||
            result.outcome === "target_reached" ||
            result.outcome === "escaped";

          if (isSuccess) {
            if (!useFlightStore.getState().result) {
              // First time detecting success — save result, restore pre-validation warp speed
              const restoreScale = useFlightStore.getState().isValidating
                ? Math.max(1, Math.min(100, useFlightStore.getState().timeScale))
                : useFlightStore.getState().timeScale;
              useFlightStore.setState({ result, isValidating: false, timeScale: restoreScale });
              sim.setTimeScale(restoreScale);
              saveToProgression(result);
            }
            // Resume sim so player can watch the orbit
            sim.resume();
          } else {
            // Failure — stop everything
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
