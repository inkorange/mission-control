import { create } from "zustand";
import type { FlightSnapshot, FlightResult, OrbitalElements } from "@/types/physics";
import type { FlightEvent } from "@/engine/simulation/FlightSimulator";

// Persists across resets so the user's preferred warp speed carries over between launches
let preferredTimeScale = (() => {
  if (typeof window === "undefined") return 1;
  const saved = localStorage.getItem("preferredTimeScale");
  return saved ? Number(saved) : 1;
})();

interface FlightState {
  isActive: boolean;
  isPaused: boolean;
  isValidating: boolean; // Auto-warp to validate orbital success
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
  startValidating: () => void;
  pause: () => void;
  resume: () => void;
  endFlight: (result: FlightResult) => void;
  reset: () => void;
}

export const useFlightStore = create<FlightState>((set, get) => ({
  isActive: false,
  isPaused: false,
  isValidating: false,
  timeScale: 1,
  currentSnapshot: null,
  currentOrbit: null,
  events: [],
  result: null,

  startFlight: () => {
    set({
      isActive: true,
      isPaused: false,
      timeScale: preferredTimeScale,
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
    const clamped = Math.max(1, Math.min(10000, scale));
    preferredTimeScale = clamped;
    localStorage.setItem("preferredTimeScale", String(clamped));
    set({ timeScale: clamped });
  },

  startValidating: () => {
    set({ isValidating: true, timeScale: 1000 });
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
      isValidating: false,
      timeScale: preferredTimeScale,
      currentSnapshot: null,
      currentOrbit: null,
      events: [],
      result: null,
    });
  },
}));
