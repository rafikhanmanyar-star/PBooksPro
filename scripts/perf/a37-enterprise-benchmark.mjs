#!/usr/bin/env node
/**
 * PERF-A3.7 — Enterprise API latency benchmark (read-path only).
 *
 * Usage:
 *   node scripts/perf/a37-enterprise-benchmark.mjs --base http://127.0.0.1:3001/api/v1 --token <JWT>
 *   node scripts/perf/a37-enterprise-benchmark.mjs --base http://127.0.0.1:3000/api/v1 --token <JWT> --iterations 10
 *
 * Env alternatives:
 *   PBooks_API_BASE, PBooks_BENCHMARK_TOKEN
 *
 * Output: JSON summary to stdout + optional --out docs/performance/a37-benchmark-results.json
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = {
    base: process.env.PBooks_API_BASE ?? 'http://127.0.0.1:3001/api/v1',
    token: process.env.PBooks_BENCHMARK_TOKEN ?? '',
    iterations: 5,
    outFile: '',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) out.base = argv[++i].replace(/\/$/, '');
    else if (a === '--token' && argv[i + 1]) out.token = argv[++i];
    else if (a === '--iterations' && argv[i + 1]) out.iterations = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--help') {
      console.log(`Usage: node scripts/perf/a37-enterprise-benchmark.mjs [--base URL] [--token JWT] [--iterations N] [--out path.json]`);
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
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const body = await res.text();
  const ms = performance.now() - start;
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* ignore */
  }
  return {
    ok: res.ok,
    status: res.status,
    ms,
    bytes: body.length,
    json,
  };
}

const SCENARIOS = [
  {
    area: 'Dashboard',
    name: 'dashboard_metrics_cold',
    path: '/dashboard/metrics',
  },
  {
    area: 'Dashboard',
    name: 'dashboard_kpis',
    path: '/aggregations/dashboard-kpis?from=2024-01-01&to=2026-12-31',
  },
  {
    area: 'Dashboard',
    name: 'rental_summary',
    path: '/dashboard/summaries/rental',
  },
  {
    area: 'Dashboard',
    name: 'inventory_summary',
    path: '/dashboard/summaries/inventory',
  },
  {
    area: 'Rental',
    name: 'rental_agreements_page',
    path: '/rental-agreements?page=1&pageSize=50',
  },
  {
    area: 'Rental',
    name: 'invoices_page',
    path: '/invoices?page=1&pageSize=50',
  },
  {
    area: 'Rental',
    name: 'owner_balances_agg',
    path: '/aggregations/owner-balances',
  },
  {
    area: 'Accounting',
    name: 'transactions_search',
    path: '/transactions?page=1&pageSize=50&search=payment',
  },
  {
    area: 'Accounting',
    name: 'transactions_page',
    path: '/transactions?page=1&pageSize=50',
  },
  {
    area: 'Payroll',
    name: 'employees_search',
    path: '/payroll/employees?page=1&pageSize=50&search=a',
  },
  {
    area: 'Payroll',
    name: 'payroll_ledger_page',
    path: '/payroll/ledger?page=1&pageSize=50',
  },
  {
    area: 'Inventory',
    name: 'units_search',
    path: '/units?page=1&pageSize=50&search=1',
  },
  {
    area: 'Inventory',
    name: 'procurement_stock_agg',
    path: '/aggregations/procurement-stock',
  },
  {
    area: 'Procurement',
    name: 'vendors_search',
    path: '/vendors?page=1&pageSize=50&search=a',
  },
  {
    area: 'Procurement',
    name: 'purchase_orders_page',
    path: '/purchase-orders?page=1&pageSize=50',
  },
  {
    area: 'Procurement',
    name: 'bills_page',
    path: '/bills?page=1&pageSize=50',
  },
  {
    area: 'Procurement',
    name: 'goods_receipts_page',
    path: '/goods-receipts?page=1&pageSize=50',
  },
  {
    area: 'Contacts',
    name: 'contacts_search',
    path: '/contacts?page=1&pageSize=50&search=a',
  },
];

async function main() {
  const args = parseArgs(process.argv);
  if (!args.token) {
    console.error('Missing JWT. Pass --token or set PBooks_BENCHMARK_TOKEN.');
    process.exit(1);
  }

  const health = await timedFetch(`${args.base.replace(/\/api\/v1$/, '')}/health`, args.token);
  const results = [];
  const startedAt = new Date().toISOString();

  for (const scenario of SCENARIOS) {
    const url = `${args.base}${scenario.path}`;
    const samples = [];
    let last = null;
    for (let i = 0; i < args.iterations; i++) {
      last = await timedFetch(url, args.token);
      if (last.ok) samples.push(last.ms);
    }
    samples.sort((a, b) => a - b);
    results.push({
      area: scenario.area,
      name: scenario.name,
      path: scenario.path,
      iterations: args.iterations,
      ok: last?.ok ?? false,
      status: last?.status ?? 0,
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      minMs: samples[0] ?? null,
      maxMs: samples[samples.length - 1] ?? null,
      lastPayloadBytes: last?.bytes ?? 0,
      totalCount:
        last?.json?.data?.totalCount ??
        last?.json?.data?.total ??
        last?.json?.totalCount ??
        null,
    });
  }

  const summary = {
    program: 'PERF-A3.7',
    startedAt,
    base: args.base,
    healthMs: health.ms,
    healthOk: health.ok,
    iterations: args.iterations,
    results,
  };

  const json = JSON.stringify(summary, null, 2);
  console.log(json);

  if (args.outFile) {
    const path = resolve(process.cwd(), args.outFile);
    writeFileSync(path, json, 'utf8');
    console.error(`Wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
