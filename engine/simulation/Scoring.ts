import type { FlightResult } from "@/types/physics";
import type { Mission } from "@/types/mission";
import type { ScoreBreakdown, StarRating } from "@/types/scoring";
import { hohmannDeltaV } from "../physics/orbit";
import { EARTH_RADIUS } from "../physics/constants";
import { clamp } from "@/lib/math";

/**
 * Calculate the optimal delta-v for a mission.
 * For orbit missions, uses Hohmann transfer as baseline.
 */
function optimalDeltaV(mission: Mission): number {
  if (!mission.requirements.targetOrbit) return 0;

  const target = mission.requirements.targetOrbit;

  // Approximate: delta-v from surface to target orbit
  // LEO insertion ≈ 9,400 m/s (including gravity + drag losses)
  const leoInsertionDv = 9400;

  // Suborbital missions (periapsis is -Infinity) — just need to reach altitude
  // Approximate dv for a vertical sounding rocket to reach target apoapsis
  const isSuborbital = !isFinite(target.periapsis.min) || !isFinite(target.periapsis.max);
  if (isSuborbital) {
    // For a suborbital hop, approximate dv ≈ sqrt(2 * g * h) + drag losses (~15%)
    const targetApo = isFinite(target.apoapsis.min) ? target.apoapsis.min : 100_000;
    const dv = Math.sqrt(2 * 9.80665 * targetApo) * 1.15;
    return dv;
  }

  // Mid-point of target orbit (safe now — no Infinity values)
  const targetPeri = (target.periapsis.min + target.periapsis.max) / 2;
  const targetApo = (target.apoapsis.min + target.apoapsis.max) / 2;
  const targetR = EARTH_RADIUS + (targetPeri + targetApo) / 2;

  // If target is LEO, just return insertion cost
  if (targetR < EARTH_RADIUS + 2000e3) {
    return leoInsertionDv;
  }

  // LEO parking orbit at 200km
  const leoR = EARTH_RADIUS + 200e3;
  const transfer = hohmannDeltaV(leoR, targetR);

  return leoInsertionDv + transfer.total;
}

/**
 * Score a completed flight against mission requirements.
 */
export function scoreFlightResult(
  flight: FlightResult,
  mission: Mission,
  rocketCost: number
): ScoreBreakdown {
  // Efficiency: How close to optimal delta-v
  const optDv = optimalDeltaV(mission);
  const efficiencyRatio = optDv > 0 ? optDv / Math.max(optDv, flight.totalDeltaVUsed) : 1;
  const efficiencyScore = Math.round(clamp(efficiencyRatio * 100, 0, 100));
  const fuelWasted = Math.max(0, flight.totalDeltaVUsed - optDv);

  // Budget: How much under budget
  const budgetRatio = 1 - rocketCost / mission.budget;
  const budgetScore = Math.round(clamp(budgetRatio * 100 + 50, 0, 100)); // 50% of budget = 100 score
  const percentUnderBudget = Math.max(0, budgetRatio * 100);

  // Accuracy: How close to target orbit
  let accuracyScore = 0;
  if (mission.requirements.targetOrbit && flight.finalOrbit) {
    const target = mission.requirements.targetOrbit;
    const isSuborbital = !isFinite(target.periapsis.min) || !isFinite(target.periapsis.max);

    if (isSuborbital) {
      // For suborbital missions, score based on how well apoapsis was reached
      const targetApo = isFinite(target.apoapsis.min) ? target.apoapsis.min : 100_000;
      const apoRatio = Math.min(1, flight.maxAltitude / targetApo);
      accuracyScore = Math.round(apoRatio * 100);
    } else {
      const targetPeriMid = (target.periapsis.min + target.periapsis.max) / 2;
      const targetApoMid = (target.apoapsis.min + target.apoapsis.max) / 2;

      const periError = Math.abs(flight.finalOrbit.periapsis - targetPeriMid);
      const apoError = Math.abs(flight.finalOrbit.apoapsis - targetApoMid);
      const avgError = (periError + apoError) / 2;

      // Tolerance: within 10km = 100%, scaled down from there
      const tolerance = 10_000; // 10km
      const errorRatio = 1 - Math.min(1, avgError / (tolerance * 10));
      accuracyScore = Math.round(clamp(errorRatio * 100, 0, 100));
    }
  } else if (flight.outcome === "orbit_achieved" || flight.outcome === "mission_complete") {
    accuracyScore = 75; // Partial credit for achieving any orbit
  }

  // Failed missions get heavy penalties
  if (flight.outcome === "crash" || flight.outcome === "suborbital" || flight.outcome === "fuel_exhausted") {
    accuracyScore = Math.min(accuracyScore, 10);
  }

  const totalScore = Math.round((efficiencyScore + budgetScore + accuracyScore) / 3);

  let stars: StarRating = 0;
  if (totalScore >= 80) stars = 3;
  else if (totalScore >= 60) stars = 2;
  else if (totalScore >= 40) stars = 1;

  return {
    efficiency: {
      score: efficiencyScore,
      deltaVUsed: flight.totalDeltaVUsed,
      deltaVOptimal: optDv,
      fuelWasted,
    },
    budget: {
      score: budgetScore,
      costSpent: rocketCost,
      budgetMax: mission.budget,
      percentUnderBudget,
    },
    accuracy: {
      score: accuracyScore,
      orbitalDeviation: flight.finalOrbit && mission.requirements.targetOrbit
        ? isFinite(mission.requirements.targetOrbit.periapsis.min)
          ? Math.abs(flight.finalOrbit.periapsis - mission.requirements.targetOrbit.periapsis.min)
          : Math.abs(flight.maxAltitude - (mission.requirements.targetOrbit.apoapsis.min ?? 0))
        : Infinity,
      inclinationError: 0, // 2D sim — always 0
    },
    totalScore,
    stars,
  };
}
