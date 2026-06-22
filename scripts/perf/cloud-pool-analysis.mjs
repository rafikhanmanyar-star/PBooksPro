#!/usr/bin/env node
/**
 * Cloud Performance Program — Phase 3: Connection Pool Analysis.
 *
 * Polls GET /monitoring/pool-pressure during scenario bursts and optionally
 * reads GET /monitoring/perf-baseline when export is enabled.
 *
 * Usage:
 *   node scripts/perf/cloud-pool-analysis.mjs \
 *     --base https://api.pbookspro.com/api/v1 \
 *     --token <JWT> \
 *     --scenario dashboard \
 *     --out docs/performance/cloud/captures/phase3-pool-dashboard.json
 *
 * Scenarios: login | dashboard | reports | payroll | all
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SCENARIO_PATHS = {
  login: ['/permissions/me', '/tenants/license-status'],
  dashboard: [
    '/dashboard/metrics?from=2025-01-01&to=2026-12-31',
    '/dashboard/activity?limit=5',
    '/dashboard/snapshots',
    '/dashboard/charts?year=2026',
  ],
  reports: ['/reports/designer/dashboard-pins', '/aggregations/dashboard-kpis?from=2025-01-01&to=2026-12-31'],
  payroll: ['/payroll/employees?page=1&pageSize=50', '/payroll/runs?page=1&pageSize=20', '/payroll/ledger?page=1&pageSize=50'],
};

function parseArgs(argv) {
  const out = {
    base: process.env.PBooks_API_BASE ?? 'http://127.0.0.1:3001/api/v1',
    token: process.env.PBooks_BENCHMARK_TOKEN ?? '',
    scenario: 'dashboard',
    polls: 20,
    intervalMs: 500,
    outFile: '',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) out.base = argv[++i].replace(/\/$/, '');
    else if (a === '--token' && argv[i + 1]) out.token = argv[++i];
    else if (a === '--scenario' && argv[i + 1]) out.scenario = argv[++i];
    else if (a === '--polls' && argv[i + 1]) out.polls = Number(argv[++i]) || 20;
    else if (a === '--interval' && argv[i + 1]) out.intervalMs = Number(argv[++i]) || 500;
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--help') {
      console.log('Usage: node scripts/perf/cloud-pool-analysis.mjs [--base URL] [--token JWT] [--scenario login|dashboard|reports|payroll|all]');
      process.exit(0);
    }
  }
  if (!out.outFile) {
    out.outFile = `docs/performance/cloud/captures/phase3-pool-${out.scenario}.json`;
  }
  return out;
}

async function fetchJson(url, token) {
  const start = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const json = await res.json();
  return { ok: res.ok, status: res.status, ms: performance.now() - start, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.token) {
    console.error('Missing JWT.');
    process.exit(1);
  }

  const scenarios =
    args.scenario === 'all'
      ? Object.keys(SCENARIO_PATHS)
      : SCENARIO_PATHS[args.scenario]
        ? [args.scenario]
        : null;
  if (!scenarios) {
    console.error(`Unknown scenario: ${args.scenario}`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const samples = [];
  const burstResults = [];

  for (const name of scenarios) {
    const paths = SCENARIO_PATHS[name];
    for (const path of paths) {
      const url = `${args.base}${path}`;
      const r = await fetchJson(url, args.token);
      burstResults.push({ scenario: name, path, status: r.status, ms: Math.round(r.ms) });
    }
  }

  for (let i = 0; i < args.polls; i++) {
    const pool = await fetchJson(`${args.base}/monitoring/pool-pressure`, args.token);
    const d = pool.json?.data;
    if (d) {
      samples.push({
        t: Date.now(),
        activeCount: d.activeCount,
        idleCount: d.idleCount,
        waitingCount: d.waitingCount,
        total: d.total,
        saturated: d.saturated,
      });
    }
    await sleep(args.intervalMs);
  }

  let serverBaseline = null;
  const baseline = await fetchJson(`${args.base}/monitoring/perf-baseline?windowMinutes=15`, args.token);
  if (baseline.ok) serverBaseline = baseline.json?.data;

  const peakActive = samples.reduce((m, s) => Math.max(m, s.activeCount ?? 0), 0);
  const peakWaiting = samples.reduce((m, s) => Math.max(m, s.waitingCount ?? 0), 0);

  const summary = {
    program: 'cloud-perf-phase3',
    phase: 'Connection Pool Analysis',
    startedAt,
    scenario: args.scenario,
    base: args.base,
    polls: args.polls,
    intervalMs: args.intervalMs,
    burstResults,
    poolSamples: samples,
    peakActiveCount: peakActive,
    peakWaitingCount: peakWaiting,
    serverBaseline,
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
