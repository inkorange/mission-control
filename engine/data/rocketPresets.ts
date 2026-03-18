import { getFuelTankById } from "./parts";
import { useBuilderStore } from "@/stores/useBuilderStore";
import type { Mission } from "@/types/mission";

/**
 * Pre-designed rocket configurations for each mission.
 * Each config specifies stages bottom-up (index 0 = booster, fires first).
 */
interface StagePreset {
  engines: { id: string; count: number }[];
  tanks: string[]; // tank IDs (can repeat for multiples)
}

interface RocketPreset {
  stages: StagePreset[];
}

const PRESETS: Record<string, RocketPreset> = {
  // TIER 1: Foundations

  // First Light — simple suborbital sounding rocket
  "1-1": {
    stages: [
      { engines: [{ id: "spartan-1", count: 1 }], tanks: ["solid-medium"] },
    ],
  },

  // Orbit! — 4-stage to LEO, TWR > 1 on all stages
  "1-2": {
    stages: [
      { engines: [{ id: "spartan-1", count: 5 }], tanks: ["solid-medium", "solid-medium"] },
      { engines: [{ id: "kestrel-7", count: 3 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 2 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 1 }], tanks: ["kerolox-small"] },
    ],
  },

  // Payload Delivery — 4-stage to LEO with 500kg payload
  "1-3": {
    stages: [
      { engines: [{ id: "spartan-1", count: 5 }], tanks: ["solid-medium", "solid-medium"] },
      { engines: [{ id: "kestrel-7", count: 3 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 2 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 1 }], tanks: ["kerolox-small"] },
    ],
  },

  // TIER 2: Working Orbits

  // Higher Ground — 800km orbit, needs big rocket
  "2-1": {
    stages: [
      { engines: [{ id: "spartan-1", count: 8 }], tanks: ["solid-large", "solid-large"] },
      { engines: [{ id: "kestrel-7", count: 5 }], tanks: ["kerolox-large"] },
      { engines: [{ id: "kestrel-7", count: 2 }], tanks: ["kerolox-medium"] },
    ],
  },

  // GTO Transfer — 5 light stages, TWR > 1 on all
  "2-2": {
    stages: [
      { engines: [{ id: "spartan-1", count: 6 }], tanks: ["solid-medium", "solid-medium"] },
      { engines: [{ id: "kestrel-7", count: 4 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 2 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 1 }], tanks: ["kerolox-small"] },
      { engines: [{ id: "kestrel-7", count: 1 }], tanks: ["kerolox-small"] },
    ],
  },

  // ComSat Deploy — same approach as GTO, reach GEO altitude
  "2-3": {
    stages: [
      { engines: [{ id: "spartan-1", count: 6 }], tanks: ["solid-medium", "solid-medium"] },
      { engines: [{ id: "kestrel-7", count: 4 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 2 }], tanks: ["kerolox-medium"] },
      { engines: [{ id: "kestrel-7", count: 1 }], tanks: ["kerolox-small"] },
      { engines: [{ id: "kestrel-7", count: 1 }], tanks: ["kerolox-small"] },
    ],
  },

  // TIER 3: Deep Space

  // Lunar Flyby — TLI burn from LEO
  "3-1": {
    stages: [
      { engines: [{ id: "raptor-x", count: 3 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "raptor-x", count: 2 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "raptor-x", count: 1 }], tanks: ["methalox-small"] },
    ],
  },

  // Lunar Orbit — TLI + LOI
  "3-2": {
    stages: [
      { engines: [{ id: "raptor-x", count: 4 }], tanks: ["methalox-medium", "methalox-medium"] },
      { engines: [{ id: "raptor-x", count: 2 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "raptor-x", count: 1 }], tanks: ["methalox-small"] },
      { engines: [{ id: "titan-rl2", count: 1 }], tanks: ["hydrolox-small"] },
    ],
  },

  // Lunar Lander — TLI + LOI + landing
  "3-3": {
    stages: [
      { engines: [{ id: "raptor-x", count: 5 }], tanks: ["methalox-medium", "methalox-medium"] },
      { engines: [{ id: "raptor-x", count: 2 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "raptor-x", count: 1 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "titan-rl2", count: 1 }], tanks: ["hydrolox-medium"] },
    ],
  },

  // TIER 4: Interplanetary

  // Mars Window — TMI burn from LEO
  "4-1": {
    stages: [
      { engines: [{ id: "raptor-x2", count: 5 }], tanks: ["methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 3 }], tanks: ["methalox-medium", "methalox-medium"] },
      { engines: [{ id: "raptor-x2", count: 1 }], tanks: ["methalox-medium"] },
    ],
  },

  // Mars Orbit — TMI + MOI
  "4-2": {
    stages: [
      { engines: [{ id: "raptor-x2", count: 6 }], tanks: ["methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 3 }], tanks: ["methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 1 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "raptor-x2", count: 1 }], tanks: ["methalox-small"] },
    ],
  },

  // Red Landing — TMI + MOI + landing with 500kg payload
  "4-3": {
    stages: [
      { engines: [{ id: "raptor-x2", count: 7 }], tanks: ["methalox-large", "methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 4 }], tanks: ["methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 2 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "raptor-x2", count: 1 }], tanks: ["methalox-medium"] },
    ],
  },

  // TIER 5: Grand Tour

  // Jupiter Flyby
  "5-1": {
    stages: [
      { engines: [{ id: "nova-cluster", count: 2 }], tanks: ["methalox-large", "methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 4 }], tanks: ["methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 2 }], tanks: ["methalox-medium"] },
      { engines: [{ id: "prometheus", count: 1 }], tanks: ["hydrolox-large"] },
    ],
  },

  // Saturn Rings
  "5-2": {
    stages: [
      { engines: [{ id: "nova-cluster", count: 3 }], tanks: ["methalox-large", "methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 5 }], tanks: ["methalox-large", "methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 2 }], tanks: ["methalox-medium", "methalox-medium"] },
      { engines: [{ id: "prometheus", count: 2 }], tanks: ["hydrolox-large"] },
    ],
  },

  // Voyager — Solar escape
  "5-3": {
    stages: [
      { engines: [{ id: "nova-cluster", count: 3 }], tanks: ["methalox-large", "methalox-large", "methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 5 }], tanks: ["methalox-large", "methalox-large"] },
      { engines: [{ id: "raptor-x2", count: 2 }], tanks: ["methalox-large"] },
      { engines: [{ id: "prometheus", count: 2 }], tanks: ["hydrolox-large"] },
    ],
  },
};

/**
 * Build a pre-designed rocket for the given mission.
 * Clears existing stages and replaces with the preset configuration.
 */
export function buildPresetRocket(mission: Mission): boolean {
  const preset = PRESETS[mission.id];
  if (!preset) return false;

  const store = useBuilderStore.getState();

  // Reset to clean state for this mission
  store.setMission(mission.id, {
    name: mission.codename,
    mass: mission.requirements.minPayloadMass ?? 0,
  });

  // Build each stage (bottom-up: index 0 = booster)
  for (const stagePreset of preset.stages) {
    store.addStage();
    const stageIndex = useBuilderStore.getState().stages.length - 1;

    // Add engines
    for (const engine of stagePreset.engines) {
      store.setEngine(stageIndex, engine.id, engine.count);
    }

    // Add fuel tanks
    for (const tankId of stagePreset.tanks) {
      const tank = getFuelTankById(tankId);
      if (tank) {
        store.addFuelTank(stageIndex, tank);
      }
    }
  }

  return true;
}
