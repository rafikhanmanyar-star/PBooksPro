import { logger } from '../logger';

export function isRealtimeTraceEnabled(): boolean {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEBUG_REALTIME === 'true';
}

export function rtTrace(event: string, data?: Record<string, unknown>): void {
  if (!isRealtimeTraceEnabled()) return;
  logger.logCategory('realtime', event, data ?? {});
}

export function rtTraceDuration(event: string, startMs: number, data?: Record<string, unknown>): void {
  if (!isRealtimeTraceEnabled()) return;
  logger.logCategory('realtime', event, { ...data, durationMs: Date.now() - startMs });
}
