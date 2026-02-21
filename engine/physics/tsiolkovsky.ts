import { G0 } from "./constants";
import type { StageSpec } from "@/types/rocket";

/**
 * Tsiolkovsky rocket equation: Δv = Isp × g₀ × ln(m_wet / m_dry)
 *
 * @param isp - Specific impulse in seconds
 * @param wetMass - Initial mass including fuel (kg)
 * @param dryMass - Final mass after fuel is burned (kg)
 * @returns Delta-v in m/s
 */
export function deltaV(
  isp: number,
  wetMass: number,
  dryMass: number
): number {
  if (dryMass <= 0 || wetMass <= dryMass) return 0;
  return isp * G0 * Math.log(wetMass / dryMass);
}

/**
 * Calculate total delta-v for a multi-stage rocket.
 * Stages are ordered bottom-up (index 0 = first stage to fire).
 * Each stage carries everything above it as payload.
 */
export function totalDeltaV(stages: StageSpec[]): number {
  let totalDv = 0;

  for (let i = 0; i < stages.length; i++) {
    // Payload is everything above this stage (upper stages + payload)
    const payloadAbove = stages
      .slice(i + 1)
      .reduce((sum, s) => sum + s.wetMass, 0);

    const wetMass = stages[i].wetMass + payloadAbove;
    const dryMass = stages[i].dryMass + payloadAbove;
    totalDv += deltaV(stages[i].isp, wetMass, dryMass);
  }

  return totalDv;
}

/**
 * Thrust-to-weight ratio.
 * Must be > 1.0 to leave the launch pad.
 */
export function thrustToWeightRatio(
  thrustN: number,
  massKg: number,
  gLocal: number = G0
): number {
  if (massKg <= 0) return 0;
  return thrustN / (massKg * gLocal);
}

/**
 * Mass flow rate: how fast fuel is consumed.
 * ṁ = F / (Isp × g₀)
 */
export function massFlowRate(thrustN: number, isp: number): number {
  if (isp <= 0) return 0;
  return thrustN / (isp * G0);
}

/**
 * Burn time for a stage given its fuel mass and mass flow rate.
 */
export function burnTime(fuelMass: number, flowRate: number): number {
  if (flowRate <= 0) return 0;
  return fuelMass / flowRate;
}
