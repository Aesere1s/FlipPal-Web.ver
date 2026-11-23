import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DRAW_COUNT,
  NO_NEW_CARD_LIMIT,
  hashSeed,
  isNewCard,
  pickDailyCards,
  pickRedrawCards,
  todayKey,
} from '../src/lib/draw.ts';
import type { DrawContext } from '../src/lib/draw.ts';
import type { Card, Mastery } from '../src/types/index.ts';

function cardsOf(ids: readonly string[]): Pick<Card, 'id'>[] {
  return ids.map((id) => ({ id }));
}

function makeContext(overrides: Partial<DrawContext> = {}): DrawContext {
  const base: DrawContext = {
    cards: cardsOf(['c01', 'c02', 'c03', 'c04', 'c05', 'c06']),
    date: '2026-11-23',
    nickname: 'Alice',
    mastery: {},
    newCardStreak: 0,
  };
  return { ...base, ...overrides };
}

describe('pickDailyCards 确定性', () => {
  it('同日同昵称的结果一致，且与卡池输入顺序无关', () => {
    const ctx = makeContext();
    const expected = pickDailyCards(ctx);
    assert.deepEqual(pickDailyCards(ctx), expected);
    assert.deepEqual(
      pickDailyCards({ ...ctx, cards: [...ctx.cards].reverse() }),
      expected,
    );
  });

  it('三张卡的 id 互不重复且均来自卡池', () => {
    const ctx = makeContext();
    const ids = pickDailyCards(ctx);
    assert.equal(ids.length, DRAW_COUNT);
    assert.equal(new Set(ids).size, DRAW_COUNT);
    const pool = new Set(ctx.cards.map((card) => card.id));
    ids.forEach((id) => assert.ok(pool.has(id), `${id} 不在卡池内`));
  });

  it('newCardStreak 达到保底阈值时第 3 张必为未学卡', () => {
    const mastery: Record<string, Mastery> = { l1: 3, l2: 3, l3: 3 };
    const ctx = makeContext({
      cards: cardsOf(['n1', 'n2', 'n3', 'l1', 'l2', 'l3']),
      mastery,
      newCardStreak: NO_NEW_CARD_LIMIT,
    });
    const ids = pickDailyCards(ctx);
    assert.equal(ids.length, DRAW_COUNT);
    assert.equal(isNewCard(ids[2], mastery), true);
  });

  it('无未学卡时保底退回常规抽取', () => {
    const mastery: Record<string, Mastery> = {
      c01: 3,
      c02: 3,
      c03: 3,
      c04: 3,
      c05: 3,
      c06: 3,
    };
    const ctx = makeContext({ mastery, newCardStreak: NO_NEW_CARD_LIMIT });
    const ids = pickDailyCards(ctx);
    assert.equal(ids.length, DRAW_COUNT);
    assert.equal(new Set(ids).size, DRAW_COUNT);
    ids.forEach((id) => assert.equal(isNewCard(id, mastery), false));
  });

  it('空卡池返回空数组', () => {
    assert.deepEqual(pickDailyCards(makeContext({ cards: [] })), []);
  });
});

describe('pickRedrawCards', () => {
  it('不会返回 exclude 中的 id，且结果互不重复', () => {
    const ctx = makeContext();
    const exclude = ['c01', 'c02'];
    const ids = pickRedrawCards(ctx, { exclude, count: DRAW_COUNT });
    assert.equal(ids.length, DRAW_COUNT);
    assert.equal(new Set(ids).size, DRAW_COUNT);
    ids.forEach((id) =>
      assert.equal(exclude.includes(id), false, `${id} 不应出现在重抽结果中`),
    );
  });

  it('可用池不足时返回全部可用 id', () => {
    const ctx = makeContext({ cards: cardsOf(['c01', 'c02', 'c03', 'c04', 'c05']) });
    const ids = pickRedrawCards(ctx, {
      exclude: ['c01', 'c02', 'c03'],
      count: DRAW_COUNT,
    });
    assert.deepEqual([...ids].sort(), ['c04', 'c05']);
  });

  it('空卡池返回空数组', () => {
    const ctx = makeContext({ cards: [] });
    assert.deepEqual(pickRedrawCards(ctx, { exclude: [], count: DRAW_COUNT }), []);
  });
});

describe('isNewCard', () => {
  it('掌握度缺失或为 0 视为未学', () => {
    const mastery: Record<string, Mastery> = { zero: 0, known: 1, mastered: 3 };
    assert.equal(isNewCard('missing', mastery), true);
    assert.equal(isNewCard('zero', mastery), true);
    assert.equal(isNewCard('known', mastery), false);
    assert.equal(isNewCard('mastered', mastery), false);
  });
});

describe('todayKey', () => {
  it('按本地时区输出 YYYY-MM-DD', () => {
    assert.equal(todayKey(new Date(2026, 0, 5, 12, 30)), '2026-01-05');
    assert.equal(todayKey(new Date(2026, 10, 23, 23, 59)), '2026-11-23');
    assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('hashSeed', () => {
  it('对相同输入返回一致的 32 位无符号整数', () => {
    const seed = hashSeed('2026-11-23|Alice');
    assert.equal(hashSeed('2026-11-23|Alice'), seed);
    assert.ok(Number.isInteger(seed));
    assert.ok(seed >= 0 && seed <= 0xffffffff);
    assert.notEqual(hashSeed('2026-11-23|Bob'), seed);
  });
});