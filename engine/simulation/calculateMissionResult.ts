import type { FlightResult } from "@/types/physics";
import type { Mission, MissionResult } from "@/types/mission";
import type { RocketConfig } from "@/types/rocket";
import { scoreFlightResult } from "./Scoring";

/**
 * Calculate a complete MissionResult from flight data.
 * Combines scoring + bonus challenge evaluation.
 */
export function calculateMissionResult(
  flight: FlightResult,
  mission: Mission,
  rocketConfig: RocketConfig
): MissionResult {
  const isSuccess =
    flight.outcome === "mission_complete" || flight.outcome === "orbit_achieved";

  // Score the flight
  const score = scoreFlightResult(flight, mission, rocketConfig.totalCost);

  // Failed missions get 0 stars
  const stars = isSuccess ? score.stars : 0;

  // Evaluate bonus challenges
  const bonusCompleted: string[] = [];
  if (isSuccess) {
    for (const bonus of mission.bonusChallenges) {
      // Try the condition function first
      let awarded = false;
      try {
        awarded = bonus.condition(flight);
      } catch {
        awarded = false;
      }

      // For cost-based bonuses (condition returns false, description mentions "$"),
      // parse the dollar threshold from the description
      if (!awarded && isCostBasedBonus(bonus.description)) {
        const threshold = parseCostThreshold(bonus.description);
        if (threshold !== null) {
          awarded = rocketConfig.totalCost < threshold;
        }
      }

      if (awarded) {
        bonusCompleted.push(bonus.id);
      }
    }
  }

  return {
    missionId: mission.id,
    stars,
    bestScore: score.totalScore,
    bestRocketConfig: rocketConfig,
    bonusCompleted,
    completedAt: Date.now(),
    flightResult: flight,
  };
}

/** Check if a bonus description refers to a cost/budget threshold. */
function isCostBasedBonus(description: string): boolean {
  return /under\s+\$[\d,]+[MBK]?/i.test(description) ||
    /less than\s+\$[\d,]+[MBK]?/i.test(description);
}

/** Parse a dollar amount from a bonus description like "Complete under $60M". */
function parseCostThreshold(description: string): number | null {
  const match = description.match(/\$([\d,]+)\s*([MBK]?)/i);
  if (!match) return null;

  const value = parseFloat(match[1].replace(/,/g, ""));
  const suffix = match[2].toUpperCase();

  switch (suffix) {
    case "B": return value * 1_000_000_000;
    case "M": return value * 1_000_000;
    case "K": return value * 1_000;
    default: return value;
  }
}
