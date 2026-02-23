import { describe, it, expect } from "vitest";
import { analyzeFlightData } from "@/engine/analysis/FlightAnalyzer";
import { scoreFlightResult } from "@/engine/simulation/Scoring";
import { getMissionById } from "@/engine/data/missions";
import type { FlightResult, FlightSnapshot, OrbitalElements } from "@/types/physics";

function makeSnapshot(overrides: Partial<FlightSnapshot> = {}): FlightSnapshot {
  return {
    time: 0,
    altitude: 0,
    velocity: 0,
    downrangeDistance: 0,
    mass: 50_000,
    fuel: 40_000,
    currentStage: 0,
    throttle: 1,
    pitchAngle: 0,
    orbitalElements: null,
    position: { x: 6_371_000, y: 0 },
    ...overrides,
  };
}

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

function makeFlightHistory(): FlightSnapshot[] {
  const history: FlightSnapshot[] = [];

  // Simulate a ~300s flight from surface to ~200km orbit
  for (let i = 0; i <= 60; i++) {
    const t = i * 5; // 5s intervals, 0-300s
    const frac = t / 300;
    const alt = frac * frac * 200_000; // Quadratic ascent
    const vel = frac * 7800;
    const pitch = Math.min(90, frac * 120); // Gravity turn
    const stage = t > 150 ? 1 : 0;
    const fuel = Math.max(0, 40_000 - t * 120);

    history.push(
      makeSnapshot({
        time: t,
        altitude: alt,
        velocity: vel,
        mass: 50_000 - (40_000 - fuel),
        fuel,
        currentStage: stage,
        throttle: fuel > 0 ? 1 : 0,
        pitchAngle: pitch,
        position: {
          x: (6_371_000 + alt) * Math.cos((frac * Math.PI) / 4),
          y: (6_371_000 + alt) * Math.sin((frac * Math.PI) / 4),
        },
        orbitalElements:
          alt > 100_000
            ? makeOrbit({ apoapsis: alt * 1.1, periapsis: alt > 150_000 ? alt * 0.9 : -100_000 })
            : null,
      })
    );
  }
  return history;
}

function makeFlight(overrides: Partial<FlightResult> = {}): FlightResult {
  const history = makeFlightHistory();
  return {
    outcome: "mission_complete",
    history,
    finalOrbit: makeOrbit(),
    totalDeltaVUsed: 9500,
    maxAltitude: 200_000,
    flightDuration: 300,
    ...overrides,
  };
}

describe("analyzeFlightData", () => {
  it("generates insights for a successful flight", () => {
    const mission = getMissionById("1-2")!; // Orbit!
    const flight = makeFlight();
    const score = scoreFlightResult(flight, mission, 30_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    expect(analysis.insights.length).toBeGreaterThanOrEqual(1);
    expect(analysis.insights.length).toBeLessThanOrEqual(4);
  });

  it("generates crash-specific insights", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({ outcome: "crash" });
    const score = scoreFlightResult(flight, mission, 3_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    const crashInsight = analysis.insights.find((i) => i.title === "Vehicle Lost");
    expect(crashInsight).toBeDefined();
    expect(crashInsight!.type).toBe("warning");
  });

  it("generates suborbital-specific insights", () => {
    const mission = getMissionById("1-2")!;
    const flight = makeFlight({ outcome: "suborbital", maxAltitude: 80_000 });
    const score = scoreFlightResult(flight, mission, 30_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    const suborbitalInsight = analysis.insights.find((i) => i.title === "Suborbital Trajectory");
    expect(suborbitalInsight).toBeDefined();
  });

  it("detects stage separations from history", () => {
    const mission = getMissionById("1-2")!;
    const flight = makeFlight();
    const score = scoreFlightResult(flight, mission, 30_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    const stageSep = analysis.keyEvents.find((e) => e.type === "stage_separation");
    expect(stageSep).toBeDefined();
    expect(stageSep!.label).toContain("Stage");
  });

  it("detects Karman line crossing", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({ maxAltitude: 150_000 });
    const score = scoreFlightResult(flight, mission, 3_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    const karman = analysis.keyEvents.find((e) => e.type === "karman_line");
    expect(karman).toBeDefined();
    expect(karman!.altitude).toBeGreaterThanOrEqual(100_000);
  });

  it("detects max altitude event", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight();
    const score = scoreFlightResult(flight, mission, 3_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    const maxAlt = analysis.keyEvents.find((e) => e.type === "max_altitude");
    expect(maxAlt).toBeDefined();
  });

  it("estimates gravity losses as a positive number", () => {
    const mission = getMissionById("1-2")!;
    const flight = makeFlight();
    const score = scoreFlightResult(flight, mission, 30_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    expect(analysis.gravityLossEstimate).toBeGreaterThan(0);
  });

  it("estimates drag losses as a positive number for atmospheric flight", () => {
    const mission = getMissionById("1-2")!;
    const flight = makeFlight();
    const score = scoreFlightResult(flight, mission, 30_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    expect(analysis.dragLossEstimate).toBeGreaterThan(0);
  });

  it("handles empty history gracefully", () => {
    const mission = getMissionById("1-1")!;
    const flight = makeFlight({ history: [] });
    const score = scoreFlightResult(flight, mission, 3_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    expect(analysis.keyEvents).toHaveLength(0);
    expect(analysis.insights.length).toBeGreaterThanOrEqual(1);
  });

  it("returns events sorted by time", () => {
    const mission = getMissionById("1-2")!;
    const flight = makeFlight();
    const score = scoreFlightResult(flight, mission, 30_000_000);
    const analysis = analyzeFlightData(flight, mission, score);

    for (let i = 1; i < analysis.keyEvents.length; i++) {
      expect(analysis.keyEvents[i].time).toBeGreaterThanOrEqual(
        analysis.keyEvents[i - 1].time
      );
    }
  });
});
