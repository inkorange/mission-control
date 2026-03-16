import type { FlightResult } from "@/types/physics";
import type { Mission } from "@/types/mission";
import type { ScoreBreakdown, StarRating } from "@/types/scoring";
import { hohmannDeltaV } from "../physics/orbit";
import { EARTH_RADIUS } from "../physics/constants";
import { clamp } from "@/lib/math";

/**
 * Calculate the optimal delta-v for a mission.
 * For orbit missions, uses Hohmann transfer as baseline.
 * For target body missions, uses approximate transfer costs.
 */
function optimalDeltaV(mission: Mission): number {
  const leoInsertionDv = 9400; // LEO insertion ≈ 9,400 m/s (including gravity + drag losses)

  // Target body missions — approximate delta-v budgets
  if (mission.requirements.targetBody) {
    switch (mission.requirements.targetBody) {
      case "moon":
        return leoInsertionDv + 3100; // TLI ~3,100 m/s beyond LEO
      case "mars":
        return leoInsertionDv + 3600; // TMI ~3,600 m/s beyond LEO
      case "jupiter":
        return leoInsertionDv + 6300; // ~6,300 m/s beyond LEO (with gravity assist can be less)
      case "saturn":
        return leoInsertionDv + 7300; // ~7,300 m/s beyond LEO
    }
  }

  if (!mission.requirements.targetOrbit) return 0;

  const target = mission.requirements.targetOrbit;

  // Suborbital missions (periapsis is -Infinity) — just need to reach altitude
  const isSuborbital = !isFinite(target.periapsis.min) || !isFinite(target.periapsis.max);
  if (isSuborbital) {
    const targetApo = isFinite(target.apoapsis.min) ? target.apoapsis.min : 100_000;
    const dv = Math.sqrt(2 * 9.80665 * targetApo) * 1.15;
    return dv;
  }

  // Mid-point of target orbit
  const targetPeri = (target.periapsis.min + target.periapsis.max) / 2;
  const targetApo = (target.apoapsis.min + target.apoapsis.max) / 2;
  const targetR = EARTH_RADIUS + (targetPeri + targetApo) / 2;

  if (targetR < EARTH_RADIUS + 2000e3) {
    return leoInsertionDv;
  }

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
  const budgetScore = Math.round(clamp(budgetRatio * 100 + 50, 0, 100));
  const percentUnderBudget = Math.max(0, budgetRatio * 100);

  // Accuracy: depends on mission type
  let accuracyScore = 0;

  if (mission.requirements.targetBody && flight.closestApproach) {
    // Target body missions: score based on closest approach
    const targetId = mission.requirements.targetBody;
    const closestDist = flight.closestApproach[targetId];

    if (closestDist !== undefined) {
      // Flyby scoring: closer approach = better
      const isFlyby = flight.outcome === "target_reached";
      const isOrbit = flight.outcome === "mission_complete" && flight.finalOrbit?.referenceBody === targetId;

      if (isOrbit) {
        // Orbit around target body — full marks
        accuracyScore = 95;
      } else if (isFlyby) {
        // Flyby: score based on how close. Perfect = within 500km of body surface
        const bodyRadii: Record<string, number> = {
          moon: 1.737e6,
          mars: 3.3895e6,
          jupiter: 69.911e6,
          saturn: 58.232e6,
        };
        const bodyR = bodyRadii[targetId] ?? 1e6;
        const surfaceDist = Math.max(0, closestDist - bodyR);
        const perfectDist = 500_000; // 500km
        const maxDist = 50_000_000; // 50,000km — still counts but low score
        if (surfaceDist <= perfectDist) {
          accuracyScore = 100;
        } else {
          const ratio = 1 - Math.min(1, (surfaceDist - perfectDist) / (maxDist - perfectDist));
          accuracyScore = Math.round(40 + ratio * 60);
        }
      } else if (flight.outcome === "mission_complete") {
        accuracyScore = 90; // Landing or other mission_complete
      }
    }
  } else if (mission.requirements.targetOrbit && flight.finalOrbit) {
    const target = mission.requirements.targetOrbit;
    const isSuborbital = !isFinite(target.periapsis.min) || !isFinite(target.periapsis.max);

    if (isSuborbital) {
      const targetApo = isFinite(target.apoapsis.min) ? target.apoapsis.min : 100_000;
      const apoRatio = Math.min(1, flight.maxAltitude / targetApo);
      accuracyScore = Math.round(apoRatio * 100);
    } else {
      const targetPeriMid = (target.periapsis.min + target.periapsis.max) / 2;
      const targetApoMid = (target.apoapsis.min + target.apoapsis.max) / 2;

      const periError = Math.abs(flight.finalOrbit.periapsis - targetPeriMid);
      const apoError = Math.abs(flight.finalOrbit.apoapsis - targetApoMid);
      const avgError = (periError + apoError) / 2;

      const tolerance = 10_000;
      const errorRatio = 1 - Math.min(1, avgError / (tolerance * 10));
      accuracyScore = Math.round(clamp(errorRatio * 100, 0, 100));
    }
  } else if (
    flight.outcome === "orbit_achieved" ||
    flight.outcome === "mission_complete" ||
    flight.outcome === "target_reached" ||
    flight.outcome === "escaped"
  ) {
    accuracyScore = 75;
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
      inclinationError: 0,
    },
    totalScore,
    stars,
  };
}
