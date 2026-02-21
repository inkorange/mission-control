// Fundamental constants
export const G = 6.674e-11; // Gravitational constant (m³/kg/s²)
export const G0 = 9.80665; // Standard gravity (m/s²)

// Earth
export const EARTH_MASS = 5.972e24; // kg
export const EARTH_RADIUS = 6.371e6; // meters
export const EARTH_MU = G * EARTH_MASS; // Standard gravitational parameter (m³/s²)
export const EARTH_ROTATION_SPEED = 465.1; // Surface rotation speed at equator (m/s)

// Atmosphere
export const SEA_LEVEL_PRESSURE = 101325; // Pa
export const SEA_LEVEL_DENSITY = 1.225; // kg/m³
export const SCALE_HEIGHT = 8500; // meters (for exponential atmosphere model)
export const KARMAN_LINE = 100_000; // meters — edge of space

// Orbital altitudes (meters above surface)
export const LEO_MIN = 160e3;
export const LEO_MAX = 2000e3;
export const GEO_ALTITUDE = 35_786e3;
export const MOON_DISTANCE = 384_400e3;
export const MARS_DISTANCE = 225e9; // Average (varies 55M-400M km)

// Moon
export const MOON_MASS = 7.342e22; // kg
export const MOON_RADIUS = 1.737e6; // meters
export const MOON_MU = G * MOON_MASS;

// Mars
export const MARS_MASS = 6.417e23; // kg
export const MARS_RADIUS = 3.3895e6; // meters
export const MARS_MU = G * MARS_MASS;

// Simulation defaults
export const FIXED_DT = 0.01; // seconds — physics timestep
export const DEFAULT_DRAG_COEFFICIENT = 0.2; // Typical for rockets
export const DEFAULT_CROSS_SECTION = 10; // m² — rough approximation
