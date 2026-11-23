import type { Card, Mastery } from '../types';

export const DRAW_COUNT = 3;
export const NO_NEW_CARD_LIMIT = 3;

/** 本地时区 'YYYY-MM-DD' */
export function todayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 32 位 FNV-1a 字符串哈希，导出以便单测构造相同输入 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DrawContext {
  cards: readonly Pick<Card, 'id'>[];
  date: string;
  nickname: string;
  mastery: Readonly<Record<string, Mastery>>;
  newCardStreak: number;
}

/** 新卡判定：掌握度缺失或为 0 */
export function isNewCard(id: string, mastery: Readonly<Record<string, Mastery>>): boolean {
  const level = mastery[id];
  return level === undefined || level === 0;
}

function weightOf(id: string, mastery: Readonly<Record<string, Mastery>>): number {
  const level = mastery[id];
  if (level === undefined || level === 0) {
    return 3;
  }
  if (level === 1 || level === 2) {
    return 1;
  }
  return 0.2;
}

function sortedIds(cards: readonly Pick<Card, 'id'>[]): string[] {
  return [...cards]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((card) => card.id);
}

function pickWeightedOne(
  pool: readonly string[],
  mastery: Readonly<Record<string, Mastery>>,
  prng: () => number,
): string {
  const total = pool.reduce((sum, id) => sum + weightOf(id, mastery), 0);
  let threshold = prng() * total;
  for (const id of pool) {
    threshold -= weightOf(id, mastery);
    if (threshold < 0) {
      return id;
    }
  }
  return pool[pool.length - 1];
}

function pickWeightedMany(
  pool: readonly string[],
  count: number,
  mastery: Readonly<Record<string, Mastery>>,
  prng: () => number,
): string[] {
  const remaining = [...pool];
  const picked: string[] = [];
  const target = Math.min(count, remaining.length);

  while (picked.length < target) {
    const chosen = pickWeightedOne(remaining, mastery, prng);
    picked.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  return picked;
}

/** 返回当日 3 张卡的 id（顺序即抽取顺序）；池不足时返回实际可用 id */
export function pickDailyCards(ctx: DrawContext): string[] {
  const remaining = sortedIds(ctx.cards);
  if (remaining.length === 0) {
    return [];
  }

  const prng = mulberry32(hashSeed(`${ctx.date}|${ctx.nickname || 'guest'}`));
  const picked: string[] = [];
  const target = Math.min(DRAW_COUNT, remaining.length);

  while (picked.length < target) {
    // 第 3 次抽取时触发保底：只从未学卡中抽，无未学卡则退回常规加权。
    const guarantee = ctx.newCardStreak >= NO_NEW_CARD_LIMIT && picked.length === DRAW_COUNT - 1;
    const newCardPool = guarantee ? remaining.filter((id) => isNewCard(id, ctx.mastery)) : [];
    const chosen = pickWeightedOne(
      newCardPool.length > 0 ? newCardPool : remaining,
      ctx.mastery,
      prng,
    );
    picked.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  return picked;
}

/** 重抽：返回 count 个新 id，绝不含 exclude 中的 id */
export function pickRedrawCards(
  ctx: DrawContext,
  options: { exclude: readonly string[]; count: number },
): string[] {
  const count = Number.isFinite(options.count) ? Math.max(0, Math.floor(options.count)) : 0;
  if (count === 0) {
    return [];
  }

  const available = sortedIds(ctx.cards).filter((id) => !options.exclude.includes(id));
  const prng = mulberry32(hashSeed(`${ctx.date}|${ctx.nickname || 'guest'}|redraw`));
  return pickWeightedMany(available, count, ctx.mastery, prng);
}