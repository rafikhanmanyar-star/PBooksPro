#!/usr/bin/env node
/**
 * Cloud Performance Program — Phase 1: Login & Dashboard Baseline (server-side probe).
 *
 * Simulates authenticated read paths used during login→dashboard and captures
 * latency + pool pressure. Pair with client export from __PBOOKS_EXPORT_STARTUP_PERF__().
 *
 * Usage:
 *   node scripts/perf/cloud-login-dashboard-baseline.mjs \
 *     --base https://api.pbookspro.com/api/v1 \
 *     --token <JWT> \
 *     --out docs/performance/cloud/captures/phase1-baseline.json
 *
 * Env: PBooks_API_BASE, PBooks_BENCHMARK_TOKEN
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {
    base: process.env.PBooks_API_BASE ?? 'http://127.0.0.1:3001/api/v1',
    token: process.env.PBooks_BENCHMARK_TOKEN ?? '',
    iterations: 3,
    outFile: 'docs/performance/cloud/captures/phase1-baseline.json',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) out.base = argv[++i].replace(/\/$/, '');
    else if (a === '--token' && argv[i + 1]) out.token = argv[++i];
    else if (a === '--iterations' && argv[i + 1]) out.iterations = Math.max(1, Number(argv[++i]) || 3);
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--help') {
      console.log(`Usage: node scripts/perf/cloud-login-dashboard-baseline.mjs [--base URL] [--token JWT] [--iterations N] [--out path.json]`);
      process.exit(0);
    }
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function timedFetch(url, token, method = 'GET', body) {
  const start = performance.now();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const ms = performance.now() - start;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, ms, bytes: text.length, json };
}

const STARTUP_SCENARIOS = [
  { phase: 'shell', name: 'permissions_me', path: '/permissions/me' },
  { phase: 'shell', name: 'license_status', path: '/tenants/license-status' },
  { phase: 'bootstrap', name: 'state_bulk_chunked_p0', path: '/state/bulk-chunked?limit=200&offset=0' },
  { phase: 'dashboard', name: 'dashboard_activity', path: '/dashboard/activity?limit=5' },
  { phase: 'dashboard', name: 'dashboard_metrics', path: '/dashboard/metrics?from=2025-01-01&to=2026-12-31' },
  { phase: 'dashboard', name: 'dashboard_snapshots', path: '/dashboard/snapshots' },
  { phase: 'dashboard', name: 'dashboard_charts', path: '/dashboard/charts?year=2026&from=2025-01-01&to=2026-12-31' },
];

async function fetchPoolPressure(base, token) {
  const r = await timedFetch(`${base}/monitoring/pool-pressure`, token);
  return r.json?.data ?? null;
}

async function fetchPerfBaseline(base, token) {
  const r = await timedFetch(`${base}/monitoring/perf-baseline?windowMinutes=15`, token);
  return r.ok ? r.json?.data ?? null : { disabled: true, status: r.status };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.token) {
    console.error('Missing JWT. Pass --token or set PBooks_BENCHMARK_TOKEN.');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const poolBefore = await fetchPoolPressure(args.base, args.token);
  const results = [];

  for (const scenario of STARTUP_SCENARIOS) {
    const url = `${args.base}${scenario.path}`;
    const samples = [];
    let last = null;
    for (let i = 0; i < args.iterations; i++) {
      last = await timedFetch(url, args.token);
      if (last.ok) samples.push(last.ms);
    }
    samples.sort((a, b) => a - b);
    results.push({
      phase: scenario.phase,
      name: scenario.name,
      path: scenario.path,
      iterations: args.iterations,
      ok: last?.ok ?? false,
      status: last?.status ?? 0,
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      maxMs: samples[samples.length - 1] ?? null,
      lastPayloadBytes: last?.bytes ?? 0,
    });
  }

  const poolAfter = await fetchPoolPressure(args.base, args.token);
  const perfBaseline = await fetchPerfBaseline(args.base, args.token);

  const slowest = [...results].sort((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0)).slice(0, 10);

  const summary = {
    program: 'cloud-perf-phase1',
    phase: 'Login & Dashboard Baseline',
    startedAt,
    base: args.base,
    iterations: args.iterations,
    apiRequestCount: results.length * args.iterations,
    poolBefore,
    poolAfter,
    serverBaseline: perfBaseline,
    scenarios: results,
    slowestEndpoints: slowest,
    notes: [
      'Pair with client snapshot: localStorage.setItem("PBOOKS_STARTUP_PERF","1"), login, then window.__PBOOKS_EXPORT_STARTUP_PERF__()',
      'Enable server pool sampling: PBOOKS_PERF_POOL_SAMPLE=1 and PBOOKS_PERF_BASELINE_EXPORT=1',
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
