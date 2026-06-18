/** Debounced full API refresh after entity socket events (shared with reconnect / visibility). */
export const API_REFRESH_DEBOUNCE_MS = 2000;
export const API_REFRESH_COOLDOWN_MS = 3000;
export const RECONNECT_DEBOUNCE_MS = 500;
export const TAB_VISIBILITY_COOLDOWN_MS = 30_000;

/**
 * C-5: own mutations still schedule debounced API refresh; only skip reducer patches.
 */
export function shouldSkipRemoteReducerPatch(
  sourceUserId: string | undefined,
  currentUserId: string | undefined
): boolean {
  return !!(sourceUserId && currentUserId && sourceUserId === currentUserId);
}

export function shouldSkipInitialSocketConnect(isFirstConnect: boolean): boolean {
  return isFirstConnect;
}

export function isWithinRefreshCooldown(now: number, lastRefreshAt: number, cooldownMs: number): boolean {
  return lastRefreshAt > 0 && now - lastRefreshAt < cooldownMs;
}
