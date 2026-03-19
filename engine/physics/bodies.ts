import type { Vector2D } from "@/types/physics";
import type { Mission } from "@/types/mission";
import { magnitude, sub } from "@/lib/math";
import {
  MOON_MU, MOON_RADIUS, MOON_DISTANCE, MOON_ORBITAL_PERIOD, MOON_SOI,
  MARS_MU, MARS_RADIUS, MARS_DISTANCE, MARS_ORBITAL_PERIOD, MARS_SOI,
  JUPITER_MU, JUPITER_RADIUS, JUPITER_DISTANCE, JUPITER_ORBITAL_PERIOD, JUPITER_SOI,
  SATURN_MU, SATURN_RADIUS, SATURN_DISTANCE, SATURN_ORBITAL_PERIOD, SATURN_SOI,
  SUN_MU, SUN_DISTANCE,
} from "./constants";

export interface CelestialBody {
  id: string;
  name: string;
  mu: number;
  radius: number;
  soiRadius: number;
  orbitRadius: number; // distance from parent body center
  orbitalPeriod: number; // seconds
  parentBody: "earth" | "sun";
}

export const MOON: CelestialBody = {
  id: "moon",
  name: "Moon",
  mu: MOON_MU,
  radius: MOON_RADIUS,
  soiRadius: MOON_SOI,
  orbitRadius: MOON_DISTANCE,
  orbitalPeriod: MOON_ORBITAL_PERIOD,
  parentBody: "earth",
};

export const MARS: CelestialBody = {
  id: "mars",
  name: "Mars",
  mu: MARS_MU,
  radius: MARS_RADIUS,
  soiRadius: MARS_SOI,
  orbitRadius: MARS_DISTANCE,
  orbitalPeriod: MARS_ORBITAL_PERIOD,
  parentBody: "sun",
};

export const JUPITER: CelestialBody = {
  id: "jupiter",
  name: "Jupiter",
  mu: JUPITER_MU,
  radius: JUPITER_RADIUS,
  soiRadius: JUPITER_SOI,
  orbitRadius: JUPITER_DISTANCE,
  orbitalPeriod: JUPITER_ORBITAL_PERIOD,
  parentBody: "sun",
};

export const SATURN: CelestialBody = {
  id: "saturn",
  name: "Saturn",
  mu: SATURN_MU,
  radius: SATURN_RADIUS,
  soiRadius: SATURN_SOI,
  orbitRadius: SATURN_DISTANCE,
  orbitalPeriod: SATURN_ORBITAL_PERIOD,
  parentBody: "sun",
};

const ALL_BODIES: CelestialBody[] = [MOON, MARS, JUPITER, SATURN];

// Moon's orbital phase at T=0 — calibrated so a default TLI trajectory from the launch
// site reaches the Moon's SOI on the first pass (~5 days after launch).
// The rocket's TLI apoapsis direction is ~203° (23° orbit arc during ascent + 180°).
// Moon must be at 203° after 5-day transit, having started 66° earlier → 137°.
// Using 135° gives a small margin for timing variation.
const MOON_INITIAL_PHASE = (135 * Math.PI) / 180;

/**
 * Compute a celestial body's position in Earth-centered coordinates.
 *
 * Moon: orbits Earth directly in a circle.
 * Planets: orbit the Sun; position = sunPos + heliocentricPos, then subtract Earth
 *          (Earth is at origin, so sunPos is at -SUN_DISTANCE on the x-axis initially,
 *           rotating with Earth's orbital period of ~365.25 days).
 *
 * Uses circular orbit approximation with angular velocity = 2π / period.
 */
export function getBodyPosition(body: CelestialBody, simTime: number): Vector2D {
  if (body.parentBody === "earth") {
    // Moon orbits Earth directly, starting at calibrated phase for TLI alignment
    const angle = MOON_INITIAL_PHASE + (2 * Math.PI * simTime) / body.orbitalPeriod;
    return {
      x: body.orbitRadius * Math.cos(angle),
      y: body.orbitRadius * Math.sin(angle),
    };
  }

  // Planet orbits the Sun — compute in Earth-centered frame.
  // Sun's position relative to Earth (Earth orbits Sun at 1 AU, period ~365.25 days)
  const earthOrbitalPeriod = 365.25 * 86400;
  const earthAngle = (2 * Math.PI * simTime) / earthOrbitalPeriod;
  // In Earth-centered frame, the Sun appears to orbit Earth
  const sunPos: Vector2D = {
    x: SUN_DISTANCE * Math.cos(earthAngle + Math.PI), // Sun starts opposite
    y: SUN_DISTANCE * Math.sin(earthAngle + Math.PI),
  };

  // Planet's heliocentric position
  const planetAngle = (2 * Math.PI * simTime) / body.orbitalPeriod;
  const helioPos: Vector2D = {
    x: body.orbitRadius * Math.cos(planetAngle),
    y: body.orbitRadius * Math.sin(planetAngle),
  };

  // Earth-centered = sunPos + helioPos (sun position is already Earth-centered)
  return {
    x: sunPos.x + helioPos.x,
    y: sunPos.y + helioPos.y,
  };
}

/**
 * Compute a body's velocity in Earth-centered coordinates (for orbital element computation).
 */
export function getBodyVelocity(body: CelestialBody, simTime: number): Vector2D {
  if (body.parentBody === "earth") {
    const angle = MOON_INITIAL_PHASE + (2 * Math.PI * simTime) / body.orbitalPeriod;
    const v = (2 * Math.PI * body.orbitRadius) / body.orbitalPeriod;
    return {
      x: -v * Math.sin(angle),
      y: v * Math.cos(angle),
    };
  }

  // For planets: velocity = sun velocity + planet heliocentric velocity
  const earthOrbitalPeriod = 365.25 * 86400;
  const earthAngle = (2 * Math.PI * simTime) / earthOrbitalPeriod;
  const earthV = (2 * Math.PI * SUN_DISTANCE) / earthOrbitalPeriod;
  const sunVel: Vector2D = {
    x: -earthV * Math.sin(earthAngle + Math.PI),
    y: earthV * Math.cos(earthAngle + Math.PI),
  };

  const planetAngle = (2 * Math.PI * simTime) / body.orbitalPeriod;
  const planetV = (2 * Math.PI * body.orbitRadius) / body.orbitalPeriod;
  const helioVel: Vector2D = {
    x: -planetV * Math.sin(planetAngle),
    y: planetV * Math.cos(planetAngle),
  };

  return {
    x: sunVel.x + helioVel.x,
    y: sunVel.y + helioVel.y,
  };
}

/**
 * Get bodies to simulate based on mission.
 * Tier 1-2: no extra bodies (Earth only).
 * Tier 3: Moon.
 * Tier 4: Moon + Mars.
 * Tier 5: Moon + Mars + Jupiter + Saturn.
 */
export function getActiveBodies(mission: Mission): CelestialBody[] {
  if (mission.tier <= 2) return [];
  if (mission.tier === 3) return [MOON];
  if (mission.tier === 4) return [MOON, MARS];
  return ALL_BODIES; // Tier 5
}

/**
 * Compute positions of all active bodies at a given sim time.
 */
export function computeBodyPositions(
  bodies: CelestialBody[],
  simTime: number
): Record<string, Vector2D> {
  const positions: Record<string, Vector2D> = {};
  for (const body of bodies) {
    positions[body.id] = getBodyPosition(body, simTime);
  }
  return positions;
}

/**
 * Determine which body's SOI the spacecraft is currently in.
 * Checks from smallest to largest SOI. Returns "earth" as default.
 */
export function getSOIBody(
  position: Vector2D,
  bodies: CelestialBody[],
  bodyPositions: Record<string, Vector2D>
): string {
  // Check bodies sorted by SOI radius (smallest first — Moon before Mars, etc.)
  const sorted = [...bodies].sort((a, b) => a.soiRadius - b.soiRadius);
  for (const body of sorted) {
    const bodyPos = bodyPositions[body.id];
    if (!bodyPos) continue;
    const dist = magnitude(sub(position, bodyPos));
    if (dist < body.soiRadius) {
      return body.id;
    }
  }
  return "earth";
}

/**
 * Get distance from spacecraft to a specific body.
 */
export function distanceToBody(
  position: Vector2D,
  bodyId: string,
  bodyPositions: Record<string, Vector2D>
): number | null {
  const bodyPos = bodyPositions[bodyId];
  if (!bodyPos) return null;
  return magnitude(sub(position, bodyPos));
}

/**
 * Get the Sun's gravitational parameter for computing solar escape.
 */
export function getSunMu(): number {
  return SUN_MU;
}
