/**
 * Cloud Performance Program — in-memory ring buffer of pool pressure snapshots.
 * Sampled when PBOOKS_PERF_POOL_SAMPLE=1 (via performanceTimingMiddleware).
 */

import type { PoolPressureSnapshot } from '../../db/pool.js';

export type PoolMetricSample = PoolPressureSnapshot & {
  timestamp: number;
  activeCount: number;
  route?: string;
  method?: string;
  durationMs?: number;
};

const MAX_SAMPLES = 10_000;
const samples: PoolMetricSample[] = [];

export function recordPoolMetricSample(
  pressure: PoolPressureSnapshot,
  context?: { route?: string; method?: string; durationMs?: number }
): void {
  samples.push({
    ...pressure,
    activeCount: Math.max(0, pressure.total - pressure.idle),
    timestamp: Date.now(),
    route: context?.route,
    method: context?.method,
    durationMs: context?.durationMs,
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

export function getPoolMetricsSummary(windowMinutes = 60): {
  windowMinutes: number;
  sampleCount: number;
  peakActiveCount: number;
  peakWaitingCount: number;
  avgActiveCount: number;
  avgWaitingCount: number;
  saturatedSampleCount: number;
  slowAcquireRoutes: Array<{ route: string; maxWaitMs: number; count: number }>;
  recentSamples: PoolMetricSample[];
} {
  const since = Date.now() - windowMinutes * 60_000;
  const recent = samples.filter((s) => s.timestamp >= since);
  if (recent.length === 0) {
    return {
      windowMinutes,
      sampleCount: 0,
      peakActiveCount: 0,
      peakWaitingCount: 0,
      avgActiveCount: 0,
      avgWaitingCount: 0,
      saturatedSampleCount: 0,
      slowAcquireRoutes: [],
      recentSamples: [],
    };
  }

  let peakActive = 0;
  let peakWaiting = 0;
  let sumActive = 0;
  let sumWaiting = 0;
  let saturated = 0;
  const routeWaits = new Map<string, { maxWaitMs: number; count: number }>();

  for (const s of recent) {
    peakActive = Math.max(peakActive, s.activeCount);
    peakWaiting = Math.max(peakWaiting, s.waiting);
    sumActive += s.activeCount;
    sumWaiting += s.waiting;
    if (s.saturated) saturated += 1;
    if (s.route && s.durationMs !== undefined && s.durationMs >= 1000) {
      const key = s.route;
      const prev = routeWaits.get(key) ?? { maxWaitMs: 0, count: 0 };
      routeWaits.set(key, {
        maxWaitMs: Math.max(prev.maxWaitMs, s.durationMs),
        count: prev.count + 1,
      });
    }
  }

  return {
    windowMinutes,
    sampleCount: recent.length,
    peakActiveCount: peakActive,
    peakWaitingCount: peakWaiting,
    avgActiveCount: Math.round((sumActive / recent.length) * 10) / 10,
    avgWaitingCount: Math.round((sumWaiting / recent.length) * 10) / 10,
    saturatedSampleCount: saturated,
    slowAcquireRoutes: [...routeWaits.entries()]
      .map(([route, v]) => ({ route, ...v }))
      .sort((a, b) => b.maxWaitMs - a.maxWaitMs)
      .slice(0, 20),
    recentSamples: recent.slice(-50),
  };
}

export function isPoolSamplingEnabled(): boolean {
  return process.env.PBOOKS_PERF_POOL_SAMPLE === '1';
}

export function clearPoolMetricSamples(): void {
  samples.length = 0;
}
