export type EngineType =
  | "solid"
  | "liquid_kerolox"
  | "liquid_hydrolox"
  | "liquid_methalox"
  | "ion";

export type FuelType =
  | "solid_propellant"
  | "kerosene_lox"
  | "hydrogen_lox"
  | "methane_lox"
  | "xenon";

/** Each engine type burns exactly one fuel type. */
export const ENGINE_FUEL_MAP: Record<EngineType, FuelType> = {
  solid: "solid_propellant",
  liquid_kerolox: "kerosene_lox",
  liquid_hydrolox: "hydrogen_lox",
  liquid_methalox: "methane_lox",
  ion: "xenon",
};

export type PartCategory = "engine" | "fuel_tank" | "structural" | "fairing" | "adapter";

export interface EngineDef {
  id: string;
  name: string;
  type: EngineType;
  thrustSeaLevel: number; // Newtons
  thrustVacuum: number; // Newtons
  ispSeaLevel: number; // seconds
  ispVacuum: number; // seconds
  mass: number; // kg (dry)
  cost: number; // dollars
  throttleable: boolean;
  minThrottle: number; // 0-1
  restartable: boolean;
  description: string;
  tier: number; // Unlock tier (1-5)
}

export interface FuelTankDef {
  id: string;
  name: string;
  fuelType: FuelType;
  fuelCapacity: number; // kg
  dryMass: number; // kg (tank structure)
  cost: number;
  description: string;
  tier: number;
}

export interface StructuralPartDef {
  id: string;
  name: string;
  category: "fairing" | "adapter" | "decoupler" | "nosecone";
  mass: number; // kg
  cost: number;
  dragCoefficient?: number;
  description: string;
  tier: number;
}

export type PartDef = EngineDef | FuelTankDef | StructuralPartDef;

export interface EngineConfig {
  engineId: string;
  count: number;
}

export interface FairingConfig {
  partId: string;
  jettisoned: boolean;
}

export interface Stage {
  id: string;
  engines: EngineConfig[];
  fuelType: FuelType;
  fuelMass: number; // kg of fuel currently loaded
  fuelCapacity: number; // kg max capacity from purchased tanks
  structuralMass: number; // kg (tanks, interstage, etc.)
  partsCost: number; // cost of fuel tanks and structural parts
  tanks: string[]; // Fuel tank IDs added to this stage (supports duplicates)
  parts: string[]; // Part IDs for structural components
  fairings?: FairingConfig;
}

export interface Payload {
  name: string;
  mass: number; // kg
}

export interface RocketConfig {
  id: string;
  name: string;
  stages: Stage[]; // Bottom-up order (first stage at index 0)
  payload: Payload;
  totalCost: number;
  totalMass: number; // Wet mass (fuel included)
  totalDryMass: number; // Without fuel
}

export interface StageSpec {
  wetMass: number;
  dryMass: number;
  isp: number;
  thrustVacuum: number;
  thrustSeaLevel: number;
}
