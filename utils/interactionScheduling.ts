/**
 * Defer work off the critical input path to improve INP (Interaction to Next Paint).
 */

export function scheduleAfterNextPaint(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fn();
      });
    });
  } else {
    setTimeout(fn, 0);
  }
}

type IdleFn = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

export function scheduleIdleWork(fn: IdleFn, options?: { timeout?: number }): number {
  const timeout = options?.timeout ?? 2000;
  if (typeof requestIdleCallback !== 'function') {
    return window.setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 0 }), 1) as unknown as number;
  }
  return requestIdleCallback(fn, { timeout });
}

export function cancelScheduledIdle(id: number): void {
  if (typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}
