import type { EngineDef } from "@/types/rocket";

/**
 * Engine catalog — inspired by real hardware, game-balanced.
 * Stats are approximate and tuned for gameplay, not exact replicas.
 */
export const ENGINES: EngineDef[] = [
  // === TIER 1: Foundations ===
  {
    id: "spartan-1",
    name: "Spartan-1",
    type: "solid",
    thrustSeaLevel: 1_200_000,
    thrustVacuum: 1_350_000,
    ispSeaLevel: 220,
    ispVacuum: 242,
    mass: 4_000,
    cost: 2_000_000,
    throttleable: false,
    minThrottle: 1,
    restartable: false,
    description:
      "Reliable solid rocket booster. Simple and cheap, but once lit, it burns until empty. No throttle control.",
    tier: 1,
  },
  {
    id: "kestrel-7",
    name: "Kestrel-7",
    type: "liquid_kerolox",
    thrustSeaLevel: 845_000,
    thrustVacuum: 934_000,
    ispSeaLevel: 282,
    ispVacuum: 311,
    mass: 3_400,
    cost: 8_000_000,
    throttleable: true,
    minThrottle: 0.4,
    restartable: false,
    description:
      "Workhorse kerosene/LOX engine. Good thrust-to-weight and throttleable down to 40%. A solid first-stage choice.",
    tier: 1,
  },
  {
    id: "spartan-s",
    name: "Spartan-S",
    type: "solid",
    thrustSeaLevel: 400_000,
    thrustVacuum: 460_000,
    ispSeaLevel: 230,
    ispVacuum: 250,
    mass: 1_200,
    cost: 800_000,
    throttleable: false,
    minThrottle: 1,
    restartable: false,
    description:
      "Small solid motor for kick stages and orbital insertion. Lightweight and dirt cheap.",
    tier: 1,
  },

  // === TIER 2: Working Orbits ===
  {
    id: "titan-rl",
    name: "Titan RL",
    type: "liquid_hydrolox",
    thrustSeaLevel: 70_000,
    thrustVacuum: 110_000,
    ispSeaLevel: 360,
    ispVacuum: 462,
    mass: 300,
    cost: 15_000_000,
    throttleable: true,
    minThrottle: 0.1,
    restartable: true,
    description:
      "High-efficiency hydrogen/LOX upper stage engine. Restartable for orbital maneuvers. Low thrust but exceptional Isp.",
    tier: 2,
  },
  {
    id: "kestrel-9",
    name: "Kestrel-9",
    type: "liquid_kerolox",
    thrustSeaLevel: 1_200_000,
    thrustVacuum: 1_340_000,
    ispSeaLevel: 289,
    ispVacuum: 316,
    mass: 4_800,
    cost: 12_000_000,
    throttleable: true,
    minThrottle: 0.35,
    restartable: false,
    description:
      "Upgraded Kestrel with more thrust and better efficiency. Backbone of heavy-lift first stages.",
    tier: 2,
  },

  // === TIER 3: Deep Space ===
  {
    id: "raptor-x",
    name: "Raptor-X",
    type: "liquid_methalox",
    thrustSeaLevel: 2_200_000,
    thrustVacuum: 2_500_000,
    ispSeaLevel: 330,
    ispVacuum: 363,
    mass: 1_600,
    cost: 12_000_000,
    throttleable: true,
    minThrottle: 0.2,
    restartable: true,
    description:
      "Full-flow staged combustion methane engine. Excellent thrust-to-weight, restartable, and deeply throttleable.",
    tier: 3,
  },
  {
    id: "titan-rl2",
    name: "Titan RL-2",
    type: "liquid_hydrolox",
    thrustSeaLevel: 0,
    thrustVacuum: 180_000,
    ispSeaLevel: 0,
    ispVacuum: 467,
    mass: 500,
    cost: 20_000_000,
    throttleable: true,
    minThrottle: 0.1,
    restartable: true,
    description:
      "Vacuum-only hydrogen engine with the highest Isp in its class. Multiple restart capability for complex maneuvers.",
    tier: 3,
  },

  // === TIER 4: Interplanetary ===
  {
    id: "halcyon-drive",
    name: "Halcyon Drive",
    type: "ion",
    thrustSeaLevel: 0,
    thrustVacuum: 500,
    ispSeaLevel: 0,
    ispVacuum: 3_000,
    mass: 50,
    cost: 25_000_000,
    throttleable: true,
    minThrottle: 0.01,
    restartable: true,
    description:
      "Ion propulsion system. Vanishingly small thrust but incredible specific impulse. For patient orbital maneuvering.",
    tier: 4,
  },
  {
    id: "raptor-x2",
    name: "Raptor-X2",
    type: "liquid_methalox",
    thrustSeaLevel: 2_800_000,
    thrustVacuum: 3_200_000,
    ispSeaLevel: 340,
    ispVacuum: 370,
    mass: 2_000,
    cost: 18_000_000,
    throttleable: true,
    minThrottle: 0.15,
    restartable: true,
    description:
      "Advanced methane engine pushing the limits of combustion efficiency. The deep space workhorse.",
    tier: 4,
  },

  // === TIER 5: Grand Tour ===
  {
    id: "nova-cluster",
    name: "Nova Cluster",
    type: "liquid_kerolox",
    thrustSeaLevel: 7_500_000,
    thrustVacuum: 8_400_000,
    ispSeaLevel: 275,
    ispVacuum: 304,
    mass: 8_200,
    cost: 30_000_000,
    throttleable: true,
    minThrottle: 0.5,
    restartable: false,
    description:
      "Massive clustered engine producing unmatched thrust. When you absolutely need to leave the planet in a hurry.",
    tier: 5,
  },
  {
    id: "prometheus",
    name: "Prometheus",
    type: "liquid_hydrolox",
    thrustSeaLevel: 0,
    thrustVacuum: 400_000,
    ispSeaLevel: 0,
    ispVacuum: 475,
    mass: 800,
    cost: 35_000_000,
    throttleable: true,
    minThrottle: 0.05,
    restartable: true,
    description:
      "The pinnacle of chemical propulsion. Nuclear-thermal-like efficiency with chemical simplicity.",
    tier: 5,
  },
];

export function getEngineById(id: string): EngineDef | undefined {
  return ENGINES.find((e) => e.id === id);
}

export function getEnginesByTier(maxTier: number): EngineDef[] {
  return ENGINES.filter((e) => e.tier <= maxTier);
}
