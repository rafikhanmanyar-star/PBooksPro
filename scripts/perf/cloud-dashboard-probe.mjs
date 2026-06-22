#!/usr/bin/env node
/**
 * Cloud Performance Program — Phase 4: Dashboard Performance probe.
 *
 * Measures dashboard metrics, charts, activity endpoints (cold + warm).
 *
 * Usage:
 *   node scripts/perf/cloud-dashboard-probe.mjs --base URL --token JWT
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {
    base: process.env.PBooks_API_BASE ?? 'http://127.0.0.1:3001/api/v1',
    token: process.env.PBooks_BENCHMARK_TOKEN ?? '',
    coldIterations: 1,
    warmIterations: 5,
    outFile: 'docs/performance/cloud/captures/phase4-dashboard.json',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) out.base = argv[++i].replace(/\/$/, '');
    else if (a === '--token' && argv[i + 1]) out.token = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--help') {
      console.log('Usage: node scripts/perf/cloud-dashboard-probe.mjs [--base URL] [--token JWT]');
      process.exit(0);
    }
  }
  return out;
}

async function timedFetch(url, token) {
  const start = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  return { ok: res.ok, status: res.status, ms: performance.now() - start, bytes: text.length };
}

const ENDPOINTS = [
  { area: 'metrics', path: '/dashboard/metrics?from=2025-01-01&to=2026-12-31' },
  { area: 'charts', path: '/dashboard/charts?year=2026&from=2025-01-01&to=2026-12-31' },
  { area: 'activity', path: '/dashboard/activity?limit=5' },
  { area: 'snapshots', path: '/dashboard/snapshots' },
  { area: 'kpis', path: '/aggregations/dashboard-kpis?from=2025-01-01&to=2026-12-31' },
];

async function main() {
  const args = parseArgs(process.argv);
  if (!args.token) {
    console.error('Missing JWT.');
    process.exit(1);
  }

  const results = [];
  for (const ep of ENDPOINTS) {
    const url = `${args.base}${ep.path}`;
    const cold = await timedFetch(url, args.token);
    const warmSamples = [];
    for (let i = 0; i < args.warmIterations; i++) {
      const w = await timedFetch(url, args.token);
      if (w.ok) warmSamples.push(w.ms);
    }
    warmSamples.sort((a, b) => a - b);
    results.push({
      area: ep.area,
      path: ep.path,
      coldMs: Math.round(cold.ms),
      warmP50Ms: warmSamples.length ? Math.round(warmSamples[Math.floor(warmSamples.length / 2)]) : null,
      warmMaxMs: warmSamples.length ? Math.round(warmSamples[warmSamples.length - 1]) : null,
      cacheHitLikely: warmSamples.length > 1 && warmSamples[warmSamples.length - 1] < cold.ms * 0.5,
      payloadBytes: cold.bytes,
    });
  }

  const summary = {
    program: 'cloud-perf-phase4',
    phase: 'Dashboard Performance',
    capturedAt: new Date().toISOString(),
    base: args.base,
    endpoints: results,
    analysisNotes: [
      'coldMs >> warmP50Ms suggests in-memory cache hit on dashboard routes (TTL 300s metrics, 60s activity)',
      'Investigate server logs [PERF_ENTITY] and pg_stat_statements for slow SQL when coldMs > 2000',
      'Check N+1 via parallel query count in dashboardMetricsService computeSnapshot',
    ],
  };

  const outPath = resolve(process.cwd(), args.outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
