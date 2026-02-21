import { describe, it, expect } from "vitest";
import {
  gravitationalAcceleration,
  gravityVector,
} from "@/engine/physics/gravity";
import { G0, EARTH_RADIUS } from "@/engine/physics/constants";
import { magnitude } from "@/lib/math";

describe("gravitationalAcceleration", () => {
  it("returns ~9.81 m/s² at sea level", () => {
    const g = gravitationalAcceleration(0);
    expect(g).toBeCloseTo(G0, 1);
  });

  it("decreases with altitude", () => {
    const gSurface = gravitationalAcceleration(0);
    const g100km = gravitationalAcceleration(100_000);
    const g400km = gravitationalAcceleration(400_000);

    expect(g100km).toBeLessThan(gSurface);
    expect(g400km).toBeLessThan(g100km);
  });

  it("follows inverse square law", () => {
    // At altitude = EARTH_RADIUS (i.e., r = 2 * EARTH_RADIUS), g should be 1/4
    const gSurface = gravitationalAcceleration(0);
    const gDoubleR = gravitationalAcceleration(EARTH_RADIUS);
    expect(gDoubleR / gSurface).toBeCloseTo(0.25, 2);
  });

  it("returns ~8.7 m/s² at ISS altitude (400km)", () => {
    const g = gravitationalAcceleration(400_000);
    expect(g).toBeGreaterThan(8.5);
    expect(g).toBeLessThan(9.0);
  });
});

describe("gravityVector", () => {
  it("points toward Earth center", () => {
    const pos = { x: EARTH_RADIUS + 200e3, y: 0 };
    const g = gravityVector(pos);
    // Should point in -x direction
    expect(g.x).toBeLessThan(0);
    expect(Math.abs(g.y)).toBeLessThan(1e-10);
  });

  it("has correct magnitude", () => {
    const alt = 200e3;
    const pos = { x: EARTH_RADIUS + alt, y: 0 };
    const g = gravityVector(pos);
    const expectedMag = gravitationalAcceleration(alt);
    expect(magnitude(g)).toBeCloseTo(expectedMag, 3);
  });

  it("returns zero vector at origin", () => {
    const g = gravityVector({ x: 0, y: 0 });
    expect(g.x).toBe(0);
    expect(g.y).toBe(0);
  });
});
