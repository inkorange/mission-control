import { create } from "zustand";
import type { MissionResult, MissionTier } from "@/types/mission";
import { persistence, createEmptySaveData } from "@/lib/persistence";
import { getStarsRequiredForTier } from "@/engine/data/missions";

interface ProgressionState {
  unlockedTiers: number[];
  missionResults: Record<string, MissionResult>;
  totalStars: number;
  isLoaded: boolean;

  // Actions
  loadProgress: () => Promise<void>;
  completeMission: (result: MissionResult) => Promise<void>;
  isMissionUnlocked: (missionId: string) => boolean;
  getTierStars: (tier: number) => number;
  isTierUnlocked: (tier: MissionTier) => boolean;
  resetProgress: () => Promise<void>;
}

export const useProgressionStore = create<ProgressionState>((set, get) => ({
  unlockedTiers: [1],
  missionResults: {},
  totalStars: 0,
  isLoaded: false,

  loadProgress: async () => {
    const save = await persistence.loadProgress();
    if (save) {
      const totalStars = Object.values(save.progression.missionResults).reduce(
        (sum, r) => sum + r.stars,
        0
      );
      set({
        unlockedTiers: save.progression.unlockedTiers,
        missionResults: save.progression.missionResults,
        totalStars,
        isLoaded: true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  completeMission: async (result: MissionResult) => {
    const { missionResults, unlockedTiers } = get();

    // Only update if this is a better score
    const existing = missionResults[result.missionId];
    if (existing && existing.bestScore >= result.bestScore) {
      return;
    }

    const updatedResults = {
      ...missionResults,
      [result.missionId]: result,
    };

    // Recalculate total stars
    const totalStars = Object.values(updatedResults).reduce(
      (sum, r) => sum + r.stars,
      0
    );

    // Check for new tier unlocks
    const newUnlockedTiers = [...unlockedTiers];
    for (let tier = 2; tier <= 5; tier++) {
      if (!newUnlockedTiers.includes(tier)) {
        const prevTier = tier - 1;
        const prevTierStars = Object.entries(updatedResults)
          .filter(([id]) => id.startsWith(`${prevTier}-`))
          .reduce((sum, [, r]) => sum + r.stars, 0);

        if (prevTierStars >= getStarsRequiredForTier(tier as MissionTier)) {
          newUnlockedTiers.push(tier);
        }
      }
    }

    set({
      missionResults: updatedResults,
      unlockedTiers: newUnlockedTiers,
      totalStars,
    });

    // Persist
    await persistence.saveProgress({
      version: 1,
      progression: {
        unlockedTiers: newUnlockedTiers,
        missionResults: updatedResults,
      },
    });
  },

  isMissionUnlocked: (missionId: string) => {
    const tier = parseInt(missionId.split("-")[0], 10);
    return get().unlockedTiers.includes(tier);
  },

  getTierStars: (tier: number) => {
    const { missionResults } = get();
    return Object.entries(missionResults)
      .filter(([id]) => id.startsWith(`${tier}-`))
      .reduce((sum, [, r]) => sum + r.stars, 0);
  },

  isTierUnlocked: (tier: MissionTier) => {
    return get().unlockedTiers.includes(tier);
  },

  resetProgress: async () => {
    const empty = createEmptySaveData();
    set({
      unlockedTiers: empty.progression.unlockedTiers,
      missionResults: empty.progression.missionResults,
      totalStars: 0,
    });
    await persistence.saveProgress(empty);
  },
}));
