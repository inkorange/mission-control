import type { Mission, MissionTier } from "@/types/mission";
import type { FlightResult } from "@/types/physics";
import { getEnginesByTier } from "./engines";
import { getFuelTanksByTier, getStructuralPartsByTier } from "./parts";

function availablePartsForTier(tier: number): { engines: string[]; parts: string[] } {
  const engines = getEnginesByTier(tier).map((e) => e.id);
  const tanks = getFuelTanksByTier(tier).map((t) => t.id);
  const structural = getStructuralPartsByTier(tier).map((p) => p.id);
  return {
    engines,
    parts: [...tanks, ...structural],
  };
}

/**
 * Full mission catalog — 15 missions across 5 tiers.
 */
export const MISSIONS: Mission[] = [
  // =============================================
  // TIER 1: Foundations
  // =============================================
  {
    id: "1-1",
    tier: 1,
    name: "First Light",
    codename: "AURORA",
    description:
      "Your first mission: launch a sounding rocket past the Kármán line (100km altitude). No orbit required — just prove you can reach space. Keep it simple and under budget.",
    requirements: {
      targetOrbit: {
        periapsis: { min: -Infinity, max: Infinity },
        apoapsis: { min: 100_000, max: Infinity },
      },
      maxBudget: 15_000_000,
    },
    budget: 15_000_000,
    ...availablePartsForTier(1),
    availableEngines: availablePartsForTier(1).engines,
    availableParts: availablePartsForTier(1).parts,
    bonusChallenges: [
      {
        id: "1-1-bonus-1",
        description: "Reach 150km altitude",
        condition: (f: FlightResult) => f.maxAltitude >= 150_000,
        bonusStars: 1,
      },
    ],
    educationalTopics: ["what_is_space", "thrust_to_weight", "gravity"],
  },
  {
    id: "1-2",
    tier: 1,
    name: "Orbit!",
    codename: "HORIZON",
    description:
      "Achieve a stable low-Earth orbit at approximately 200km. Your rocket must reach orbital velocity — about 7,800 m/s. This is the real test: staging, gravity turns, and the Tsiolkovsky equation all matter now.",
    requirements: {
      targetOrbit: {
        periapsis: { min: 180_000, max: 250_000 },
        apoapsis: { min: 180_000, max: 300_000 },
      },
      maxBudget: 80_000_000,
    },
    budget: 80_000_000,
    ...availablePartsForTier(1),
    availableEngines: availablePartsForTier(1).engines,
    availableParts: availablePartsForTier(1).parts,
    bonusChallenges: [
      {
        id: "1-2-bonus-1",
        description: "Achieve a near-circular orbit (eccentricity < 0.01)",
        condition: (f: FlightResult) =>
          f.finalOrbit !== null && f.finalOrbit.eccentricity < 0.01,
        bonusStars: 1,
      },
    ],
    educationalTopics: ["tsiolkovsky", "orbital_velocity", "gravity_turn"],
  },
  {
    id: "1-3",
    tier: 1,
    name: "Payload Delivery",
    codename: "CARRIER",
    description:
      "Deploy a 500kg communications relay satellite into a stable LEO orbit between 300-500km. Heavier payload means a bigger rocket — time to think about staging.",
    requirements: {
      targetOrbit: {
        periapsis: { min: 280_000, max: 520_000 },
        apoapsis: { min: 280_000, max: 520_000 },
      },
      minPayloadMass: 500,
      maxBudget: 100_000_000,
    },
    budget: 100_000_000,
    ...availablePartsForTier(1),
    availableEngines: availablePartsForTier(1).engines,
    availableParts: availablePartsForTier(1).parts,
    bonusChallenges: [
      {
        id: "1-3-bonus-1",
        description: "Complete the mission under $60M",
        condition: () => false, // Checked via cost, not flight data
        bonusStars: 1,
      },
    ],
    educationalTopics: ["staging", "mass_ratio", "drag_losses"],
  },

  // =============================================
  // TIER 2: Working Orbits
  // =============================================
  {
    id: "2-1",
    tier: 2,
    name: "Higher Ground",
    codename: "APEX",
    description:
      "Place a weather satellite at 800km altitude. Higher orbits mean more delta-v. You'll need an efficient upper stage — consider hydrogen engines.",
    requirements: {
      targetOrbit: {
        periapsis: { min: 750_000, max: 850_000 },
        apoapsis: { min: 750_000, max: 900_000 },
      },
      minPayloadMass: 300,
      maxBudget: 120_000_000,
    },
    budget: 120_000_000,
    ...availablePartsForTier(2),
    availableEngines: availablePartsForTier(2).engines,
    availableParts: availablePartsForTier(2).parts,
    bonusChallenges: [
      {
        id: "2-1-bonus-1",
        description: "Achieve orbit with only 2 stages",
        condition: (f: FlightResult) => {
          const maxStage = Math.max(...f.history.map((s) => s.currentStage));
          return maxStage <= 1;
        },
        bonusStars: 1,
      },
    ],
    educationalTopics: ["specific_impulse", "upper_stages", "engine_types"],
  },
  {
    id: "2-2",
    tier: 2,
    name: "GTO Transfer",
    codename: "BRIDGE",
    description:
      "Reach a geostationary transfer orbit: low periapsis (~200km) and high apoapsis (~35,786km). This is a Hohmann transfer — your first taste of orbital maneuvering.",
    requirements: {
      targetOrbit: {
        periapsis: { min: 180_000, max: 300_000 },
        apoapsis: { min: 33_000_000, max: 38_000_000 },
      },
      maxBudget: 150_000_000,
    },
    budget: 150_000_000,
    ...availablePartsForTier(2),
    availableEngines: availablePartsForTier(2).engines,
    availableParts: availablePartsForTier(2).parts,
    bonusChallenges: [
      {
        id: "2-2-bonus-1",
        description: "Reach GTO with fuel to spare (>500kg remaining)",
        condition: (f: FlightResult) => {
          const lastSnapshot = f.history[f.history.length - 1];
          return lastSnapshot ? lastSnapshot.fuel > 500 : false;
        },
        bonusStars: 1,
      },
    ],
    educationalTopics: ["hohmann_transfer", "vis_viva", "elliptical_orbits"],
  },
  {
    id: "2-3",
    tier: 2,
    name: "ComSat Deploy",
    codename: "SENTINEL",
    description:
      "Place a communications satellite into geostationary orbit at 35,786km circular. You'll need to circularize at apoapsis — this requires a restartable upper stage engine.",
    requirements: {
      targetOrbit: {
        periapsis: { min: 34_000_000, max: 37_000_000 },
        apoapsis: { min: 34_000_000, max: 37_500_000 },
      },
      minPayloadMass: 200,
      maxBudget: 200_000_000,
    },
    budget: 200_000_000,
    ...availablePartsForTier(2),
    availableEngines: availablePartsForTier(2).engines,
    availableParts: availablePartsForTier(2).parts,
    bonusChallenges: [
      {
        id: "2-3-bonus-1",
        description: "Achieve near-circular GEO (eccentricity < 0.005)",
        condition: (f: FlightResult) =>
          f.finalOrbit !== null && f.finalOrbit.eccentricity < 0.005,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "circularization",
      "geostationary_orbit",
      "restartable_engines",
    ],
  },

  // =============================================
  // TIER 3: Deep Space
  // =============================================
  {
    id: "3-1",
    tier: 3,
    name: "Lunar Flyby",
    codename: "SELENE",
    description:
      "Send a probe on a trajectory that passes within 500km of the Moon. The lunar transfer requires approximately 3,100 m/s beyond LEO. Timing matters — aim for the Moon's sphere of influence.",
    requirements: {
      targetBody: "moon",
      targetOrbit: {
        periapsis: { min: -Infinity, max: Infinity },
        apoapsis: { min: 380_000_000, max: Infinity },
      },
      maxBudget: 250_000_000,
    },
    budget: 250_000_000,
    ...availablePartsForTier(3),
    availableEngines: availablePartsForTier(3).engines,
    availableParts: availablePartsForTier(3).parts,
    bonusChallenges: [
      {
        id: "3-1-bonus-1",
        description: "Complete lunar flyby under $150M",
        condition: () => false,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "patched_conics",
      "lunar_transfer",
      "sphere_of_influence",
    ],
  },
  {
    id: "3-2",
    tier: 3,
    name: "Lunar Orbit",
    codename: "ARTEMIS",
    description:
      "Achieve a stable orbit around the Moon at approximately 100km altitude. After the transfer, you'll need enough delta-v to slow down and capture into lunar orbit.",
    requirements: {
      targetBody: "moon",
      maxBudget: 350_000_000,
    },
    budget: 350_000_000,
    ...availablePartsForTier(3),
    availableEngines: availablePartsForTier(3).engines,
    availableParts: availablePartsForTier(3).parts,
    bonusChallenges: [
      {
        id: "3-2-bonus-1",
        description: "Achieve circular lunar orbit (eccentricity < 0.05)",
        condition: (f: FlightResult) =>
          f.finalOrbit !== null && f.finalOrbit.eccentricity < 0.05,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "orbital_insertion",
      "capture_burns",
      "three_body_simplified",
    ],
  },
  {
    id: "3-3",
    tier: 3,
    name: "Lunar Lander",
    codename: "EAGLE",
    description:
      "Deliver a 200kg payload to the lunar surface. After lunar orbit insertion, execute a deorbit burn and soft landing. Budget your delta-v carefully — there's no atmosphere to slow you down.",
    requirements: {
      targetBody: "moon",
      minPayloadMass: 200,
      maxBudget: 500_000_000,
    },
    budget: 500_000_000,
    ...availablePartsForTier(3),
    availableEngines: availablePartsForTier(3).engines,
    availableParts: availablePartsForTier(3).parts,
    bonusChallenges: [
      {
        id: "3-3-bonus-1",
        description: "Land with more than 100kg of fuel remaining",
        condition: (f: FlightResult) => {
          const last = f.history[f.history.length - 1];
          return last ? last.fuel > 100 : false;
        },
        bonusStars: 1,
      },
    ],
    educationalTopics: ["landing_burns", "suicide_burn", "lunar_gravity"],
  },

  // =============================================
  // TIER 4: Interplanetary
  // =============================================
  {
    id: "4-1",
    tier: 4,
    name: "Mars Window",
    codename: "ARES",
    description:
      "Execute a trans-Mars injection (TMI) burn from LEO. You need approximately 3,600 m/s beyond LEO to enter a Mars transfer orbit. Launch windows are everything in interplanetary travel.",
    requirements: {
      targetBody: "mars",
      maxBudget: 600_000_000,
    },
    budget: 600_000_000,
    ...availablePartsForTier(4),
    availableEngines: availablePartsForTier(4).engines,
    availableParts: availablePartsForTier(4).parts,
    bonusChallenges: [
      {
        id: "4-1-bonus-1",
        description: "Achieve TMI with less than 13,500 m/s total delta-v",
        condition: (f: FlightResult) => f.totalDeltaVUsed < 13_500,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "transfer_windows",
      "interplanetary_dv",
      "escape_velocity",
    ],
  },
  {
    id: "4-2",
    tier: 4,
    name: "Mars Orbit",
    codename: "PATHFINDER",
    description:
      "Enter a stable orbit around Mars. After the ~9-month transfer, you'll need about 1,000 m/s for Mars orbit insertion. Plan your fuel budget from Earth to Mars capture.",
    requirements: {
      targetBody: "mars",
      maxBudget: 800_000_000,
    },
    budget: 800_000_000,
    ...availablePartsForTier(4),
    availableEngines: availablePartsForTier(4).engines,
    availableParts: availablePartsForTier(4).parts,
    bonusChallenges: [
      {
        id: "4-2-bonus-1",
        description: "Use ion propulsion for the transfer",
        condition: () => false,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "mars_orbit_insertion",
      "aerobraking_concept",
      "interplanetary_navigation",
    ],
  },
  {
    id: "4-3",
    tier: 4,
    name: "Red Landing",
    codename: "PIONEER",
    description:
      "Deliver a 500kg rover to the Martian surface. Mars has a thin atmosphere — not enough for parachutes alone, but it helps. You'll need powered descent for the final approach.",
    requirements: {
      targetBody: "mars",
      minPayloadMass: 500,
      maxBudget: 1_200_000_000,
    },
    budget: 1_200_000_000,
    ...availablePartsForTier(4),
    availableEngines: availablePartsForTier(4).engines,
    availableParts: availablePartsForTier(4).parts,
    bonusChallenges: [
      {
        id: "4-3-bonus-1",
        description: "Complete landing under $800M budget",
        condition: () => false,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "mars_edl",
      "powered_descent",
      "mars_atmosphere",
    ],
  },

  // =============================================
  // TIER 5: Grand Tour
  // =============================================
  {
    id: "5-1",
    tier: 5,
    name: "Jupiter Flyby",
    codename: "VOYAGER",
    description:
      "Send a probe past Jupiter using gravity assists. Direct transfer requires ~9,000 m/s beyond LEO, but a Venus or Earth gravity assist can cut that dramatically. Think creatively.",
    requirements: {
      targetBody: "jupiter",
      maxBudget: 1_500_000_000,
    },
    budget: 1_500_000_000,
    ...availablePartsForTier(5),
    availableEngines: availablePartsForTier(5).engines,
    availableParts: availablePartsForTier(5).parts,
    bonusChallenges: [
      {
        id: "5-1-bonus-1",
        description: "Achieve Jupiter flyby under $1B",
        condition: () => false,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "gravity_assist",
      "flyby_mechanics",
      "oberth_effect",
    ],
  },
  {
    id: "5-2",
    tier: 5,
    name: "Saturn Rings",
    codename: "CASSINI",
    description:
      "Enter orbit around Saturn. This is the ultimate test of mission planning — multi-year trajectory, gravity assists, and precise orbit insertion at a distant world.",
    requirements: {
      targetBody: "saturn",
      maxBudget: 2_000_000_000,
    },
    budget: 2_000_000_000,
    ...availablePartsForTier(5),
    availableEngines: availablePartsForTier(5).engines,
    availableParts: availablePartsForTier(5).parts,
    bonusChallenges: [
      {
        id: "5-2-bonus-1",
        description: "Use fewer than 4 stages",
        condition: (f: FlightResult) => {
          const maxStage = Math.max(...f.history.map((s) => s.currentStage));
          return maxStage <= 2;
        },
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "multi_flyby",
      "saturn_system",
      "deep_space_navigation",
    ],
  },
  {
    id: "5-3",
    tier: 5,
    name: "Voyager",
    codename: "EXODUS",
    description:
      "Achieve solar escape velocity. Your probe must reach 16.6 km/s relative to the Sun to leave the solar system forever. This is the grand finale — everything you've learned comes together.",
    requirements: {
      maxBudget: 2_500_000_000,
    },
    budget: 2_500_000_000,
    ...availablePartsForTier(5),
    availableEngines: availablePartsForTier(5).engines,
    availableParts: availablePartsForTier(5).parts,
    bonusChallenges: [
      {
        id: "5-3-bonus-1",
        description: "Achieve escape velocity with a single gravity assist",
        condition: () => false,
        bonusStars: 1,
      },
    ],
    educationalTopics: [
      "solar_escape",
      "c3_energy",
      "voyager_golden_record",
    ],
  },
];

export function getMissionById(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export function getMissionsByTier(tier: MissionTier): Mission[] {
  return MISSIONS.filter((m) => m.tier === tier);
}

export function getStarsRequiredForTier(tier: MissionTier): number {
  switch (tier) {
    case 1: return 0;  // Always unlocked
    case 2: return 5;
    case 3: return 5;
    case 4: return 5;
    case 5: return 7;
  }
}
