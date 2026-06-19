import type { ApiEndpointStats } from '../../reliability/observabilityTypes.js';
import { API_LATENCY_CRITICAL_MS, API_LATENCY_WARN_MS } from '../../reliability/observabilityTypes.js';

export type ApiMetricSample = {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

const MAX_SAMPLES = 5000;
const samples: ApiMetricSample[] = [];

function normalizePath(path: string): string {
  return path
    .replace(/\?.*$/, '')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[a-z]+_[a-z0-9]{20,}/gi, '/:id');
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]!);
}

export function recordApiMetric(sample: Omit<ApiMetricSample, 'timestamp'> & { timestamp?: number }): void {
  samples.push({
    ...sample,
    path: normalizePath(sample.path),
    timestamp: sample.timestamp ?? Date.now(),
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

export function getApiMetricsSummary(windowMinutes = 60): {
  windowMinutes: number;
  totalRequests: number;
  totalErrors: number;
  slowWarningCount: number;
  slowCriticalCount: number;
  endpoints: ApiEndpointStats[];
  thresholds: { warnMs: number; criticalMs: number };
} {
  const since = Date.now() - windowMinutes * 60_000;
  const recent = samples.filter((s) => s.timestamp >= since);

  const byKey = new Map<string, ApiMetricSample[]>();
  for (const s of recent) {
    const key = `${s.method} ${s.path}`;
    const list = byKey.get(key) ?? [];
    list.push(s);
    byKey.set(key, list);
  }

  const endpoints: ApiEndpointStats[] = [];
  let slowWarningCount = 0;
  let slowCriticalCount = 0;
  let totalErrors = 0;

  for (const [routeKey, list] of byKey) {
    const durations = list.map((x) => x.durationMs).sort((a, b) => a - b);
    const errorCount = list.filter((x) => x.statusCode >= 500).length;
    const warningBreaches = list.filter((x) => x.durationMs >= API_LATENCY_WARN_MS).length;
    const criticalBreaches = list.filter((x) => x.durationMs >= API_LATENCY_CRITICAL_MS).length;
    slowWarningCount += warningBreaches;
    slowCriticalCount += criticalBreaches;
    totalErrors += errorCount;

    const [method, ...pathParts] = routeKey.split(' ');
    endpoints.push({
      routeKey,
      method: method ?? 'GET',
      path: pathParts.join(' '),
      requestCount: list.length,
      errorCount,
      avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      p99Ms: percentile(durations, 99),
      maxMs: durations[durations.length - 1] ?? 0,
      warningBreaches,
      criticalBreaches,
    });
  }

  endpoints.sort((a, b) => b.p95Ms - a.p95Ms);

  return {
    windowMinutes,
    totalRequests: recent.length,
    totalErrors,
    slowWarningCount,
    slowCriticalCount,
    endpoints,
    thresholds: { warnMs: API_LATENCY_WARN_MS, criticalMs: API_LATENCY_CRITICAL_MS },
  };
}

export function getSlowApiReport(windowMinutes = 60, limit = 20): ApiEndpointStats[] {
  return getApiMetricsSummary(windowMinutes).endpoints
    .filter((e) => e.p95Ms >= API_LATENCY_WARN_MS || e.errorCount > 0)
    .slice(0, limit);
}
