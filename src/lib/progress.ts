/**
 * 今日学习进度：按「今日翻过面的卡」计数，上限为今日抽卡张数。
 * 分享链接直接学卡时同样计入，避免掌握度已变化而进度环仍是 0 / 3。
 */
export function countTodayLearned(
  learnedToday: readonly string[] | null | undefined,
  total: number,
): number {
  if (!learnedToday || learnedToday.length === 0) {
    return 0;
  }

  const safeTotal = Number.isFinite(total) ? Math.floor(total) : 0;
  if (safeTotal <= 0) {
    return 0;
  }

  return Math.min(learnedToday.length, safeTotal);
}