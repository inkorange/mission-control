import type { RocketConfig } from "@/types/rocket";
import type { MissionResult } from "@/types/mission";

const STORAGE_PREFIX = "mission-control";
const KEYS = {
  save: `${STORAGE_PREFIX}:save`,
  settings: `${STORAGE_PREFIX}:settings`,
  rockets: `${STORAGE_PREFIX}:rockets`,
} as const;

export interface SaveData {
  version: 1;
  progression: {
    unlockedTiers: number[];
    missionResults: Record<string, MissionResult>;
  };
}

export interface SettingsData {
  units: "metric" | "imperial";
  cameraMode: "follow" | "orbital" | "ground";
  audioEnabled: boolean;
}

export interface SavedRockets {
  [name: string]: RocketConfig;
}

// ===== Persistence Provider Interface =====
// Swap LocalStorageProvider for SupabaseProvider later without changing consumers.

export interface PersistenceProvider {
  saveProgress(data: SaveData): Promise<void>;
  loadProgress(): Promise<SaveData | null>;
  saveSettings(data: SettingsData): Promise<void>;
  loadSettings(): Promise<SettingsData | null>;
  saveRocket(name: string, config: RocketConfig): Promise<void>;
  loadRockets(): Promise<SavedRockets>;
  deleteRocket(name: string): Promise<void>;
}

// ===== localStorage Implementation =====

class LocalStorageProvider implements PersistenceProvider {
  private isAvailable(): boolean {
    try {
      const test = "__storage_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private getItem<T>(key: string): T | null {
    if (!this.isAvailable()) return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private setItem(key: string, value: unknown): void {
    if (!this.isAvailable()) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable — silently fail
    }
  }

  async saveProgress(data: SaveData): Promise<void> {
    this.setItem(KEYS.save, data);
  }

  async loadProgress(): Promise<SaveData | null> {
    return this.getItem<SaveData>(KEYS.save);
  }

  async saveSettings(data: SettingsData): Promise<void> {
    this.setItem(KEYS.settings, data);
  }

  async loadSettings(): Promise<SettingsData | null> {
    return this.getItem<SettingsData>(KEYS.settings);
  }

  async saveRocket(name: string, config: RocketConfig): Promise<void> {
    const rockets = await this.loadRockets();
    rockets[name] = config;
    this.setItem(KEYS.rockets, rockets);
  }

  async loadRockets(): Promise<SavedRockets> {
    return this.getItem<SavedRockets>(KEYS.rockets) ?? {};
  }

  async deleteRocket(name: string): Promise<void> {
    const rockets = await this.loadRockets();
    delete rockets[name];
    this.setItem(KEYS.rockets, rockets);
  }
}

// ===== Default Export =====
// Change this to SupabaseProvider in Phase 6.

export const persistence: PersistenceProvider = new LocalStorageProvider();

export const DEFAULT_SETTINGS: SettingsData = {
  units: "metric",
  cameraMode: "follow",
  audioEnabled: true,
};

export function createEmptySaveData(): SaveData {
  return {
    version: 1,
    progression: {
      unlockedTiers: [1],
      missionResults: {},
    },
  };
}
