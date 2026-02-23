import { describe, it, expect } from "vitest";
import { calculateMissionResult } from "@/engine/simulation/calculateMissionResult";
import { getMissionById } from "@/engine/data/missions";
import type { FlightResult, OrbitalElements } from "@/types/physics";
import type { RocketConfig } from "@/types/rocket";

function makeOrbit(overrides: Partial<OrbitalElements> = {}): OrbitalElements {
  return {
    semiMajorAxis: 6_571_000,
    eccentricity: 0.001,
    inclination: 0,
    apoapsis: 200_000,
    periapsis: 190_000,
    period: 5310,
    ...overrides,
  };
}

function makeFlight(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
    outcome: "mission_complete",
    history: [
      {
        time: 300,
        altitude: 200_000,
        velocity: 7800,
        downrangeDistance: 500_000,
        mass: 5000,
        fuel: 100,
        currentStage: 0,
        throttle: 1,
        pitchAngle: 0,
        orbitalElements: makeOrbit(),
        position: { x: 6_571_000, y: 0 },
      },
    ],
    finalOrbit: makeOrbit(),
    totalDeltaVUsed: 9500,
    maxAltitude: 200_000,
    flightDuration: 300,
    ...overrides,
  };
}

function makeRocket(totalCost = 10_000_000): RocketConfig {
  return {
    id: "test-rocket",
    name: "Test Rocket",
    stages: [],
    payload: { name: "Payload", mass: 0 },
    totalCost,
    totalMass: 50_000,
    totalDryMass: 5_000,
  };
}

describe("calculateMissionResult", () => {
  it("awards stars for a successful mission", () => {
    const mission = getMissionById("1-2")!; // Orbit!
    const flight = makeFlight({
      outcome: "mission_complete",
      finalOrbit: makeOrbit({ periapsis: 200_000, apoapsis: 210_000 }),
    });
    const result = calculateMissionResult(flight, mission, makeRocket(30_000_000));
    expect(result.stars).toBeGreaterThanOrEqual(1);
    expect(result.stars).toBeLessThanOrEqual(3);
    expect(result.bestScore).toBeGreaterThan(0);
    expect(result.missionId).toBe("1-2");
  });

  it("awards 0 stars for a crash", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({ outcome: "crash" });
    const result = calculateMissionResult(flight, mission, makeRocket());
    expect(result.stars).toBe(0);
  });

  it("awards 0 stars for an abort", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({ outcome: "aborted" });
    const result = calculateMissionResult(flight, mission, makeRocket());
    expect(result.stars).toBe(0);
  });

  it("awards 0 stars for fuel exhaustion", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({ outcome: "fuel_exhausted" });
    const result = calculateMissionResult(flight, mission, makeRocket());
    expect(result.stars).toBe(0);
  });

  it("evaluates bonus challenge when condition is met", () => {
    const mission = getMissionById("1-1")!; // First Light — bonus: reach 150km
    const flight = makeFlight({
      outcome: "mission_complete",
      maxAltitude: 160_000,
    });
    const result = calculateMissionResult(flight, mission, makeRocket(3_000_000));
    expect(result.bonusCompleted).toContain("1-1-bonus-1");
  });

  it("does not award bonus on failed mission", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({
      outcome: "crash",
      maxAltitude: 160_000,
    });
    const result = calculateMissionResult(flight, mission, makeRocket(3_000_000));
    expect(result.bonusCompleted).toHaveLength(0);
  });

  it("does not award bonus when condition is not met", () => {
    const mission = getMissionById("1-1")!; // Bonus: reach 150km
    const flight = makeFlight({
      outcome: "mission_complete",
      maxAltitude: 110_000,
    });
    const result = calculateMissionResult(flight, mission, makeRocket(3_000_000));
    expect(result.bonusCompleted).not.toContain("1-1-bonus-1");
  });

  it("evaluates cost-based bonus correctly when under budget", () => {
    const mission = getMissionById("1-3")!; // Bonus: complete under $60M
    const flight = makeFlight({
      outcome: "mission_complete",
      finalOrbit: makeOrbit({ periapsis: 300_000, apoapsis: 400_000 }),
    });
    const result = calculateMissionResult(flight, mission, makeRocket(50_000_000));
    expect(result.bonusCompleted).toContain("1-3-bonus-1");
  });

  it("does not award cost-based bonus when over threshold", () => {
    const mission = getMissionById("1-3")!; // Bonus: complete under $60M
    const flight = makeFlight({
      outcome: "mission_complete",
      finalOrbit: makeOrbit({ periapsis: 300_000, apoapsis: 400_000 }),
    });
    const result = calculateMissionResult(flight, mission, makeRocket(75_000_000));
    expect(result.bonusCompleted).not.toContain("1-3-bonus-1");
  });

  it("handles suborbital missions (First Light) without NaN", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({
      outcome: "mission_complete",
      maxAltitude: 120_000,
      totalDeltaVUsed: 1500,
      finalOrbit: null,
    });
    const result = calculateMissionResult(flight, mission, makeRocket(3_500_000));
    expect(result.stars).toBeGreaterThanOrEqual(1);
    expect(result.bestScore).not.toBeNaN();
    expect(result.bestScore).toBeGreaterThan(0);
  });

  it("includes completedAt timestamp", () => {
    const mission = getMissionById("1-1")!;
    const before = Date.now();
    const flight = makeFlight({ outcome: "mission_complete", maxAltitude: 120_000 });
    const result = calculateMissionResult(flight, mission, makeRocket(3_500_000));
    expect(result.completedAt).toBeGreaterThanOrEqual(before);
    expect(result.completedAt).toBeLessThanOrEqual(Date.now());
  });

  it("stores the rocket config in the result", () => {
    const mission = getMissionById("1-1")!;
    const rocket = makeRocket(5_000_000);
    const flight = makeFlight({ outcome: "mission_complete", maxAltitude: 120_000 });
    const result = calculateMissionResult(flight, mission, rocket);
    expect(result.bestRocketConfig).toBe(rocket);
  });
});
