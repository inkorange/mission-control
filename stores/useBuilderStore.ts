import { create } from "zustand";
import type {
  Stage,
  Payload,
  RocketConfig,
  EngineConfig,
  FuelType,
  StageSpec,
} from "@/types/rocket";
import { getEngineById } from "@/engine/data/engines";
import { deltaV, thrustToWeightRatio, totalDeltaV } from "@/engine/physics/tsiolkovsky";
import { G0 } from "@/engine/physics/constants";

let stageCounter = 0;
function generateStageId(): string {
  return `stage-${++stageCounter}-${Date.now()}`;
}

interface BuilderState {
  missionId: string;
  stages: Stage[];
  payload: Payload;

  // Actions
  setMission: (missionId: string, payload: Payload) => void;
  addStage: () => void;
  removeStage: (stageIndex: number) => void;
  reorderStages: (from: number, to: number) => void;
  setEngine: (stageIndex: number, engineId: string, count: number) => void;
  setFuel: (stageIndex: number, fuelType: FuelType, massKg: number) => void;
  addPart: (stageIndex: number, partId: string) => void;
  removePart: (stageIndex: number, partIndex: number) => void;
  setFuelMass: (stageIndex: number, fuelMass: number) => void;
  reset: () => void;

  // Computed helpers (call these as functions from components)
  getTotalMass: () => number;
  getTotalDryMass: () => number;
  getTotalCost: () => number;
  getTotalDeltaV: () => number;
  getStageDeltaV: (stageIndex: number) => number;
  getTWR: () => number;
  getStageSpecs: () => StageSpec[];
  getRocketConfig: () => RocketConfig;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  missionId: "",
  stages: [],
  payload: { name: "Payload", mass: 0 },

  setMission: (missionId: string, payload: Payload) => {
    stageCounter = 0;
    set({ missionId, payload, stages: [] });
  },

  addStage: () => {
    set((state) => ({
      stages: [
        ...state.stages,
        {
          id: generateStageId(),
          engines: [],
          fuelType: "kerosene_lox",
          fuelMass: 0,
          structuralMass: 0,
          parts: [],
        },
      ],
    }));
  },

  removeStage: (stageIndex: number) => {
    set((state) => ({
      stages: state.stages.filter((_, i) => i !== stageIndex),
    }));
  },

  reorderStages: (from: number, to: number) => {
    set((state) => {
      const newStages = [...state.stages];
      const [removed] = newStages.splice(from, 1);
      newStages.splice(to, 0, removed);
      return { stages: newStages };
    });
  },

  setEngine: (stageIndex: number, engineId: string, count: number) => {
    set((state) => {
      const newStages = [...state.stages];
      const stage = { ...newStages[stageIndex] };
      const existing = stage.engines.findIndex((e) => e.engineId === engineId);
      const newEngines = [...stage.engines];

      if (count <= 0) {
        if (existing >= 0) newEngines.splice(existing, 1);
      } else if (existing >= 0) {
        newEngines[existing] = { engineId, count };
      } else {
        newEngines.push({ engineId, count });
      }

      stage.engines = newEngines;
      newStages[stageIndex] = stage;
      return { stages: newStages };
    });
  },

  setFuel: (stageIndex: number, fuelType: FuelType, massKg: number) => {
    set((state) => {
      const newStages = [...state.stages];
      newStages[stageIndex] = {
        ...newStages[stageIndex],
        fuelType,
        fuelMass: massKg,
      };
      return { stages: newStages };
    });
  },

  setFuelMass: (stageIndex: number, fuelMass: number) => {
    set((state) => {
      const newStages = [...state.stages];
      newStages[stageIndex] = { ...newStages[stageIndex], fuelMass };
      return { stages: newStages };
    });
  },

  addPart: (stageIndex: number, partId: string) => {
    set((state) => {
      const newStages = [...state.stages];
      newStages[stageIndex] = {
        ...newStages[stageIndex],
        parts: [...newStages[stageIndex].parts, partId],
      };
      return { stages: newStages };
    });
  },

  removePart: (stageIndex: number, partIndex: number) => {
    set((state) => {
      const newStages = [...state.stages];
      const newParts = [...newStages[stageIndex].parts];
      newParts.splice(partIndex, 1);
      newStages[stageIndex] = { ...newStages[stageIndex], parts: newParts };
      return { stages: newStages };
    });
  },

  reset: () => {
    stageCounter = 0;
    set({ missionId: "", stages: [], payload: { name: "Payload", mass: 0 } });
  },

  // === Computed Helpers ===

  getTotalMass: () => {
    const { stages, payload } = get();
    let total = payload.mass;
    for (const stage of stages) {
      total += stage.fuelMass + stage.structuralMass;
      for (const ec of stage.engines) {
        const engine = getEngineById(ec.engineId);
        if (engine) total += engine.mass * ec.count;
      }
    }
    return total;
  },

  getTotalDryMass: () => {
    const { stages, payload } = get();
    let total = payload.mass;
    for (const stage of stages) {
      total += stage.structuralMass;
      for (const ec of stage.engines) {
        const engine = getEngineById(ec.engineId);
        if (engine) total += engine.mass * ec.count;
      }
    }
    return total;
  },

  getTotalCost: () => {
    const { stages } = get();
    let total = 0;
    for (const stage of stages) {
      for (const ec of stage.engines) {
        const engine = getEngineById(ec.engineId);
        if (engine) total += engine.cost * ec.count;
      }
      // Fuel cost is simplified as part of engine/tank cost
    }
    return total;
  },

  getStageSpecs: () => {
    const { stages, payload } = get();
    return stages.map((stage) => {
      let engineMass = 0;
      let thrustVac = 0;
      let thrustSL = 0;
      let weightedIsp = 0;
      let totalThrustForWeight = 0;

      for (const ec of stage.engines) {
        const engine = getEngineById(ec.engineId);
        if (!engine) continue;
        engineMass += engine.mass * ec.count;
        thrustVac += engine.thrustVacuum * ec.count;
        thrustSL += engine.thrustSeaLevel * ec.count;
        weightedIsp += engine.ispVacuum * engine.thrustVacuum * ec.count;
        totalThrustForWeight += engine.thrustVacuum * ec.count;
      }

      const isp = totalThrustForWeight > 0 ? weightedIsp / totalThrustForWeight : 0;
      const dryMass = stage.structuralMass + engineMass;
      const wetMass = dryMass + stage.fuelMass;

      return { wetMass, dryMass, isp, thrustVacuum: thrustVac, thrustSeaLevel: thrustSL };
    });
  },

  getStageDeltaV: (stageIndex: number) => {
    const specs = get().getStageSpecs();
    const { payload } = get();
    if (stageIndex >= specs.length) return 0;

    // Payload for this stage is everything above it
    const payloadAbove =
      specs.slice(stageIndex + 1).reduce((sum, s) => sum + s.wetMass, 0) +
      payload.mass;

    const wet = specs[stageIndex].wetMass + payloadAbove;
    const dry = specs[stageIndex].dryMass + payloadAbove;
    return deltaV(specs[stageIndex].isp, wet, dry);
  },

  getTotalDeltaV: () => {
    const specs = get().getStageSpecs();
    const { payload } = get();

    // Add payload mass to the top stage
    if (specs.length > 0) {
      const topIndex = specs.length - 1;
      specs[topIndex] = {
        ...specs[topIndex],
        wetMass: specs[topIndex].wetMass + payload.mass,
        dryMass: specs[topIndex].dryMass + payload.mass,
      };
    }

    return totalDeltaV(specs);
  },

  getTWR: () => {
    const { stages } = get();
    if (stages.length === 0) return 0;

    // TWR at launch (first stage)
    const firstStage = stages[0];
    let totalThrust = 0;
    for (const ec of firstStage.engines) {
      const engine = getEngineById(ec.engineId);
      if (engine) totalThrust += engine.thrustSeaLevel * ec.count;
    }

    const totalMass = get().getTotalMass();
    return thrustToWeightRatio(totalThrust, totalMass);
  },

  getRocketConfig: () => {
    const { missionId, stages, payload } = get();
    return {
      id: `rocket-${Date.now()}`,
      name: `Rocket for ${missionId}`,
      stages,
      payload,
      totalCost: get().getTotalCost(),
      totalMass: get().getTotalMass(),
      totalDryMass: get().getTotalDryMass(),
    };
  },
}));
