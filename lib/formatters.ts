/**
 * Format a number in meters to a human-readable distance string.
 */
export function formatDistance(meters: number): string {
  if (Math.abs(meters) >= 1e9) {
    return `${(meters / 1e9).toFixed(1)} Gm`;
  }
  if (Math.abs(meters) >= 1e6) {
    return `${(meters / 1e6).toFixed(1)} Mm`;
  }
  if (Math.abs(meters) >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters.toFixed(0)} m`;
}

/**
 * Format velocity in m/s.
 */
export function formatVelocity(metersPerSecond: number): string {
  if (Math.abs(metersPerSecond) >= 1000) {
    return `${(metersPerSecond / 1000).toFixed(2)} km/s`;
  }
  return `${metersPerSecond.toFixed(1)} m/s`;
}

/**
 * Format a dollar amount.
 */
export function formatCost(dollars: number): string {
  if (dollars >= 1e9) {
    return `$${(dollars / 1e9).toFixed(1)}B`;
  }
  if (dollars >= 1e6) {
    return `$${(dollars / 1e6).toFixed(0)}M`;
  }
  if (dollars >= 1e3) {
    return `$${(dollars / 1e3).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}

/**
 * Format mass in kg.
 */
export function formatMass(kg: number): string {
  if (kg >= 1e6) {
    return `${(kg / 1e6).toFixed(1)} Mt`;
  }
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} t`;
  }
  return `${kg.toFixed(0)} kg`;
}

/**
 * Format time in seconds to T+ HH:MM:SS.
 */
export function formatMissionTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `T+ ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Format delta-v with appropriate units.
 */
export function formatDeltaV(metersPerSecond: number): string {
  return `${metersPerSecond.toFixed(0)} m/s`;
}
