export interface Vector2D {
  x: number;
  y: number;
}

export interface OrbitalElements {
  semiMajorAxis: number; // a (meters)
  eccentricity: number; // e (0 = circular, <1 = elliptical)
  inclination: number; // i (radians)
  apoapsis: number; // Highest point above surface (meters)
  periapsis: number; // Lowest point above surface (meters)
  period: number; // Orbital period (seconds)
}

export interface SimState {
  position: Vector2D; // meters from Earth center
  velocity: Vector2D; // m/s
  mass: number; // kg (decreasing as fuel burns)
  time: number; // seconds since launch
  altitude: number; // meters above surface
  fuel: number; // kg remaining in current stage
}

export interface FlightSnapshot {
  time: number;
  altitude: number;
  velocity: number;
  downrangeDistance: number;
  mass: number;
  fuel: number;
  currentStage: number;
  throttle: number;
  pitchAngle: number; // degrees from vertical
  orbitalElements: OrbitalElements | null;
  position: Vector2D;
}

export type FlightOutcome =
  | "orbit_achieved"
  | "mission_complete"
  | "crash"
  | "suborbital"
  | "aborted"
  | "fuel_exhausted";

export interface FlightResult {
  outcome: FlightOutcome;
  history: FlightSnapshot[];
  finalOrbit: OrbitalElements | null;
  totalDeltaVUsed: number;
  maxAltitude: number;
  flightDuration: number;
}

export interface HohmannTransfer {
  burn1: number;
  burn2: number;
  total: number;
}
