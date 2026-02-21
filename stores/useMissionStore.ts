import { create } from "zustand";
import type { Mission } from "@/types/mission";
import { getMissionById } from "@/engine/data/missions";

interface MissionState {
  currentMission: Mission | null;
  selectMission: (missionId: string) => void;
  clearMission: () => void;
}

export const useMissionStore = create<MissionState>((set) => ({
  currentMission: null,

  selectMission: (missionId: string) => {
    const mission = getMissionById(missionId);
    set({ currentMission: mission ?? null });
  },

  clearMission: () => {
    set({ currentMission: null });
  },
}));
