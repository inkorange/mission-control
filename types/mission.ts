import type { OrbitalElements, FlightResult } from "./physics";
import type { RocketConfig } from "./rocket";

export interface OrbitalTarget {
  periapsis: { min: number; max: number }; // meters above surface
  apoapsis: { min: number; max: number }; // meters above surface
  inclination?: { min: number; max: number }; // radians
}

export interface MissionRequirements {
  targetOrbit?: OrbitalTarget;
  targetBody?: "moon" | "mars" | "jupiter" | "saturn";
  minPayloadMass?: number; // kg
  maxBudget: number; // dollars
  timeLimitSeconds?: number;
}

export interface BonusChallenge {
  id: string;
  description: string;
  condition: (flight: FlightResult) => boolean;
  bonusStars: number;
}

export type MissionTier = 1 | 2 | 3 | 4 | 5;

export interface Mission {
  id: string;
  tier: MissionTier;
  name: string;
  codename: string;
  description: string;
  requirements: MissionRequirements;
  budget: number;
  availableEngines: string[];
  availableParts: string[];
  bonusChallenges: BonusChallenge[];
  educationalTopics: string[];
}

export interface MissionResult {
  missionId: string;
  stars: number; // 0-3
  bestScore: number;
  bestRocketConfig: RocketConfig;
  bonusCompleted: string[];
  completedAt: number; // timestamp
  flightResult: FlightResult;
}
