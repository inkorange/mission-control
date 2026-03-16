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

// Sun
export const SUN_MASS = 1.989e30; // kg
export const SUN_MU = G * SUN_MASS;
export const SUN_DISTANCE = 1.496e11; // 1 AU in meters

// Moon
export const MOON_MASS = 7.342e22; // kg
export const MOON_RADIUS = 1.737e6; // meters
export const MOON_MU = G * MOON_MASS;
export const MOON_ORBITAL_PERIOD = 27.322 * 86400; // sidereal period in seconds
export const MOON_SOI = 66_100e3; // meters — sphere of influence

// Mars
export const MARS_MASS = 6.417e23; // kg
export const MARS_RADIUS = 3.3895e6; // meters
export const MARS_MU = G * MARS_MASS;
export const MARS_ORBITAL_PERIOD = 687.0 * 86400; // seconds
export const MARS_SOI = 577_000e3; // meters

// Jupiter
export const JUPITER_MASS = 1.898e27; // kg
export const JUPITER_RADIUS = 69.911e6; // meters
export const JUPITER_MU = G * JUPITER_MASS;
export const JUPITER_DISTANCE = 778.5e9; // meters from Sun
export const JUPITER_ORBITAL_PERIOD = 4332.59 * 86400; // seconds
export const JUPITER_SOI = 48.2e9; // meters

// Saturn
export const SATURN_MASS = 5.683e26; // kg
export const SATURN_RADIUS = 58.232e6; // meters
export const SATURN_MU = G * SATURN_MASS;
export const SATURN_DISTANCE = 1.434e12; // meters from Sun
export const SATURN_ORBITAL_PERIOD = 10759.22 * 86400; // seconds
export const SATURN_SOI = 54.5e9; // meters

// Simulation defaults
export const FIXED_DT = 0.01; // seconds — physics timestep
export const DEFAULT_DRAG_COEFFICIENT = 0.05; // Game-balanced drag (lower than real for playability)
export const DEFAULT_CROSS_SECTION = 3; // m² — streamlined rocket
