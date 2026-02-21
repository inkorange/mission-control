import { describe, it, expect } from "vitest";
import {
  orbitalElementsFromState,
  circularOrbitalVelocity,
  hohmannDeltaV,
  orbitalVelocity,
  escapeVelocity,
  orbitalPeriod,
  isOrbitStable,
} from "@/engine/physics/orbit";
import { EARTH_RADIUS, EARTH_MU, GEO_ALTITUDE } from "@/engine/physics/constants";

describe("circularOrbitalVelocity", () => {
  it("computes LEO velocity at 200km correctly (~7,784 m/s)", () => {
    const r = EARTH_RADIUS + 200e3;
    const v = circularOrbitalVelocity(r);
    // Known value: ~7,784 m/s at 200km LEO
    expect(v).toBeGreaterThan(7700);
    expect(v).toBeLessThan(7850);
  });

  it("computes GEO velocity correctly (~3,075 m/s)", () => {
    const r = EARTH_RADIUS + GEO_ALTITUDE;
    const v = circularOrbitalVelocity(r);
    // Known value: ~3,075 m/s at GEO
    expect(v).toBeGreaterThan(3000);
    expect(v).toBeLessThan(3100);
  });

  it("surface velocity is ~7,905 m/s", () => {
    const v = circularOrbitalVelocity(EARTH_RADIUS);
    expect(v).toBeGreaterThan(7850);
    expect(v).toBeLessThan(7950);
  });
});

describe("orbitalElementsFromState", () => {
  it("computes circular LEO elements correctly", () => {
    const r = EARTH_RADIUS + 200e3;
    const v = Math.sqrt(EARTH_MU / r);
    const elements = orbitalElementsFromState({ x: r, y: 0 }, { x: 0, y: v });

    expect(elements.eccentricity).toBeCloseTo(0, 2);
    expect(elements.apoapsis).toBeCloseTo(200e3, -4); // within 10km
    expect(elements.periapsis).toBeCloseTo(200e3, -4);
    expect(elements.semiMajorAxis).toBeCloseTo(r, -3);
  });

  it("computes elliptical orbit elements", () => {
    const r = EARTH_RADIUS + 200e3;
    // Give it 10% more velocity than circular → elliptical
    const vCirc = Math.sqrt(EARTH_MU / r);
    const v = vCirc * 1.1;
    const elements = orbitalElementsFromState({ x: r, y: 0 }, { x: 0, y: v });

    expect(elements.eccentricity).toBeGreaterThan(0.05);
    expect(elements.eccentricity).toBeLessThan(1);
    expect(elements.apoapsis).toBeGreaterThan(200e3);
    expect(elements.periapsis).toBeCloseTo(200e3, -4);
  });

  it("periapsis matches starting altitude for prograde velocity", () => {
    const alt = 400e3;
    const r = EARTH_RADIUS + alt;
    const vCirc = Math.sqrt(EARTH_MU / r);
    // Slightly above circular = periapsis at current position
    const v = vCirc * 1.05;
    const elements = orbitalElementsFromState({ x: r, y: 0 }, { x: 0, y: v });

    expect(elements.periapsis).toBeCloseTo(alt, -4);
  });
});

describe("hohmannDeltaV", () => {
  it("computes LEO to GEO transfer correctly (~3,935 m/s total)", () => {
    const r1 = EARTH_RADIUS + 200e3;
    const r2 = EARTH_RADIUS + GEO_ALTITUDE;
    const transfer = hohmannDeltaV(r1, r2);

    // Known value: ~3,935 m/s total for LEO→GEO Hohmann
    expect(transfer.total).toBeGreaterThan(3800);
    expect(transfer.total).toBeLessThan(4100);

    // Burn 1 should be larger than burn 2
    expect(transfer.burn1).toBeGreaterThan(transfer.burn2);

    // Both burns should be positive
    expect(transfer.burn1).toBeGreaterThan(0);
    expect(transfer.burn2).toBeGreaterThan(0);
  });

  it("returns 0 for same orbit", () => {
    const r = EARTH_RADIUS + 200e3;
    const transfer = hohmannDeltaV(r, r);
    expect(transfer.total).toBeCloseTo(0, 5);
  });

  it("computes LEO to 800km transfer", () => {
    const r1 = EARTH_RADIUS + 200e3;
    const r2 = EARTH_RADIUS + 800e3;
    const transfer = hohmannDeltaV(r1, r2);

    // Should be a modest delta-v
    expect(transfer.total).toBeGreaterThan(100);
    expect(transfer.total).toBeLessThan(500);
  });
});

describe("escapeVelocity", () => {
  it("computes escape velocity from LEO (~10,930 m/s)", () => {
    const r = EARTH_RADIUS + 200e3;
    const vEsc = escapeVelocity(r);
    // Known: ~10,930 m/s from 200km LEO
    expect(vEsc).toBeGreaterThan(10800);
    expect(vEsc).toBeLessThan(11100);
  });

  it("escape velocity is sqrt(2) times circular velocity", () => {
    const r = EARTH_RADIUS + 500e3;
    const vCirc = circularOrbitalVelocity(r);
    const vEsc = escapeVelocity(r);
    expect(vEsc / vCirc).toBeCloseTo(Math.SQRT2, 5);
  });
});

describe("orbitalPeriod", () => {
  it("computes LEO period correctly (~88 minutes)", () => {
    const a = EARTH_RADIUS + 200e3;
    const period = orbitalPeriod(a);
    // ~88.5 minutes = ~5310 seconds
    expect(period).toBeGreaterThan(5200);
    expect(period).toBeLessThan(5500);
  });

  it("computes GEO period correctly (~24 hours)", () => {
    const a = EARTH_RADIUS + GEO_ALTITUDE;
    const period = orbitalPeriod(a);
    // Should be ~86164 seconds (sidereal day)
    expect(period).toBeGreaterThan(85000);
    expect(period).toBeLessThan(87500);
  });

  it("returns Infinity for negative semi-major axis", () => {
    expect(orbitalPeriod(-1000)).toBe(Infinity);
  });
});

describe("isOrbitStable", () => {
  it("returns true for circular LEO", () => {
    const r = EARTH_RADIUS + 200e3;
    const v = circularOrbitalVelocity(r);
    const elements = orbitalElementsFromState({ x: r, y: 0 }, { x: 0, y: v });
    expect(isOrbitStable(elements)).toBe(true);
  });

  it("returns false when periapsis is below surface", () => {
    expect(
      isOrbitStable({
        semiMajorAxis: EARTH_RADIUS + 100e3,
        eccentricity: 0.5,
        inclination: 0,
        apoapsis: 500e3,
        periapsis: -100e3, // Below surface
        period: 5000,
      })
    ).toBe(false);
  });
});
