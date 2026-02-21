import {
  SEA_LEVEL_DENSITY,
  SCALE_HEIGHT,
  KARMAN_LINE,
} from "./constants";
import type { Vector2D } from "@/types/physics";
import { magnitude, normalize, scale } from "@/lib/math";

/**
 * Atmospheric density using exponential model.
 * ρ(h) = ρ₀ × e^(-h / H)
 *
 * @param altitudeMeters - Altitude above surface in meters
 * @returns Density in kg/m³
 */
export function atmosphericDensity(altitudeMeters: number): number {
  if (altitudeMeters < 0) return SEA_LEVEL_DENSITY;
  if (altitudeMeters > KARMAN_LINE) return 0;
  return SEA_LEVEL_DENSITY * Math.exp(-altitudeMeters / SCALE_HEIGHT);
}

/**
 * Atmospheric drag force magnitude.
 * F_drag = ½ × ρ × v² × Cd × A
 *
 * @param velocity - Speed in m/s
 * @param altitude - Altitude above surface in meters
 * @param dragCoeff - Drag coefficient (typically ~0.2 for rockets)
 * @param crossSection - Cross-sectional area in m²
 * @returns Drag force in Newtons
 */
export function dragForce(
  velocity: number,
  altitude: number,
  dragCoeff: number,
  crossSection: number
): number {
  const rho = atmosphericDensity(altitude);
  return 0.5 * rho * velocity * velocity * dragCoeff * crossSection;
}

/**
 * Drag force as a vector opposing the velocity direction.
 */
export function dragForceVector(
  velocity: Vector2D,
  altitude: number,
  dragCoeff: number,
  crossSection: number
): Vector2D {
  const speed = magnitude(velocity);
  if (speed === 0) return { x: 0, y: 0 };

  const dragMag = dragForce(speed, altitude, dragCoeff, crossSection);
  const dragDir = normalize(velocity);
  // Drag opposes velocity
  return scale(dragDir, -dragMag);
}
