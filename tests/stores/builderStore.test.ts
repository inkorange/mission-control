import { describe, it, expect, beforeEach } from "vitest";
import { useBuilderStore } from "@/stores/useBuilderStore";
import { ENGINES, getEngineById } from "@/engine/data/engines";
import { FUEL_TANKS } from "@/engine/data/parts";
import type { FuelTankDef, FuelType } from "@/types/rocket";
import { ENGINE_FUEL_MAP } from "@/types/rocket";
import { G0 } from "@/engine/physics/constants";

// Helper to get store state directly
const store = () => useBuilderStore.getState();

// Known test data
const KESTREL_7 = ENGINES.find((e) => e.id === "kestrel-7")!;
const SPARTAN_1 = ENGINES.find((e) => e.id === "spartan-1")!;
const SPARTAN_S = ENGINES.find((e) => e.id === "spartan-s")!;
const KEROLOX_SMALL = FUEL_TANKS.find((t) => t.id === "kerolox-small")!;
const KEROLOX_MEDIUM = FUEL_TANKS.find((t) => t.id === "kerolox-medium")!;
const SOLID_SMALL = FUEL_TANKS.find((t) => t.id === "solid-small")!;
const HYDROLOX_SMALL = FUEL_TANKS.find((t) => t.id === "hydrolox-small")!;
const TITAN_RL = ENGINES.find((e) => e.id === "titan-rl")!;
const RAPTOR_X = ENGINES.find((e) => e.id === "raptor-x")!;
const HALCYON = ENGINES.find((e) => e.id === "halcyon-drive")!;

/**
 * Mirrors the builder page's compatibleFuelTypes derivation.
 * Given a stage index, returns the deduped fuel types for its engines.
 */
function getCompatibleFuelTypes(stageIndex: number): FuelType[] {
  const stage = store().stages[stageIndex];
  if (!stage) return [];
  return [
    ...new Set(
      stage.engines
        .map((ec) => {
          const engine = getEngineById(ec.engineId);
          return engine ? ENGINE_FUEL_MAP[engine.type] : null;
        })
        .filter((ft): ft is FuelType => ft !== null)
    ),
  ];
}

/** Returns fuel tanks filtered to compatible types for a stage. */
function getCompatibleTanks(stageIndex: number) {
  const types = getCompatibleFuelTypes(stageIndex);
  return FUEL_TANKS.filter((t) => types.includes(t.fuelType));
}

describe("Builder Store", () => {
  beforeEach(() => {
    store().reset();
  });

  describe("Stage management", () => {
    it("starts with no stages", () => {
      expect(store().stages).toHaveLength(0);
    });

    it("adds a stage with correct defaults", () => {
      store().addStage();
      const stage = store().stages[0];
      expect(stage.engines).toHaveLength(0);
      expect(stage.fuelMass).toBe(0);
      expect(stage.fuelCapacity).toBe(0);
      expect(stage.structuralMass).toBe(0);
      expect(stage.partsCost).toBe(0);
      expect(stage.fuelType).toBe("kerosene_lox");
    });

    it("removes a stage", () => {
      store().addStage();
      store().addStage();
      expect(store().stages).toHaveLength(2);
      store().removeStage(0);
      expect(store().stages).toHaveLength(1);
    });

    it("resets all state", () => {
      store().setMission("test", { name: "Test", mass: 100 });
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().reset();
      expect(store().stages).toHaveLength(0);
      expect(store().missionId).toBe("");
      expect(store().payload.mass).toBe(0);
    });
  });

  describe("Engine management", () => {
    beforeEach(() => {
      store().addStage();
    });

    it("adds an engine to a stage", () => {
      store().setEngine(0, "kestrel-7", 1);
      expect(store().stages[0].engines).toHaveLength(1);
      expect(store().stages[0].engines[0].engineId).toBe("kestrel-7");
      expect(store().stages[0].engines[0].count).toBe(1);
    });

    it("increments engine count", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().setEngine(0, "kestrel-7", 3);
      expect(store().stages[0].engines).toHaveLength(1);
      expect(store().stages[0].engines[0].count).toBe(3);
    });

    it("removes engine when count is 0", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().setEngine(0, "kestrel-7", 0);
      expect(store().stages[0].engines).toHaveLength(0);
    });

    it("supports multiple engine types on one stage", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().setEngine(0, "spartan-1", 2);
      expect(store().stages[0].engines).toHaveLength(2);
    });
  });

  describe("Fuel tank cost tracking (bug fix)", () => {
    beforeEach(() => {
      store().addStage();
    });

    it("addFuelTank adds cost to partsCost", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      expect(store().stages[0].partsCost).toBe(KEROLOX_SMALL.cost);
    });

    it("addFuelTank accumulates cost from multiple tanks", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_SMALL);
      expect(store().stages[0].partsCost).toBe(KEROLOX_SMALL.cost * 2);
    });

    it("addFuelTank adds tank dry mass to structuralMass", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      expect(store().stages[0].structuralMass).toBe(KEROLOX_SMALL.dryMass);
    });

    it("addFuelTank accumulates structural mass", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().stages[0].structuralMass).toBe(
        KEROLOX_SMALL.dryMass + KEROLOX_MEDIUM.dryMass
      );
    });

    it("addFuelTank sets fuel type", () => {
      store().addFuelTank(0, SOLID_SMALL);
      expect(store().stages[0].fuelType).toBe("solid_propellant");
    });

    it("getTotalCost includes fuel tank costs", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      expect(store().getTotalCost()).toBe(KEROLOX_SMALL.cost);
    });

    it("getTotalCost includes both engine and tank costs", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().getTotalCost()).toBe(KESTREL_7.cost + KEROLOX_MEDIUM.cost);
    });

    it("getTotalCost sums across multiple stages", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_SMALL);

      store().addStage();
      store().setEngine(1, "spartan-s", 1);
      store().addFuelTank(1, SOLID_SMALL);

      const expected =
        KESTREL_7.cost + KEROLOX_SMALL.cost + SPARTAN_S.cost + SOLID_SMALL.cost;
      expect(store().getTotalCost()).toBe(expected);
    });

    it("empty stage has zero cost", () => {
      expect(store().getTotalCost()).toBe(0);
    });
  });

  describe("Fuel capacity tracking (bug fix)", () => {
    beforeEach(() => {
      store().addStage();
    });

    it("addFuelTank sets fuelCapacity", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      expect(store().stages[0].fuelCapacity).toBe(KEROLOX_SMALL.fuelCapacity);
    });

    it("addFuelTank accumulates capacity from multiple tanks", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().stages[0].fuelCapacity).toBe(
        KEROLOX_SMALL.fuelCapacity + KEROLOX_MEDIUM.fuelCapacity
      );
    });

    it("addFuelTank auto-fills fuel to full capacity", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      expect(store().stages[0].fuelMass).toBe(KEROLOX_SMALL.fuelCapacity);
    });

    it("adding second tank fills to total capacity", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const totalCapacity =
        KEROLOX_SMALL.fuelCapacity + KEROLOX_MEDIUM.fuelCapacity;
      expect(store().stages[0].fuelMass).toBe(totalCapacity);
    });

    it("setFuelMass can reduce fuel below capacity", () => {
      store().addFuelTank(0, KEROLOX_MEDIUM);
      store().setFuelMass(0, 50_000);
      expect(store().stages[0].fuelMass).toBe(50_000);
      // Capacity unchanged
      expect(store().stages[0].fuelCapacity).toBe(KEROLOX_MEDIUM.fuelCapacity);
    });

    it("new stage starts with zero capacity", () => {
      expect(store().stages[0].fuelCapacity).toBe(0);
      expect(store().stages[0].fuelMass).toBe(0);
    });

    it("addFuelTank tracks tank ID in tanks array", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      expect(store().stages[0].tanks).toEqual(["kerolox-small"]);

      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().stages[0].tanks).toEqual(["kerolox-small", "kerolox-medium"]);
    });

    it("new stage starts with empty tanks array", () => {
      expect(store().stages[0].tanks).toEqual([]);
    });
  });

  describe("Remove fuel tank", () => {
    beforeEach(() => {
      store().addStage();
    });

    it("removeFuelTank removes tank from array", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().stages[0].tanks).toHaveLength(2);

      store().removeFuelTank(0, 0); // remove kerolox-small
      expect(store().stages[0].tanks).toEqual(["kerolox-medium"]);
    });

    it("removeFuelTank decrements fuelCapacity", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const totalBefore = KEROLOX_SMALL.fuelCapacity + KEROLOX_MEDIUM.fuelCapacity;
      expect(store().stages[0].fuelCapacity).toBe(totalBefore);

      store().removeFuelTank(0, 0); // remove kerolox-small
      expect(store().stages[0].fuelCapacity).toBe(KEROLOX_MEDIUM.fuelCapacity);
    });

    it("removeFuelTank decrements structuralMass", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);

      store().removeFuelTank(0, 0);
      expect(store().stages[0].structuralMass).toBe(KEROLOX_MEDIUM.dryMass);
    });

    it("removeFuelTank decrements partsCost", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);

      store().removeFuelTank(0, 0);
      expect(store().stages[0].partsCost).toBe(KEROLOX_MEDIUM.cost);
    });

    it("removeFuelTank clamps fuelMass to new capacity", () => {
      store().addFuelTank(0, KEROLOX_SMALL);  // 30,000 kg
      store().addFuelTank(0, KEROLOX_MEDIUM); // 150,000 kg
      // fuelMass is auto-filled to 180,000
      expect(store().stages[0].fuelMass).toBe(180_000);

      store().removeFuelTank(0, 1); // remove medium, capacity drops to 30,000
      expect(store().stages[0].fuelMass).toBe(KEROLOX_SMALL.fuelCapacity); // 30,000
    });

    it("removing all tanks zeros everything out", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().removeFuelTank(0, 0);

      const stage = store().stages[0];
      expect(stage.tanks).toEqual([]);
      expect(stage.fuelCapacity).toBe(0);
      expect(stage.fuelMass).toBe(0);
      expect(stage.structuralMass).toBe(0);
      expect(stage.partsCost).toBe(0);
    });

    it("removing tank updates getTotalCost correctly", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().getTotalCost()).toBe(
        KESTREL_7.cost + KEROLOX_SMALL.cost + KEROLOX_MEDIUM.cost
      );

      store().removeFuelTank(0, 0); // remove small
      expect(store().getTotalCost()).toBe(KESTREL_7.cost + KEROLOX_MEDIUM.cost);
    });

    it("removing tank updates getTotalMass correctly", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      store().addFuelTank(0, KEROLOX_MEDIUM);

      store().removeFuelTank(0, 1); // remove medium
      // Only small tank remains: dryMass + fuelCapacity (auto-clamped)
      expect(store().getTotalMass()).toBe(
        KEROLOX_SMALL.dryMass + KEROLOX_SMALL.fuelCapacity
      );
    });
  });

  describe("Total mass calculations", () => {
    beforeEach(() => {
      store().addStage();
    });

    it("includes engine mass", () => {
      store().setEngine(0, "kestrel-7", 1);
      expect(store().getTotalMass()).toBe(KESTREL_7.mass);
    });

    it("includes fuel mass", () => {
      store().addFuelTank(0, KEROLOX_SMALL);
      // mass = tank dryMass (structural) + fuel mass (auto-filled to capacity)
      expect(store().getTotalMass()).toBe(
        KEROLOX_SMALL.dryMass + KEROLOX_SMALL.fuelCapacity
      );
    });

    it("includes engine + fuel + structural mass", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const expected =
        KESTREL_7.mass + KEROLOX_MEDIUM.dryMass + KEROLOX_MEDIUM.fuelCapacity;
      expect(store().getTotalMass()).toBe(expected);
    });

    it("includes payload mass", () => {
      store().setMission("test", { name: "Payload", mass: 500 });
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      expect(store().getTotalMass()).toBe(KESTREL_7.mass + 500);
    });

    it("dry mass excludes fuel", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const dryExpected = KESTREL_7.mass + KEROLOX_MEDIUM.dryMass;
      expect(store().getTotalDryMass()).toBe(dryExpected);
    });

    it("mass changes when fuel slider is adjusted", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const fullMass = store().getTotalMass();

      store().setFuelMass(0, 50_000);
      const reducedMass = store().getTotalMass();
      expect(reducedMass).toBeLessThan(fullMass);
      expect(reducedMass).toBe(
        KESTREL_7.mass + KEROLOX_MEDIUM.dryMass + 50_000
      );
    });
  });

  describe("TWR calculations", () => {
    beforeEach(() => {
      store().addStage();
    });

    it("returns 0 with no stages", () => {
      store().removeStage(0);
      expect(store().getTWR()).toBe(0);
    });

    it("returns 0 with no engines", () => {
      expect(store().getTWR()).toBe(0);
    });

    it("calculates correct TWR with engine only", () => {
      store().setEngine(0, "kestrel-7", 1);
      // TWR = thrust_SL / (mass * g0)
      const expected = KESTREL_7.thrustSeaLevel / (KESTREL_7.mass * G0);
      expect(store().getTWR()).toBeCloseTo(expected, 2);
    });

    it("TWR decreases when fuel is added", () => {
      store().setEngine(0, "kestrel-7", 1);
      const twrNoFuel = store().getTWR();

      store().addFuelTank(0, KEROLOX_MEDIUM);
      const twrWithFuel = store().getTWR();
      expect(twrWithFuel).toBeLessThan(twrNoFuel);
    });

    it("TWR can drop below 1.0 with too much fuel", () => {
      store().setEngine(0, "spartan-s", 1);
      // Spartan-S: 400kN SL thrust, 1,200kg mass → TWR ~34 with engine alone
      const twrEngineOnly = store().getTWR();
      expect(twrEngineOnly).toBeGreaterThan(1.0);

      // Add a big tank — 150t of fuel + 10t dry mass
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const twrHeavy = store().getTWR();
      // 400,000 N / ((1200 + 10000 + 150000) * 9.81) = 0.253
      expect(twrHeavy).toBeLessThan(1.0);
    });

    it("TWR increases when adding more engines", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const twrOne = store().getTWR();

      store().setEngine(0, "kestrel-7", 3);
      const twrThree = store().getTWR();
      expect(twrThree).toBeGreaterThan(twrOne);
    });

    it("TWR increases when fuel is reduced via slider", () => {
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      const twrFull = store().getTWR();

      store().setFuelMass(0, 30_000);
      const twrReduced = store().getTWR();
      expect(twrReduced).toBeGreaterThan(twrFull);
    });

    it("uses first stage for TWR calculation", () => {
      // First stage: big engine
      store().setEngine(0, "kestrel-7", 1);

      // Second stage: small engine (should not affect launch TWR)
      store().addStage();
      store().setEngine(1, "spartan-s", 1);

      const twr = store().getTWR();
      const totalMass = store().getTotalMass();
      const expected = KESTREL_7.thrustSeaLevel / (totalMass * G0);
      expect(twr).toBeCloseTo(expected, 2);
    });
  });

  describe("Delta-v calculations", () => {
    it("returns 0 with no stages", () => {
      expect(store().getTotalDeltaV()).toBe(0);
    });

    it("returns 0 with engine but no fuel", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      expect(store().getTotalDeltaV()).toBe(0);
    });

    it("returns positive delta-v with engine and fuel", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().getTotalDeltaV()).toBeGreaterThan(0);
    });

    it("delta-v increases with more fuel (diminishing returns)", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_SMALL);
      const dvSmall = store().getTotalDeltaV();

      store().addFuelTank(0, KEROLOX_MEDIUM);
      const dvLarge = store().getTotalDeltaV();
      expect(dvLarge).toBeGreaterThan(dvSmall);
    });

    it("per-stage delta-v sums to roughly total", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);

      store().addStage();
      store().setEngine(1, "spartan-s", 1);
      store().addFuelTank(1, SOLID_SMALL);

      const dv0 = store().getStageDeltaV(0);
      const dv1 = store().getStageDeltaV(1);
      const total = store().getTotalDeltaV();

      // Per-stage Δv summed should be close to total (not exact due to staging)
      expect(dv0).toBeGreaterThan(0);
      expect(dv1).toBeGreaterThan(0);
      expect(dv0 + dv1).toBeCloseTo(total, -1);
    });
  });

  describe("getRocketConfig", () => {
    it("returns correct totalCost including tank costs", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);

      const config = store().getRocketConfig();
      expect(config.totalCost).toBe(KESTREL_7.cost + KEROLOX_MEDIUM.cost);
    });

    it("returns correct totalMass", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_SMALL);

      const config = store().getRocketConfig();
      expect(config.totalMass).toBe(
        KESTREL_7.mass + KEROLOX_SMALL.dryMass + KEROLOX_SMALL.fuelCapacity
      );
    });

    it("returns correct totalDryMass (excludes fuel)", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_SMALL);

      const config = store().getRocketConfig();
      expect(config.totalDryMass).toBe(
        KESTREL_7.mass + KEROLOX_SMALL.dryMass
      );
    });
  });

  describe("Realistic build scenario", () => {
    it("Tier 1 mission: Kestrel-7 + K-Tank M achieves reasonable stats", () => {
      store().setMission("first-light", { name: "First Light", mass: 0 });
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);

      const cost = store().getTotalCost();
      const twr = store().getTWR();
      const dv = store().getTotalDeltaV();
      const mass = store().getTotalMass();

      // Cost: $8M engine + $6M tank = $14M
      expect(cost).toBe(14_000_000);

      // Mass: 3400kg engine + 10000kg tank dry + 150000kg fuel = 163400kg
      expect(mass).toBe(163_400);

      // TWR should be > 1.0 (845kN / (163400 * 9.81) ≈ 0.527)
      // Actually with this much fuel, TWR is below 1 — realistic!
      expect(twr).toBeLessThan(1.0);

      // Delta-v should be substantial
      expect(dv).toBeGreaterThan(1000);
    });

    it("adding more engines fixes low TWR", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().getTWR()).toBeLessThan(1.0);

      // Add second engine
      store().setEngine(0, "kestrel-7", 2);
      // 2 × 845kN = 1690kN, mass = 6800 + 10000 + 150000 = 166800
      // TWR = 1,690,000 / (166800 * 9.81) ≈ 1.033
      expect(store().getTWR()).toBeGreaterThan(1.0);
    });

    it("reducing fuel via slider fixes low TWR", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      expect(store().getTWR()).toBeLessThan(1.0);

      // Reduce fuel to get TWR above 1.0
      // Need mass < 845000/9.81 ≈ 86,137 kg
      // Dry mass = 3400 + 10000 = 13400
      // Max fuel for TWR > 1.0 ≈ 72,700kg
      store().setFuelMass(0, 70_000);
      expect(store().getTWR()).toBeGreaterThan(1.0);
    });

    it("two-stage rocket with correct per-stage costs", () => {
      // First stage: 2× Kestrel-7 + K-Tank L-equivalent (two mediums)
      store().addStage();
      store().setEngine(0, "kestrel-7", 2);
      store().addFuelTank(0, KEROLOX_MEDIUM);
      store().addFuelTank(0, KEROLOX_MEDIUM);

      // Second stage: 1× Spartan-S + SRB Casing S
      store().addStage();
      store().setEngine(1, "spartan-s", 1);
      store().addFuelTank(1, SOLID_SMALL);

      const totalCost = store().getTotalCost();
      // Stage 1: 2 × $8M + 2 × $6M = $28M
      // Stage 2: $800K + $500K = $1.3M
      expect(totalCost).toBe(
        KESTREL_7.cost * 2 + KEROLOX_MEDIUM.cost * 2 +
        SPARTAN_S.cost + SOLID_SMALL.cost
      );

      // Both stages should have delta-v
      expect(store().getStageDeltaV(0)).toBeGreaterThan(0);
      expect(store().getStageDeltaV(1)).toBeGreaterThan(0);
    });
  });

  describe("Engine-fuel compatibility (ENGINE_FUEL_MAP)", () => {
    it("maps every EngineType to a FuelType", () => {
      // All engine types must have a fuel mapping
      expect(ENGINE_FUEL_MAP.solid).toBe("solid_propellant");
      expect(ENGINE_FUEL_MAP.liquid_kerolox).toBe("kerosene_lox");
      expect(ENGINE_FUEL_MAP.liquid_hydrolox).toBe("hydrogen_lox");
      expect(ENGINE_FUEL_MAP.liquid_methalox).toBe("methane_lox");
      expect(ENGINE_FUEL_MAP.ion).toBe("xenon");
    });

    it("every engine in the catalog has a valid fuel mapping", () => {
      for (const engine of ENGINES) {
        const fuelType = ENGINE_FUEL_MAP[engine.type];
        expect(fuelType).toBeDefined();
        // And there should be at least one tank for that fuel type
        const matchingTanks = FUEL_TANKS.filter((t) => t.fuelType === fuelType);
        expect(matchingTanks.length).toBeGreaterThan(0);
      }
    });

    it("every fuel tank has at least one engine that uses its fuel type", () => {
      for (const tank of FUEL_TANKS) {
        const compatibleEngines = ENGINES.filter(
          (e) => ENGINE_FUEL_MAP[e.type] === tank.fuelType
        );
        expect(compatibleEngines.length).toBeGreaterThan(0);
      }
    });

    it("kerolox engine maps to kerosene tanks only", () => {
      const fuelType = ENGINE_FUEL_MAP[KESTREL_7.type];
      expect(fuelType).toBe("kerosene_lox");

      // kerolox tanks should match
      expect(KEROLOX_SMALL.fuelType).toBe(fuelType);
      expect(KEROLOX_MEDIUM.fuelType).toBe(fuelType);

      // solid tanks should NOT match
      expect(SOLID_SMALL.fuelType).not.toBe(fuelType);
    });

    it("solid engine maps to solid propellant tanks only", () => {
      const fuelType = ENGINE_FUEL_MAP[SPARTAN_1.type];
      expect(fuelType).toBe("solid_propellant");

      // solid tank should match
      expect(SOLID_SMALL.fuelType).toBe(fuelType);

      // kerolox tanks should NOT match
      expect(KEROLOX_SMALL.fuelType).not.toBe(fuelType);
    });

    it("compatible fuel types can be derived from stage engines", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);

      expect(getCompatibleFuelTypes(0)).toEqual(["kerosene_lox"]);

      // Filter tanks
      const compatibleTanks = FUEL_TANKS.filter((t) =>
        getCompatibleFuelTypes(0).includes(t.fuelType)
      );
      expect(compatibleTanks.every((t) => t.fuelType === "kerosene_lox")).toBe(true);
      expect(compatibleTanks.length).toBeGreaterThan(0);
    });

    it("stage with no engines yields no compatible fuel types", () => {
      store().addStage();
      expect(getCompatibleFuelTypes(0)).toEqual([]);
    });

    it("no stages yields no compatible fuel types", () => {
      // No stages at all — selectedStage is undefined
      const stages = store().stages;
      expect(stages.length).toBe(0);

      const selectedStage = stages[0];
      const result: FuelType[] = selectedStage
        ? getCompatibleFuelTypes(0)
        : [];
      expect(result).toEqual([]);
    });

    it("hydrolox engine yields only hydrogen_lox tanks", () => {
      store().addStage();
      store().setEngine(0, "titan-rl", 1);

      expect(getCompatibleFuelTypes(0)).toEqual(["hydrogen_lox"]);

      const tanks = getCompatibleTanks(0);
      expect(tanks.every((t) => t.fuelType === "hydrogen_lox")).toBe(true);
      expect(tanks.length).toBeGreaterThan(0);
      // No kerolox tanks should leak through
      expect(tanks.some((t) => t.fuelType === "kerosene_lox")).toBe(false);
    });

    it("methalox engine yields only methane_lox tanks", () => {
      store().addStage();
      store().setEngine(0, "raptor-x", 1);

      expect(getCompatibleFuelTypes(0)).toEqual(["methane_lox"]);

      const tanks = getCompatibleTanks(0);
      expect(tanks.every((t) => t.fuelType === "methane_lox")).toBe(true);
      expect(tanks.length).toBeGreaterThan(0);
    });

    it("ion engine yields only xenon tanks", () => {
      store().addStage();
      store().setEngine(0, "halcyon-drive", 1);

      expect(getCompatibleFuelTypes(0)).toEqual(["xenon"]);

      const tanks = getCompatibleTanks(0);
      expect(tanks.every((t) => t.fuelType === "xenon")).toBe(true);
      expect(tanks.length).toBeGreaterThan(0);
    });

    it("multiple engines of same fuel type produce one fuel type (dedup)", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 3);   // kerolox
      store().setEngine(0, "kestrel-9", 2);   // also kerolox

      const types = getCompatibleFuelTypes(0);
      expect(types).toEqual(["kerosene_lox"]);
      // No duplicates
      expect(types.length).toBe(1);
    });

    it("removing all engines from a stage resets compatible fuel types to empty", () => {
      store().addStage();
      store().setEngine(0, "kestrel-7", 1);
      expect(getCompatibleFuelTypes(0)).toEqual(["kerosene_lox"]);

      // Remove the engine (count 0)
      store().setEngine(0, "kestrel-7", 0);
      expect(getCompatibleFuelTypes(0)).toEqual([]);
    });

    it("fuel tab filtering excludes incompatible tanks completely", () => {
      store().addStage();
      store().setEngine(0, "spartan-1", 1); // solid

      const compatible = getCompatibleTanks(0);
      const incompatible = FUEL_TANKS.filter(
        (t) => !getCompatibleFuelTypes(0).includes(t.fuelType)
      );

      // All compatible tanks are solid
      expect(compatible.every((t) => t.fuelType === "solid_propellant")).toBe(true);
      // No incompatible tank is solid
      expect(incompatible.some((t) => t.fuelType === "solid_propellant")).toBe(false);
      // Together they account for all tanks
      expect(compatible.length + incompatible.length).toBe(FUEL_TANKS.length);
    });
  });
});
