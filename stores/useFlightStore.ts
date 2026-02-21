import { create } from "zustand";
import type { FlightSnapshot, FlightResult, OrbitalElements } from "@/types/physics";
import type { FlightEvent } from "@/engine/simulation/FlightSimulator";

interface FlightState {
  isActive: boolean;
  isPaused: boolean;
  timeScale: number;
  currentSnapshot: FlightSnapshot | null;
  currentOrbit: OrbitalElements | null;
  events: FlightEvent[];
  result: FlightResult | null;

  // Actions
  startFlight: () => void;
  updateSnapshot: (snapshot: FlightSnapshot) => void;
  updateOrbit: (orbit: OrbitalElements | null) => void;
  addEvent: (event: FlightEvent) => void;
  setEvents: (events: FlightEvent[]) => void;
  setTimeScale: (scale: number) => void;
  pause: () => void;
  resume: () => void;
  endFlight: (result: FlightResult) => void;
  reset: () => void;
}

export const useFlightStore = create<FlightState>((set) => ({
  isActive: false,
  isPaused: false,
  timeScale: 1,
  currentSnapshot: null,
  currentOrbit: null,
  events: [],
  result: null,

  startFlight: () => {
    set({
      isActive: true,
      isPaused: false,
      timeScale: 1,
      currentSnapshot: null,
      currentOrbit: null,
      events: [],
      result: null,
    });
  },

  updateSnapshot: (snapshot: FlightSnapshot) => {
    set({ currentSnapshot: snapshot });
  },

  updateOrbit: (orbit: OrbitalElements | null) => {
    set({ currentOrbit: orbit });
  },

  addEvent: (event: FlightEvent) => {
    set((state) => ({ events: [...state.events, event] }));
  },

  setEvents: (events: FlightEvent[]) => {
    set({ events });
  },

  setTimeScale: (scale: number) => {
    set({ timeScale: Math.max(1, Math.min(100, scale)) });
  },

  pause: () => set({ isPaused: true }),
  resume: () => set({ isPaused: false }),

  endFlight: (result: FlightResult) => {
    set({ isActive: false, result });
  },

  reset: () => {
    set({
      isActive: false,
      isPaused: false,
      timeScale: 1,
      currentSnapshot: null,
      currentOrbit: null,
      events: [],
      result: null,
    });
  },
}));
