import { describe, it, expect } from "vitest";
import { rk4Step, createLaunchState } from "@/engine/physics/trajectory";
import { circularOrbitalVelocity, orbitalElementsFromState } from "@/engine/physics/orbit";
import { EARTH_RADIUS, EARTH_MU } from "@/engine/physics/constants";
import { magnitude } from "@/lib/math";

describe("createLaunchState", () => {
  it("creates state at Earth surface with correct mass", () => {
    const state = createLaunchState(100_000, 80_000);
    expect(state.mass).toBe(100_000);
    expect(state.fuel).toBe(80_000);
    expect(state.altitude).toBe(0);
    expect(state.time).toBe(0);
  });

  it("positions at equator with rotation velocity", () => {
    const state = createLaunchState(1000, 500);
    expect(state.position.x).toBeCloseTo(EARTH_RADIUS, -3);
    expect(state.position.y).toBe(0);
    // Earth rotation at equator ~465 m/s
    expect(state.velocity.y).toBeCloseTo(465.1, 0);
  });
});

describe("rk4Step", () => {
  it("conserves energy in a free orbit (no thrust, no drag)", () => {
    // Place object in circular orbit at 200km and propagate
    const alt = 200e3;
    const r = EARTH_RADIUS + alt;
    const v = circularOrbitalVelocity(r);

    let state = {
      position: { x: r, y: 0 },
      velocity: { x: 0, y: v },
      mass: 1000,
      time: 0,
      altitude: alt,
      fuel: 0,
    };

    const dt = 1; // 1 second steps
    const noThrust = { x: 0, y: 0 };

    // Propagate for 100 steps (100 seconds)
    for (let i = 0; i < 100; i++) {
      state = rk4Step(state, dt, noThrust, 0, 0);
    }

    // Radius should remain approximately constant for circular orbit
    const finalR = magnitude(state.position);
    expect(finalR).toBeCloseTo(r, -3); // Within 1km

    // Speed should remain approximately constant
    const finalV = magnitude(state.velocity);
    expect(finalV).toBeCloseTo(v, -1); // Within 10 m/s
  });

  it("altitude decreases under gravity with no thrust", () => {
    // Start at 200km altitude with zero horizontal velocity → should fall
    const alt = 200e3;
    let state = {
      position: { x: EARTH_RADIUS + alt, y: 0 },
      velocity: { x: 0, y: 0 }, // No velocity
      mass: 1000,
      time: 0,
      altitude: alt,
      fuel: 0,
    };

    const dt = 1;
    const noThrust = { x: 0, y: 0 };

    for (let i = 0; i < 10; i++) {
      state = rk4Step(state, dt, noThrust, 0, 0);
    }

    // Should have fallen
    expect(state.altitude).toBeLessThan(alt);
  });

  it("advances time correctly", () => {
    const state = {
      position: { x: EARTH_RADIUS + 200e3, y: 0 },
      velocity: { x: 0, y: 7784 },
      mass: 1000,
      time: 0,
      altitude: 200e3,
      fuel: 0,
    };

    const result = rk4Step(state, 0.5, { x: 0, y: 0 }, 0, 0);
    expect(result.time).toBeCloseTo(0.5, 5);
  });

  it("orbital elements remain stable in circular orbit", () => {
    const alt = 400e3;
    const r = EARTH_RADIUS + alt;
    const v = circularOrbitalVelocity(r);

    let state = {
      position: { x: r, y: 0 },
      velocity: { x: 0, y: v },
      mass: 1000,
      time: 0,
      altitude: alt,
      fuel: 0,
    };

    // Propagate for 1000 seconds
    for (let i = 0; i < 1000; i++) {
      state = rk4Step(state, 1, { x: 0, y: 0 }, 0, 0);
    }

    const elements = orbitalElementsFromState(state.position, state.velocity);

    // Eccentricity should stay near 0
    expect(elements.eccentricity).toBeLessThan(0.01);
    // Periapsis should stay near 400km
    expect(elements.periapsis).toBeCloseTo(alt, -4); // within 10km
  });
});
