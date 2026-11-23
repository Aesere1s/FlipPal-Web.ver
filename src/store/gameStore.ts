import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

export const SCHEMA_VERSION = 1;
export const PERSIST_KEY = 'flip-pal-demo-v1';

export type Mastery = 0 | 1 | 2 | 3;

export interface OCState {
  personality: 'calm' | 'curious' | 'sharp';
  parts: {
    face: number;
    hair: number;
    color: number;
    outfit: number;
  };
  relationLevel: number;
  relationExp: number;
  abilities: string[];
}

export interface GameState {
  schemaVersion: number;
  nickname: string;
  trackPref: string;
  tickets: number;
  streak: number;
  mastery: Record<string, Mastery>;
  learnedToday: string[];
  remakes: unknown[];
  sent: unknown[];
  inbox: unknown[];
  lastDrawDate: string;
  oc: OCState | null;
  resetDemo: () => void;
}

export function createInitialGameState(): Omit<GameState, 'resetDemo'> {
  return {
    schemaVersion: SCHEMA_VERSION,
    nickname: '',
    trackPref: '',
    tickets: 3,
    streak: 0,
    mastery: {},
    learnedToday: [],
    remakes: [],
    sent: [],
    inbox: [],
    lastDrawDate: '',
    oc: null,
  };
}

const memoryStore = new Map<string, string>();

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memoryStore.delete(key);
  }
}

const versionedStorage: PersistStorage<GameState> = {
  getItem: (name) => {
    const raw = readStorage(name);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as StorageValue<GameState>;
      if (parsed.version !== SCHEMA_VERSION || parsed.state?.schemaVersion !== SCHEMA_VERSION) {
        removeStorage(name);
        return null;
      }
      return parsed;
    } catch {
      removeStorage(name);
      return null;
    }
  },
  setItem: (name, value) => {
    writeStorage(name, JSON.stringify(value));
  },
  removeItem: (name) => {
    removeStorage(name);
  },
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...createInitialGameState(),
      resetDemo: () => set({ ...createInitialGameState() }),
    }),
    {
      name: PERSIST_KEY,
      version: SCHEMA_VERSION,
      storage: versionedStorage,
    },
  ),
);