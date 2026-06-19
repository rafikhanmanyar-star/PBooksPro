import type { FrontendTelemetryMetric } from '../../shared/reliability/observabilityTypes';
import { monitoringIngestApi } from '../api/adminMonitoringApi';

const FLUSH_INTERVAL_MS = 60_000;
const MAX_BUFFER = 40;

let buffer: FrontendTelemetryMetric[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushTelemetry();
  }, FLUSH_INTERVAL_MS);
}

export function recordClientMetric(metric: FrontendTelemetryMetric): void {
  buffer.push({
    ...metric,
    timestamp: metric.timestamp ?? new Date().toISOString(),
  });
  if (buffer.length >= MAX_BUFFER) {
    void flushTelemetry();
  }
}

export async function flushTelemetry(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, MAX_BUFFER);
  try {
    await monitoringIngestApi.reportTelemetry(batch);
  } catch {
    buffer.unshift(...batch);
    if (buffer.length > MAX_BUFFER * 2) {
      buffer = buffer.slice(-MAX_BUFFER);
    }
  }
}

export function initClientTelemetry(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  // Page load
  if (typeof performance !== 'undefined' && performance.timing) {
    const loadMs = performance.timing.loadEventEnd - performance.timing.navigationStart;
    if (loadMs > 0) {
      recordClientMetric({ name: 'page_load', value: loadMs, unit: 'ms' });
    }
  } else if (performance.getEntriesByType) {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.loadEventEnd) {
      recordClientMetric({ name: 'page_load', value: nav.loadEventEnd, unit: 'ms' });
    }
  }

  // Memory (Chrome/Electron)
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  if (perf.memory?.usedJSHeapSize) {
    recordClientMetric({
      name: 'js_heap_bytes',
      value: perf.memory.usedJSHeapSize,
      unit: 'bytes',
    });
  }

  scheduleFlush();

  window.addEventListener('beforeunload', () => {
    void flushTelemetry();
  });
}

export function recordRouteTransition(from: string, to: string, durationMs: number): void {
  recordClientMetric({
    name: 'route_transition',
    value: durationMs,
    unit: 'ms',
    tags: { from, to },
  });
}

export function recordApiClientLatency(path: string, durationMs: number, status: number): void {
  recordClientMetric({
    name: 'api_client_latency',
    value: durationMs,
    unit: 'ms',
    tags: { path: path.slice(0, 120), status: String(status) },
  });
}
