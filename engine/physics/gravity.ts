import { EARTH_MU, EARTH_RADIUS } from "./constants";
import type { Vector2D } from "@/types/physics";
import { magnitude, normalize, scale } from "@/lib/math";

/**
 * Gravitational acceleration magnitude at a given altitude.
 * g(h) = μ / r²
 *
 * @param altitudeMeters - Altitude above Earth's surface
 * @returns Gravitational acceleration in m/s²
 */
export function gravitationalAcceleration(altitudeMeters: number): number {
  const r = EARTH_RADIUS + altitudeMeters;
  return EARTH_MU / (r * r);
}

/**
 * Gravitational acceleration as a vector pointing toward Earth's center.
 *
 * @param position - Position vector from Earth's center (meters)
 * @returns Acceleration vector in m/s²
 */
export function gravityVector(position: Vector2D): Vector2D {
  const r = magnitude(position);
  if (r === 0) return { x: 0, y: 0 };

  const gMag = EARTH_MU / (r * r);
  const direction = normalize(position);
  // Gravity points toward center (opposite to position direction)
  return scale(direction, -gMag);
}
