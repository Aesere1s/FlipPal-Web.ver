import type { OCPersonality, RemakeFields } from '../types';

export type AbilityId = 'organize-cards' | 'read-annotation' | 'draft-reply';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  note: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  'organize-cards': {
    id: 'organize-cards',
    name: '整理卡片',
    note: '把学过的卡按主题重新排一遍，让相似的问题自己靠拢。',
  },
  'read-annotation': {
    id: 'read-annotation',
    name: '读批注',
    note: '看懂别人逐句留下的意见，不再只看到一句总评。',
  },
  'draft-reply': {
    id: 'draft-reply',
    name: '代写回信',
    note: '把你的回应整理成一句话，回给那位读者。',
  },
};

export type GrowthEventKind = 'learn' | 'remake' | 'annotate';

export interface LearnGrowthEvent {
  kind: 'learn';
  cardId: string;
  difficulty: number;
  mastery: 1 | 2 | 3;
}

export interface RemakeGrowthEvent {
  kind: 'remake';
  cardRef: string;
  difficulty: number;
  fingerprint: string;
}

export interface AnnotateGrowthEvent {
  kind: 'annotate';
  driftId: string;
}

export type GrowthEvent = LearnGrowthEvent | RemakeGrowthEvent | AnnotateGrowthEvent;

export interface GrowthSettlement {
  eventId: string;
  kind: GrowthEventKind;
  gained: number;
  previousExp: number;
  totalExp: number;
  previousLevel: number;
  level: number;
  levelUp: boolean;
  unlocks: AbilityDef[];
  personality: OCPersonality;
}

/** 关系等级阈值：基础值、熟悉、信任、默契、同伴。 */
export const RELATION_THRESHOLDS = [0, 24, 72, 140, 240] as const;

export const MAX_RELATION_LEVEL = RELATION_THRESHOLDS.length;

export const ANNOTATE_GROWTH = 8;

export const UNDERSTANDING_COEFFICIENT: Record<1 | 2 | 3, number> = {
  1: 1,
  2: 1.5,
  3: 2,
};

export function understandingCoefficient(mastery: 1 | 2 | 3): number {
  return UNDERSTANDING_COEFFICIENT[mastery];
}

/** 成长值 = 难度 × 理解度系数；改写通过按「已答对」档位计算。保留 0.5 精度，避免低难度卡的分档被取整抹平。 */
function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function growthForEvent(event: GrowthEvent): number {
  if (event.kind === 'learn') {
    return roundToHalf(event.difficulty * understandingCoefficient(event.mastery));
  }
  if (event.kind === 'remake') {
    return roundToHalf(event.difficulty * UNDERSTANDING_COEFFICIENT[2]);
  }
  return ANNOTATE_GROWTH;
}

/** 每次行为生成稳定 eventId，同 id 只结算一次。 */
export function eventIdFor(event: GrowthEvent): string {
  if (event.kind === 'learn') {
    return `learn:${event.cardId}:m${event.mastery}`;
  }
  if (event.kind === 'remake') {
    return `remake:${event.cardRef}:${event.fingerprint}`;
  }
  return `annotate:${event.driftId}`;
}

export function relationLevelForExp(totalExp: number): number {
  let level = 1;
  RELATION_THRESHOLDS.forEach((threshold, index) => {
    if (totalExp >= threshold) {
      level = index + 1;
    }
  });
  return level;
}

export function relationProgress(totalExp: number): {
  level: number;
  floor: number;
  next: number | null;
  ratio: number;
} {
  const level = relationLevelForExp(totalExp);
  const floor = RELATION_THRESHOLDS[level - 1];
  const next = level >= MAX_RELATION_LEVEL ? null : RELATION_THRESHOLDS[level];
  const ratio = next === null ? 1 : Math.min(1, Math.max(0, (totalExp - floor) / (next - floor)));
  return { level, floor, next, ratio };
}

/** 能力与等级解耦：由具体行为首次触发，已拥有的不再返回。 */
export function abilitiesUnlockedBy(event: GrowthEvent, owned: readonly string[]): AbilityDef[] {
  if (event.kind === 'remake' && !owned.includes('organize-cards')) {
    return [ABILITIES['organize-cards']];
  }
  if (event.kind === 'annotate') {
    if (!owned.includes('read-annotation')) {
      return [ABILITIES['read-annotation']];
    }
    if (!owned.includes('draft-reply')) {
      return [ABILITIES['draft-reply']];
    }
  }
  return [];
}

/** 改写卡内容指纹：同一份内容重复提交不重复计入成长。 */
export function fingerprintOf(fields: RemakeFields): string {
  const source = [fields.front, fields.explanation, fields.example, fields.source]
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .join('|');
  let hash = 0x811c9dc5;
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}