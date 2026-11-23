import type { Mastery } from '../types';

export function countTodayLearned(
  cardIds: readonly string[] | null | undefined,
  mastery: Readonly<Record<string, Mastery>>,
): number {
  if (!cardIds || cardIds.length === 0) {
    return 0;
  }

  let count = 0;
  for (const id of cardIds) {
    if ((mastery[id] ?? 0) >= 1) {
      count += 1;
    }
  }
  return count;
}