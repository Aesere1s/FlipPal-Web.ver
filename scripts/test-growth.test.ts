import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ABILITIES,
  ANNOTATE_GROWTH,
  MAX_RELATION_LEVEL,
  RELATION_THRESHOLDS,
  abilitiesUnlockedBy,
  eventIdFor,
  fingerprintOf,
  growthForEvent,
  relationLevelForExp,
  relationProgress,
  understandingCoefficient,
  type GrowthEvent,
} from '../src/lib/growth.ts';

const learn = (difficulty: number, mastery: 1 | 2 | 3): GrowthEvent => ({
  kind: 'learn',
  cardId: 'sunk-cost',
  difficulty,
  mastery,
});

const remake = (difficulty: number, fingerprint = 'abcd1234'): GrowthEvent => ({
  kind: 'remake',
  cardRef: 'sunk-cost',
  difficulty,
  fingerprint,
});

const annotate = (driftId = 'drift-1'): GrowthEvent => ({
  kind: 'annotate',
  driftId,
});

const fields = {
  front: '已经付掉的钱，为什么还要绑架接下来的选择？',
  explanation: '票钱回不来了，只比较继续看和离场哪个更舒服。',
  example: '我上周在健身房办了年卡，去了 2 次就不想去了。',
  source: 'Richard Thaler《Misbehaving》第 4 章：沉没成本实验',
};

describe('成长值公式', () => {
  it('理解度系数为 1 / 1.5 / 2', () => {
    assert.equal(understandingCoefficient(1), 1);
    assert.equal(understandingCoefficient(2), 1.5);
    assert.equal(understandingCoefficient(3), 2);
  });

  it('三种掌握度按 难度 × 系数 计算并保留 0.5 精度', () => {
    assert.equal(growthForEvent(learn(3, 1)), 3);
    assert.equal(growthForEvent(learn(3, 2)), 4.5);
    assert.equal(growthForEvent(learn(3, 3)), 6);
    assert.equal(growthForEvent(learn(5, 1)), 5);
    assert.equal(growthForEvent(learn(5, 2)), 7.5);
    assert.equal(growthForEvent(learn(5, 3)), 10);
    assert.equal(growthForEvent(learn(1, 1)), 1);
    assert.equal(growthForEvent(learn(1, 2)), 1.5);
    assert.equal(growthForEvent(learn(1, 3)), 2);
  });

  it('掌握度越高成长值严格递增', () => {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      const low = growthForEvent(learn(difficulty, 1));
      const mid = growthForEvent(learn(difficulty, 2));
      const high = growthForEvent(learn(difficulty, 3));
      assert.ok(low < mid, `难度 ${difficulty} 的 m1 应小于 m2`);
      assert.ok(mid < high, `难度 ${difficulty} 的 m2 应小于 m3`);
    }
  });

  it('改卡按已答对档位，批注为固定值', () => {
    assert.equal(growthForEvent(remake(4)), 6);
    assert.equal(growthForEvent(annotate()), ANNOTATE_GROWTH);
  });
});

describe('事件幂等标识', () => {
  it('同一学习事件的 eventId 稳定，掌握度不同则不同', () => {
    assert.equal(eventIdFor(learn(3, 2)), 'learn:sunk-cost:m2');
    assert.equal(eventIdFor(learn(3, 2)), eventIdFor(learn(3, 2)));
    assert.notEqual(eventIdFor(learn(3, 2)), eventIdFor(learn(3, 3)));
  });

  it('内容相同的改写卡 eventId 相同，内容不同则不同', () => {
    assert.equal(eventIdFor(remake(3)), eventIdFor(remake(3)));
    assert.notEqual(eventIdFor(remake(3, 'aaaa1111')), eventIdFor(remake(3, 'bbbb2222')));
  });

  it('同一漂流批次只结算一次', () => {
    assert.equal(eventIdFor(annotate('drift-9')), 'annotate:drift-9');
  });
});

describe('关系等级', () => {
  it('阈值边界落在正确等级', () => {
    assert.equal(relationLevelForExp(0), 1);
    assert.equal(relationLevelForExp(23), 1);
    assert.equal(relationLevelForExp(24), 2);
    assert.equal(relationLevelForExp(71), 2);
    assert.equal(relationLevelForExp(72), 3);
    assert.equal(relationLevelForExp(139), 3);
    assert.equal(relationLevelForExp(140), 4);
    assert.equal(relationLevelForExp(239), 4);
    assert.equal(relationLevelForExp(240), 5);
    assert.equal(relationLevelForExp(99999), MAX_RELATION_LEVEL);
  });

  it('等级永远落在 1..5 区间', () => {
    for (const exp of [-100, 0, 1, 24, 72, 140, 240, 1e6]) {
      const level = relationLevelForExp(exp);
      assert.ok(level >= 1 && level <= MAX_RELATION_LEVEL);
    }
  });

  it('进度片段给出当前区间与比例', () => {
    const start = relationProgress(0);
    assert.equal(start.level, 1);
    assert.equal(start.floor, 0);
    assert.equal(start.next, 24);
    assert.equal(start.ratio, 0);

    const middle = relationProgress(12);
    assert.equal(middle.level, 1);
    assert.equal(middle.ratio, 0.5);

    const top = relationProgress(RELATION_THRESHOLDS[MAX_RELATION_LEVEL - 1]);
    assert.equal(top.level, MAX_RELATION_LEVEL);
    assert.equal(top.next, null);
    assert.equal(top.ratio, 1);
  });
});

describe('能力解锁', () => {
  it('首次改写通过解锁「整理卡片」，之后不再重复', () => {
    const first = abilitiesUnlockedBy(remake(3), []);
    assert.deepEqual(first.map((ability) => ability.id), ['organize-cards']);
    assert.equal(first[0].name, ABILITIES['organize-cards'].name);
    assert.deepEqual(abilitiesUnlockedBy(remake(3), ['organize-cards']), []);
  });

  it('首次收到批注解锁「读批注」，第二次批注解「代写回信」', () => {
    const first = abilitiesUnlockedBy(annotate(), []);
    assert.deepEqual(first.map((ability) => ability.id), ['read-annotation']);

    const second = abilitiesUnlockedBy(annotate('drift-2'), ['read-annotation']);
    assert.deepEqual(second.map((ability) => ability.id), ['draft-reply']);

    const third = abilitiesUnlockedBy(annotate('drift-3'), ['read-annotation', 'draft-reply']);
    assert.deepEqual(third, []);
  });

  it('学卡不解锁能力，能力与关系等级解耦', () => {
    assert.deepEqual(abilitiesUnlockedBy(learn(5, 3), []), []);
  });
});

describe('改写卡内容指纹', () => {
  it('同一内容指纹稳定，忽略多余空白', () => {
    const base = fingerprintOf(fields);
    assert.equal(base, fingerprintOf({ ...fields }));
    assert.equal(
      base,
      fingerprintOf({
        ...fields,
        explanation: `  ${fields.explanation.replace('。', '。 ')} `,
      }),
    );
  });

  it('任一槽位内容变化都会产生新指纹', () => {
    const base = fingerprintOf(fields);
    assert.notEqual(base, fingerprintOf({ ...fields, example: `${fields.example} 那次我直接离场。` }));
    assert.notEqual(base, fingerprintOf({ ...fields, source: `${fields.source}（重读）` }));
  });
});