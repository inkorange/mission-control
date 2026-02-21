import type { FuelTankDef, StructuralPartDef } from "@/types/rocket";

/**
 * Fuel tank catalog.
 * Mass ratio (fuel capacity / dry mass) is key — better tanks have higher ratios.
 */
export const FUEL_TANKS: FuelTankDef[] = [
  // === Solid Propellant ===
  {
    id: "solid-small",
    name: "SRB Casing S",
    fuelType: "solid_propellant",
    fuelCapacity: 15_000,
    dryMass: 2_000,
    cost: 500_000,
    description: "Small solid propellant casing. Simple and reliable.",
    tier: 1,
  },
  {
    id: "solid-medium",
    name: "SRB Casing M",
    fuelType: "solid_propellant",
    fuelCapacity: 50_000,
    dryMass: 5_500,
    cost: 1_500_000,
    description: "Medium solid propellant casing for serious thrust.",
    tier: 1,
  },
  {
    id: "solid-large",
    name: "SRB Casing L",
    fuelType: "solid_propellant",
    fuelCapacity: 120_000,
    dryMass: 12_000,
    cost: 3_000_000,
    description: "Large solid rocket booster segment.",
    tier: 2,
  },

  // === Kerosene/LOX ===
  {
    id: "kerolox-small",
    name: "K-Tank S",
    fuelType: "kerosene_lox",
    fuelCapacity: 30_000,
    dryMass: 2_500,
    cost: 2_000_000,
    description: "Compact kerosene/LOX tank. Good mass fraction for upper stages.",
    tier: 1,
  },
  {
    id: "kerolox-medium",
    name: "K-Tank M",
    fuelType: "kerosene_lox",
    fuelCapacity: 150_000,
    dryMass: 10_000,
    cost: 6_000_000,
    description: "Standard kerosene/LOX tank for first and second stages.",
    tier: 1,
  },
  {
    id: "kerolox-large",
    name: "K-Tank L",
    fuelType: "kerosene_lox",
    fuelCapacity: 400_000,
    dryMass: 22_000,
    cost: 12_000_000,
    description: "Heavy-lift kerosene/LOX tank. The big one.",
    tier: 2,
  },

  // === Hydrogen/LOX ===
  {
    id: "hydrolox-small",
    name: "H-Tank S",
    fuelType: "hydrogen_lox",
    fuelCapacity: 20_000,
    dryMass: 3_000,
    cost: 5_000_000,
    description: "Compact hydrogen/LOX tank. Hydrogen is bulky, so these are larger than they look.",
    tier: 2,
  },
  {
    id: "hydrolox-medium",
    name: "H-Tank M",
    fuelType: "hydrogen_lox",
    fuelCapacity: 80_000,
    dryMass: 8_000,
    cost: 10_000_000,
    description: "Standard hydrogen/LOX tank for upper stages.",
    tier: 2,
  },
  {
    id: "hydrolox-large",
    name: "H-Tank L",
    fuelType: "hydrogen_lox",
    fuelCapacity: 200_000,
    dryMass: 16_000,
    cost: 18_000_000,
    description: "Large hydrogen/LOX tank for heavy interplanetary stages.",
    tier: 3,
  },

  // === Methane/LOX ===
  {
    id: "methalox-small",
    name: "M-Tank S",
    fuelType: "methane_lox",
    fuelCapacity: 40_000,
    dryMass: 2_800,
    cost: 4_000_000,
    description: "Compact methane/LOX tank with excellent mass fraction.",
    tier: 3,
  },
  {
    id: "methalox-medium",
    name: "M-Tank M",
    fuelType: "methane_lox",
    fuelCapacity: 200_000,
    dryMass: 12_000,
    cost: 8_000_000,
    description: "Standard methane/LOX tank for methalox stages.",
    tier: 3,
  },
  {
    id: "methalox-large",
    name: "M-Tank L",
    fuelType: "methane_lox",
    fuelCapacity: 500_000,
    dryMass: 25_000,
    cost: 15_000_000,
    description: "Massive methane/LOX tank for heavy-lift missions.",
    tier: 4,
  },

  // === Xenon (Ion) ===
  {
    id: "xenon-small",
    name: "Xenon Pod",
    fuelType: "xenon",
    fuelCapacity: 500,
    dryMass: 100,
    cost: 8_000_000,
    description: "Pressurized xenon storage for ion propulsion. Small but effective.",
    tier: 4,
  },
  {
    id: "xenon-large",
    name: "Xenon Reservoir",
    fuelType: "xenon",
    fuelCapacity: 2_000,
    dryMass: 300,
    cost: 15_000_000,
    description: "Large xenon reservoir for extended ion engine operation.",
    tier: 5,
  },
];

/**
 * Structural parts catalog.
 */
export const STRUCTURAL_PARTS: StructuralPartDef[] = [
  {
    id: "fairing-small",
    name: "Fairing S",
    category: "fairing",
    mass: 800,
    cost: 1_000_000,
    dragCoefficient: 0.15,
    description: "Aerodynamic payload fairing for small satellites.",
    tier: 1,
  },
  {
    id: "fairing-medium",
    name: "Fairing M",
    category: "fairing",
    mass: 1_800,
    cost: 2_500_000,
    dragCoefficient: 0.12,
    description: "Standard payload fairing. Good aerodynamics.",
    tier: 1,
  },
  {
    id: "fairing-large",
    name: "Fairing L",
    category: "fairing",
    mass: 3_200,
    cost: 5_000_000,
    dragCoefficient: 0.10,
    description: "Large payload fairing for heavy satellites and multi-payload missions.",
    tier: 3,
  },
  {
    id: "adapter-3to2",
    name: "Interstage 3→2",
    category: "adapter",
    mass: 400,
    cost: 500_000,
    description: "Connects a wider lower stage to a narrower upper stage.",
    tier: 1,
  },
  {
    id: "adapter-2to1",
    name: "Interstage 2→1",
    category: "adapter",
    mass: 250,
    cost: 300_000,
    description: "Standard interstage adapter ring.",
    tier: 1,
  },
  {
    id: "decoupler-standard",
    name: "Decoupler",
    category: "decoupler",
    mass: 150,
    cost: 200_000,
    description: "Pyrotechnic stage separation mechanism. Reliable and lightweight.",
    tier: 1,
  },
  {
    id: "decoupler-heavy",
    name: "Heavy Decoupler",
    category: "decoupler",
    mass: 400,
    cost: 600_000,
    description: "Heavy-duty separation system for large stages.",
    tier: 2,
  },
  {
    id: "nosecone",
    name: "Nosecone",
    category: "nosecone",
    mass: 200,
    cost: 150_000,
    dragCoefficient: 0.08,
    description: "Simple aerodynamic nosecone for suborbital flights.",
    tier: 1,
  },
];

export function getFuelTankById(id: string): FuelTankDef | undefined {
  return FUEL_TANKS.find((t) => t.id === id);
}

export function getFuelTanksByTier(maxTier: number): FuelTankDef[] {
  return FUEL_TANKS.filter((t) => t.tier <= maxTier);
}

export function getStructuralPartById(id: string): StructuralPartDef | undefined {
  return STRUCTURAL_PARTS.find((p) => p.id === id);
}

export function getStructuralPartsByTier(maxTier: number): StructuralPartDef[] {
  return STRUCTURAL_PARTS.filter((p) => p.tier <= maxTier);
}
