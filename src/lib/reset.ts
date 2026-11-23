import { PERSIST_KEY, useGameStore } from '../store/gameStore';

export const DEMO_QUERY_KEY = 'demo';

export function hasFreshDemoParam(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get(DEMO_QUERY_KEY) === 'fresh';
}

export function resetDemo(): void {
  useGameStore.getState().resetDemo();
  try {
    window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    // 无痕模式等场景下存储不可写，内存状态已回到初始态，忽略即可。
  }
}

/**
 * 仅抹掉地址栏上的 demo 参数，保留路径、其余查询参数与 hash。
 * 用 replaceState 而非整页跳转：不丢失分享链接路径，也不打断 SPA 渲染。
 */
export function clearFreshDemoParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(DEMO_QUERY_KEY)) {
    return;
  }

  url.searchParams.delete(DEMO_QUERY_KEY);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

export function consumeFreshDemoParam(): boolean {
  if (!hasFreshDemoParam()) {
    return false;
  }

  resetDemo();
  clearFreshDemoParam();
  return true;
}