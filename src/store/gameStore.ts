import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import cardsFile from '../data/cards.json';
import type { Card, DriftItem, Mastery, OCParts, OCPersonality, OCState, Remake, RemakeFields, Track } from '../types';
import { isNewCard, pickDailyCards, pickRedrawCards, todayKey } from '../lib/draw';
import {
  abilitiesUnlockedBy,
  eventIdFor,
  growthForEvent,
  relationLevelForExp,
  type GrowthEvent,
  type GrowthSettlement,
} from '../lib/growth';

export const SCHEMA_VERSION = 3;
export const PERSIST_KEY = 'flip-pal-demo-v1';

export interface TodayDraw {
  date: string;
  cardIds: string[];
  revealed: string[];
  redrawUsed: boolean;
}

const cardPool = (cardsFile as unknown as { cards: Card[] }).cards;

export interface GameState {
  schemaVersion: number;
  nickname: string;
  trackPref: Track | '';
  tickets: number;
  streak: number;
  mastery: Record<string, Mastery>;
  learnedToday: string[];
  remakes: Remake[];
  sent: DriftItem[];
  inbox: DriftItem[];
  lastDrawDate: string;
  oc: OCState | null;
  growthEvents: string[];
  todayDraw: TodayDraw | null;
  newCardStreak: number;
  ensureDailyDraw: () => void;
  refreshDailyDraw: () => void;
  revealTodayCard: (cardId: string) => void;
  useRedraw: () => void;
  recordCardSeen: (cardId: string) => void;
  recordQuizResult: (cardId: string, correct: boolean) => void;
  saveOC: (personality: OCPersonality, parts: OCParts) => void;
  saveRemakeDraft: (cardRef: string, fields: RemakeFields) => void;
  submitRemake: (cardRef: string, fields: RemakeFields) => void;
  settleGrowth: (event: GrowthEvent) => GrowthSettlement | null;
  resetDemo: () => void;
}

type GameStateData = Omit<
  GameState,
  | 'ensureDailyDraw'
  | 'refreshDailyDraw'
  | 'revealTodayCard'
  | 'useRedraw'
  | 'recordCardSeen'
  | 'recordQuizResult'
  | 'saveOC'
  | 'saveRemakeDraft'
  | 'submitRemake'
  | 'settleGrowth'
  | 'resetDemo'
>;

export function createInitialGameState(): GameStateData {
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
    growthEvents: [],
    todayDraw: null,
    newCardStreak: 0,
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

/** v2 → v3：补成长字段，保留 OC、改写卡与抽卡进度，而不是直接清空存档。 */
function migratePersisted(parsed: StorageValue<GameState>): StorageValue<GameState> | null {
  const legacy = parsed.state as (Partial<GameState> & { schemaVersion?: number }) | undefined;
  const version = legacy?.schemaVersion ?? parsed.version;

  if (version === SCHEMA_VERSION) {
    return parsed;
  }

  if (version === 2 && legacy) {
    return {
      version: SCHEMA_VERSION,
      state: {
        ...createInitialGameState(),
        ...legacy,
        schemaVersion: SCHEMA_VERSION,
        growthEvents: legacy.growthEvents ?? [],
        oc: legacy.oc
          ? {
              ...legacy.oc,
              relationLevel: legacy.oc.relationLevel ?? 1,
              relationExp: legacy.oc.relationExp ?? 0,
              abilities: legacy.oc.abilities ?? [],
            }
          : null,
      } as GameState,
    };
  }

  return null;
}

const versionedStorage: PersistStorage<GameState> = {
  getItem: (name) => {
    const raw = readStorage(name);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as StorageValue<GameState>;
      const migrated = migratePersisted(parsed);
      if (!migrated) {
        removeStorage(name);
        return null;
      }
      if (migrated !== parsed) {
        writeStorage(name, JSON.stringify(migrated));
      }
      return migrated;
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
    (set, get) => ({
      ...createInitialGameState(),
      // 生成今日抽卡。跨天后首次调用时同时清空「今日已学」，避免昨天的学习记录残留。
      ensureDailyDraw: () => {
        const { todayDraw, mastery, newCardStreak, nickname } = get();
        const today = todayKey();
        if (todayDraw?.date === today) {
          return;
        }

        const cardIds = pickDailyCards({
          cards: cardPool,
          date: today,
          nickname,
          mastery,
          newCardStreak,
        });
        const hasNewCard = cardIds.some((id) => isNewCard(id, mastery));
        set({
          todayDraw: { date: today, cardIds, revealed: [], redrawUsed: false },
          lastDrawDate: today,
          newCardStreak: hasNewCard ? 0 : newCardStreak + 1,
          learnedToday: [],
        });
      },
      // 只刷新已过期的一天，不替「重置演示」后的空状态生成新卡。
      refreshDailyDraw: () => {
        const { todayDraw } = get();
        if (!todayDraw || todayDraw.date === todayKey()) {
          return;
        }
        get().ensureDailyDraw();
      },
      revealTodayCard: (cardId) => {
        const { todayDraw } = get();
        if (
          !todayDraw ||
          !todayDraw.cardIds.includes(cardId) ||
          todayDraw.revealed.includes(cardId)
        ) {
          return;
        }
        set({ todayDraw: { ...todayDraw, revealed: [...todayDraw.revealed, cardId] } });
      },
      useRedraw: () => {
        const { todayDraw, mastery, nickname } = get();
        if (!todayDraw || todayDraw.redrawUsed) {
          return;
        }

        const pendingIndexes: number[] = [];
        todayDraw.cardIds.forEach((id, index) => {
          if (!todayDraw.revealed.includes(id)) {
            pendingIndexes.push(index);
          }
        });

        const replacements = pickRedrawCards(
          {
            cards: cardPool,
            date: todayDraw.date,
            nickname,
            mastery,
            newCardStreak: get().newCardStreak,
          },
          { exclude: todayDraw.cardIds, count: pendingIndexes.length },
        );

        // 可用卡不足时宁可不消耗重抽次数，也不要出现「点了没变化却永久置灰」。
        if (replacements.length === 0) {
          return;
        }

        const cardIds = [...todayDraw.cardIds];
        pendingIndexes.forEach((cardIndex, position) => {
          const replacement = replacements[position];
          if (replacement !== undefined) {
            cardIds[cardIndex] = replacement;
          }
        });

        set({ todayDraw: { ...todayDraw, cardIds, redrawUsed: true } });
      },
      recordCardSeen: (cardId) => {
        const { mastery, learnedToday } = get();
        const alreadyLearned = learnedToday.includes(cardId);
        const nextMastery = Math.max(mastery[cardId] ?? 0, 1) as Mastery;
        if (alreadyLearned && mastery[cardId] === nextMastery) {
          return;
        }
        set({
          mastery: { ...mastery, [cardId]: nextMastery },
          learnedToday: alreadyLearned ? learnedToday : [...learnedToday, cardId],
        });
      },
      recordQuizResult: (cardId, correct) => {
        const { mastery } = get();
        const nextMastery = Math.max(mastery[cardId] ?? 0, correct ? 2 : 1) as Mastery;
        if (mastery[cardId] === nextMastery) {
          return;
        }
        set({ mastery: { ...mastery, [cardId]: nextMastery } });
      },
      saveOC: (personality, parts) => {
        const current = get().oc;
        set({
          oc: {
            personality,
            parts: { ...parts },
            relationLevel: current?.relationLevel ?? 1,
            relationExp: current?.relationExp ?? 0,
            abilities: current?.abilities ?? [],
          },
        });
      },
      saveRemakeDraft: (cardRef, fields) => {
        set({ remakes: upsertRemake(get().remakes, cardRef, fields, 'draft') });
      },
      submitRemake: (cardRef, fields) => {
        set({ remakes: upsertRemake(get().remakes, cardRef, fields, 'submitted') });
      },
      // 成长结算：同一 eventId 只加一次经验，已拥有的能力不会重复解锁。
      settleGrowth: (event) => {
        const { oc, growthEvents } = get();
        if (!oc) {
          return null;
        }

        const eventId = eventIdFor(event);
        if (growthEvents.includes(eventId)) {
          return null;
        }

        const previousExp = oc.relationExp;
        const gained = growthForEvent(event);
        const totalExp = previousExp + gained;
        const previousLevel = relationLevelForExp(previousExp);
        const level = relationLevelForExp(totalExp);
        const unlocks = abilitiesUnlockedBy(event, oc.abilities);

        set({
          growthEvents: [...growthEvents, eventId],
          oc: {
            ...oc,
            relationExp: totalExp,
            relationLevel: level,
            abilities: [...oc.abilities, ...unlocks.map((ability) => ability.id)],
          },
        });

        return {
          eventId,
          kind: event.kind,
          gained,
          previousExp,
          totalExp,
          previousLevel,
          level,
          levelUp: level > previousLevel,
          unlocks,
          personality: oc.personality,
        };
      },
      resetDemo: () => set({ ...createInitialGameState() }),
    }),
    {
      name: PERSIST_KEY,
      version: SCHEMA_VERSION,
      storage: versionedStorage,
    },
  ),
);

function upsertRemake(
  remakes: Remake[],
  cardRef: string,
  fields: RemakeFields,
  status: 'draft' | 'submitted',
): Remake[] {
  const existing = remakes.find((remake) => remake.cardRef === cardRef);
  const now = new Date().toISOString();
  const next: Remake = {
    id: existing?.id ?? `remake-${cardRef}`,
    cardRef,
    front: fields.front.trim(),
    explanation: fields.explanation.trim(),
    example: fields.example.trim(),
    source: fields.source.trim(),
    status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return existing
    ? remakes.map((remake) => (remake.cardRef === cardRef ? next : remake))
    : [...remakes, next];
}