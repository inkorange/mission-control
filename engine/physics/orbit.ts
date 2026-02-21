import { EARTH_MU, EARTH_RADIUS } from "./constants";
import type { Vector2D, OrbitalElements, HohmannTransfer } from "@/types/physics";
import { magnitude, dot, cross2D } from "@/lib/math";

/**
 * Compute orbital elements from position and velocity state vectors.
 * Uses the vis-viva equation and eccentricity vector.
 *
 * @param position - Position from Earth center (meters)
 * @param velocity - Velocity (m/s)
 * @returns Keplerian orbital elements
 */
export function orbitalElementsFromState(
  position: Vector2D,
  velocity: Vector2D
): OrbitalElements {
  const r = magnitude(position);
  const v = magnitude(velocity);

  // Specific orbital energy: ε = v²/2 - μ/r
  const energy = (v * v) / 2 - EARTH_MU / r;

  // Semi-major axis: a = -μ / (2ε)
  // For hyperbolic orbits (energy > 0), a is negative
  const a = -EARTH_MU / (2 * energy);

  // Specific angular momentum (scalar for 2D)
  const h = cross2D(position, velocity);

  // Eccentricity vector
  const eVecX =
    (v * v * position.x - dot(position, velocity) * velocity.x) / EARTH_MU -
    position.x / r;
  const eVecY =
    (v * v * position.y - dot(position, velocity) * velocity.y) / EARTH_MU -
    position.y / r;
  const e = Math.sqrt(eVecX * eVecX + eVecY * eVecY);

  // Apoapsis and periapsis (above surface)
  const apoapsis = a * (1 + e) - EARTH_RADIUS;
  const periapsis = a * (1 - e) - EARTH_RADIUS;

  // Period (only meaningful for elliptical orbits)
  const period =
    a > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / EARTH_MU) : Infinity;

  return {
    semiMajorAxis: a,
    eccentricity: e,
    inclination: 0, // 2D simulation — always equatorial
    apoapsis,
    periapsis,
    period,
  };
}

/**
 * Circular orbital velocity at a given radius from Earth center.
 * v = √(μ / r)
 */
export function circularOrbitalVelocity(radiusFromCenter: number): number {
  return Math.sqrt(EARTH_MU / radiusFromCenter);
}

/**
 * Orbital velocity at a given radius for a given semi-major axis.
 * Vis-viva: v = √(μ × (2/r - 1/a))
 */
export function orbitalVelocity(
  radiusFromCenter: number,
  semiMajorAxis: number
): number {
  return Math.sqrt(EARTH_MU * (2 / radiusFromCenter - 1 / semiMajorAxis));
}

/**
 * Delta-v for a Hohmann transfer between two circular orbits.
 *
 * @param r1 - Radius of initial orbit from Earth center (meters)
 * @param r2 - Radius of target orbit from Earth center (meters)
 * @returns Delta-v for each burn and total
 */
export function hohmannDeltaV(r1: number, r2: number): HohmannTransfer {
  const v1 = Math.sqrt(EARTH_MU / r1);
  const aTransfer = (r1 + r2) / 2;

  const vTransferAtR1 = Math.sqrt(EARTH_MU * (2 / r1 - 1 / aTransfer));
  const vTransferAtR2 = Math.sqrt(EARTH_MU * (2 / r2 - 1 / aTransfer));
  const v2 = Math.sqrt(EARTH_MU / r2);

  const burn1 = Math.abs(vTransferAtR1 - v1);
  const burn2 = Math.abs(v2 - vTransferAtR2);

  return {
    burn1,
    burn2,
    total: burn1 + burn2,
  };
}

/**
 * Escape velocity from a given radius.
 * v_esc = √(2μ / r)
 */
export function escapeVelocity(radiusFromCenter: number): number {
  return Math.sqrt((2 * EARTH_MU) / radiusFromCenter);
}

/**
 * Orbital period for a given semi-major axis.
 * T = 2π × √(a³ / μ)
 */
export function orbitalPeriod(semiMajorAxis: number): number {
  if (semiMajorAxis <= 0) return Infinity;
  return (
    2 * Math.PI * Math.sqrt((semiMajorAxis ** 3) / EARTH_MU)
  );
}

/**
 * Check if an orbit is stable (periapsis above surface).
 */
export function isOrbitStable(elements: OrbitalElements): boolean {
  return (
    elements.eccentricity < 1 &&
    elements.periapsis > 0 &&
    elements.apoapsis > 0
  );
}

/**
 * Check if orbital elements match a target within tolerances.
 */
export function orbitMatchesTarget(
  actual: OrbitalElements,
  targetPeriapsis: { min: number; max: number },
  targetApoapsis: { min: number; max: number }
): boolean {
  return (
    actual.periapsis >= targetPeriapsis.min &&
    actual.periapsis <= targetPeriapsis.max &&
    actual.apoapsis >= targetApoapsis.min &&
    actual.apoapsis <= targetApoapsis.max
  );
}
