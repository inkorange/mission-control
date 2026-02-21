import { EARTH_MU, EARTH_RADIUS } from "./constants";
import { atmosphericDensity } from "./atmosphere";
import type { Vector2D, SimState } from "@/types/physics";
import { add, scale, magnitude, normalize, dot } from "@/lib/math";

interface Derivatives {
  dPos: Vector2D;
  dVel: Vector2D;
}

/**
 * Compute acceleration from all forces: gravity, thrust, drag.
 */
function computeAcceleration(
  position: Vector2D,
  velocity: Vector2D,
  mass: number,
  thrust: Vector2D,
  dragCoeff: number,
  crossSection: number
): Vector2D {
  const r = magnitude(position);
  if (r === 0 || mass <= 0) return { x: 0, y: 0 };

  // Gravity: pointing toward Earth center
  const gMag = EARTH_MU / (r * r);
  const gravDir = normalize(position);
  const gravity: Vector2D = scale(gravDir, -gMag);

  // Drag: opposing velocity direction
  const altitude = r - EARTH_RADIUS;
  const speed = magnitude(velocity);
  let drag: Vector2D = { x: 0, y: 0 };
  if (speed > 0 && altitude < 100_000) {
    const rho = atmosphericDensity(altitude);
    const dragMag = (0.5 * rho * speed * speed * dragCoeff * crossSection) / mass;
    const velDir = normalize(velocity);
    drag = scale(velDir, -dragMag);
  }

  // Thrust acceleration
  const thrustAccel = scale(thrust, 1 / mass);

  return add(add(gravity, drag), thrustAccel);
}

function stateDerivatives(
  position: Vector2D,
  velocity: Vector2D,
  mass: number,
  thrust: Vector2D,
  dragCoeff: number,
  crossSection: number
): Derivatives {
  const accel = computeAcceleration(
    position,
    velocity,
    mass,
    thrust,
    dragCoeff,
    crossSection
  );
  return { dPos: velocity, dVel: accel };
}

/**
 * 4th-order Runge-Kutta integration step.
 *
 * Propagates the simulation state forward by dt seconds, accounting for
 * gravity, atmospheric drag, and thrust.
 *
 * @param state - Current simulation state
 * @param dt - Timestep in seconds
 * @param thrust - Thrust vector in Newtons (world frame)
 * @param dragCoeff - Drag coefficient
 * @param crossSection - Cross-sectional area (m²)
 * @returns Updated simulation state
 */
export function rk4Step(
  state: SimState,
  dt: number,
  thrust: Vector2D,
  dragCoeff: number,
  crossSection: number
): SimState {
  const { position, velocity, mass } = state;

  // k1
  const k1 = stateDerivatives(position, velocity, mass, thrust, dragCoeff, crossSection);

  // k2
  const pos2 = add(position, scale(k1.dPos, dt / 2));
  const vel2 = add(velocity, scale(k1.dVel, dt / 2));
  const k2 = stateDerivatives(pos2, vel2, mass, thrust, dragCoeff, crossSection);

  // k3
  const pos3 = add(position, scale(k2.dPos, dt / 2));
  const vel3 = add(velocity, scale(k2.dVel, dt / 2));
  const k3 = stateDerivatives(pos3, vel3, mass, thrust, dragCoeff, crossSection);

  // k4
  const pos4 = add(position, scale(k3.dPos, dt));
  const vel4 = add(velocity, scale(k3.dVel, dt));
  const k4 = stateDerivatives(pos4, vel4, mass, thrust, dragCoeff, crossSection);

  // Combine: y_{n+1} = y_n + (dt/6)(k1 + 2k2 + 2k3 + k4)
  const newPosition = add(
    position,
    scale(
      add(add(k1.dPos, scale(k2.dPos, 2)), add(scale(k3.dPos, 2), k4.dPos)),
      dt / 6
    )
  );

  const newVelocity = add(
    velocity,
    scale(
      add(add(k1.dVel, scale(k2.dVel, 2)), add(scale(k3.dVel, 2), k4.dVel)),
      dt / 6
    )
  );

  const newAltitude = magnitude(newPosition) - EARTH_RADIUS;

  return {
    position: newPosition,
    velocity: newVelocity,
    mass: state.mass,
    time: state.time + dt,
    altitude: newAltitude,
    fuel: state.fuel,
  };
}

/**
 * Create initial simulation state for launch from Earth's surface.
 * Rocket starts at the equator with Earth's rotation velocity.
 */
export function createLaunchState(totalMass: number, fuelMass: number): SimState {
  return {
    position: { x: EARTH_RADIUS, y: 0 },
    velocity: { x: 0, y: EARTH_RADIUS > 0 ? 465.1 : 0 }, // Earth rotation at equator
    mass: totalMass,
    time: 0,
    altitude: 0,
    fuel: fuelMass,
  };
}
