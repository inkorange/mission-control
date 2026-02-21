import { describe, it, expect } from "vitest";
import {
  atmosphericDensity,
  dragForce,
  dragForceVector,
} from "@/engine/physics/atmosphere";
import { SEA_LEVEL_DENSITY, KARMAN_LINE } from "@/engine/physics/constants";
import { magnitude } from "@/lib/math";

describe("atmosphericDensity", () => {
  it("returns sea level density at altitude 0", () => {
    expect(atmosphericDensity(0)).toBeCloseTo(SEA_LEVEL_DENSITY, 5);
  });

  it("returns approximately 0.414 kg/m³ at 10km", () => {
    const rho = atmosphericDensity(10_000);
    // e^(-10000/8500) = e^(-1.176) ≈ 0.308
    // 1.225 * 0.308 ≈ 0.378
    expect(rho).toBeGreaterThan(0.3);
    expect(rho).toBeLessThan(0.45);
  });

  it("returns very low density at 50km", () => {
    const rho = atmosphericDensity(50_000);
    expect(rho).toBeLessThan(0.01);
  });

  it("returns 0 above the Kármán line", () => {
    expect(atmosphericDensity(KARMAN_LINE + 1)).toBe(0);
    expect(atmosphericDensity(200_000)).toBe(0);
  });

  it("returns sea level density for negative altitude", () => {
    expect(atmosphericDensity(-100)).toBe(SEA_LEVEL_DENSITY);
  });

  it("decreases monotonically with altitude", () => {
    let prev = atmosphericDensity(0);
    for (let alt = 1000; alt <= 100_000; alt += 1000) {
      const current = atmosphericDensity(alt);
      expect(current).toBeLessThanOrEqual(prev);
      prev = current;
    }
  });
});

describe("dragForce", () => {
  it("returns 0 at zero velocity", () => {
    expect(dragForce(0, 0, 0.2, 10)).toBe(0);
  });

  it("returns 0 above the Kármán line", () => {
    expect(dragForce(1000, 150_000, 0.2, 10)).toBe(0);
  });

  it("increases with the square of velocity", () => {
    const f1 = dragForce(100, 0, 0.2, 10);
    const f2 = dragForce(200, 0, 0.2, 10);
    // f2 should be 4x f1
    expect(f2 / f1).toBeCloseTo(4, 5);
  });

  it("computes a reasonable value at sea level", () => {
    // F = 0.5 * 1.225 * 300² * 0.2 * 10 = 0.5 * 1.225 * 90000 * 2 = 110,250 N
    const force = dragForce(300, 0, 0.2, 10);
    expect(force).toBeCloseTo(110_250, -2);
  });
});

describe("dragForceVector", () => {
  it("opposes the velocity direction", () => {
    const velocity = { x: 100, y: 0 };
    const drag = dragForceVector(velocity, 0, 0.2, 10);
    // Should point in -x direction
    expect(drag.x).toBeLessThan(0);
    expect(Math.abs(drag.y)).toBeLessThan(1e-10);
  });

  it("returns zero vector for zero velocity", () => {
    const drag = dragForceVector({ x: 0, y: 0 }, 0, 0.2, 10);
    expect(drag.x).toBe(0);
    expect(drag.y).toBe(0);
  });

  it("magnitude matches scalar dragForce", () => {
    const velocity = { x: 300, y: 400 }; // speed = 500
    const drag = dragForceVector(velocity, 5000, 0.2, 10);
    const scalarDrag = dragForce(500, 5000, 0.2, 10);
    expect(magnitude(drag)).toBeCloseTo(scalarDrag, 2);
  });
});
