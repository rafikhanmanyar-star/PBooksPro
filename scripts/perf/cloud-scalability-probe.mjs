#!/usr/bin/env node
/**
 * Cloud Performance Program — Phase 5: Scalability probe.
 *
 * Extends PERF-A3.7 enterprise benchmark with login/dashboard/reports/payroll
 * groupings for large-tenant comparison runs.
 *
 * Usage:
 *   node scripts/perf/cloud-scalability-probe.mjs --base URL --token JWT --iterations 10
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {
    base: process.env.PBooks_API_BASE ?? 'http://127.0.0.1:3001/api/v1',
    token: process.env.PBooks_BENCHMARK_TOKEN ?? '',
    iterations: 5,
    tenantLabel: 'default',
    outFile: 'docs/performance/cloud/captures/phase5-scalability.json',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) out.base = argv[++i].replace(/\/$/, '');
    else if (a === '--token' && argv[i + 1]) out.token = argv[++i];
    else if (a === '--iterations' && argv[i + 1]) out.iterations = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--tenant-label' && argv[i + 1]) out.tenantLabel = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--help') {
      console.log('Usage: node scripts/perf/cloud-scalability-probe.mjs [--base URL] [--token JWT] [--iterations N] [--tenant-label name]');
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

async function timedFetch(url, token) {
  const start = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const body = await res.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, ms: performance.now() - start, bytes: body.length, json };
}

const GROUPS = {
  login: [
    { name: 'permissions_me', path: '/permissions/me' },
    { name: 'license_status', path: '/tenants/license-status' },
    { name: 'state_bulk_chunked', path: '/state/bulk-chunked?limit=200&offset=0' },
  ],
  dashboard: [
    { name: 'dashboard_metrics', path: '/dashboard/metrics?from=2024-01-01&to=2026-12-31' },
    { name: 'dashboard_charts', path: '/dashboard/charts?year=2026' },
    { name: 'dashboard_activity', path: '/dashboard/activity?limit=5' },
  ],
  reports: [
    { name: 'trial_balance', path: '/reports/trial-balance?from=2024-01-01&to=2026-12-31' },
    { name: 'general_ledger', path: '/reports/general-ledger?from=2024-01-01&to=2026-12-31&accountId=all' },
  ],
  payroll: [
    { name: 'payroll_employees', path: '/payroll/employees?page=1&pageSize=50' },
    { name: 'payroll_runs', path: '/payroll/runs?page=1&pageSize=20' },
    { name: 'payroll_ledger', path: '/payroll/ledger?page=1&pageSize=50' },
  ],
};

async function main() {
  const args = parseArgs(process.argv);
  if (!args.token) {
    console.error('Missing JWT.');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const groups = {};

  for (const [groupName, scenarios] of Object.entries(GROUPS)) {
    const groupResults = [];
    for (const scenario of scenarios) {
      const url = `${args.base}${scenario.path}`;
      const samples = [];
      let last = null;
      for (let i = 0; i < args.iterations; i++) {
        last = await timedFetch(url, args.token);
        if (last.ok) samples.push(last.ms);
      }
      samples.sort((a, b) => a - b);
      groupResults.push({
        name: scenario.name,
        path: scenario.path,
        p50Ms: Math.round(percentile(samples, 50)),
        p95Ms: Math.round(percentile(samples, 95)),
        maxMs: Math.round(samples[samples.length - 1] ?? 0),
        ok: last?.ok ?? false,
        totalCount: last?.json?.data?.totalCount ?? last?.json?.data?.total ?? null,
        payloadBytes: last?.bytes ?? 0,
      });
    }
    groups[groupName] = groupResults;
  }

  const flat = Object.values(groups).flat();
  const ranked = [...flat].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 10);

  const summary = {
    program: 'cloud-perf-phase5',
    phase: 'Scalability Testing',
    tenantLabel: args.tenantLabel,
    startedAt,
    base: args.base,
    iterations: args.iterations,
    groups,
    top10ByP95: ranked,
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
