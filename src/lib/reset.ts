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
    return;
  }
}

export function consumeFreshDemoParam(): boolean {
  if (!hasFreshDemoParam()) {
    return false;
  }

  resetDemo();
  window.location.replace(import.meta.env.BASE_URL);
  return true;
}