#!/usr/bin/env node
/**
 * PERF-ARCH-VALIDATION-01 — Validate cloud bootstrap pool saturation hypothesis.
 * Measurement-only: no app behavior changes.
 *
 * Usage (local staging API on :3001):
 *   node scripts/perf/perf-arch-validation-01.mjs
 *   node scripts/perf/perf-arch-validation-01.mjs --base http://127.0.0.1:3001/api/v1 --concurrency 5
 *
 * Optional: PBooks_BENCHMARK_TOKEN=<JWT> skips DB token minting.
 * Requires: .env.staging with DATABASE_URL + JWT_SECRET matching the running API.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

dotenv.config({ path: resolve('.env.staging') });

function parseArgs(argv) {
  const out = {
    base: (process.env.PBooks_API_BASE ?? 'http://127.0.0.1:3001/api/v1').replace(/\/$/, ''),
    token: process.env.PBooks_BENCHMARK_TOKEN ?? '',
    tenantId: process.env.PBOOKS_VALIDATION_TENANT_ID ?? 'test-company',
    outFile: 'docs/performance/cloud/captures/perf-arch-validation-01.json',
    pollIntervalMs: 1000,
    scenarios: [1, 3, 5],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[i + 1]) out.base = argv[++i].replace(/\/$/, '');
    else if (a === '--token' && argv[i + 1]) out.token = argv[++i];
    else if (a === '--tenant' && argv[i + 1]) out.tenantId = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--concurrency' && argv[i + 1]) {
      const n = Number(argv[++i]) || 5;
      out.scenarios = [1, 3, n];
    }
  }
  return out;
}

async function mintTokenFromDb(tenantId) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET missing in .env.staging (need match with running API)');
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT u.id, u.role FROM users u
       WHERE u.tenant_id = $1 AND u.is_active IS DISTINCT FROM false
       ORDER BY CASE WHEN u.role ILIKE '%admin%' THEN 0 ELSE 1 END, u.created_at ASC
       LIMIT 1`,
      [tenantId]
    );
    if (r.rows.length === 0) {
      throw new Error(`No active user for tenant ${tenantId}`);
    }
    const { id: userId, role } = r.rows[0];
    // RBAC V2 requires av claim — match production login token shape.
    const { issueStandardAccessToken } = await import('../../backend/src/auth/accessTokenIssuance.ts');
    const client = await pool.connect();
    try {
      return await issueStandardAccessToken(userId, tenantId, role, client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function fetchJson(url, token, opts = {}) {
  const start = performance.now();
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  const code = json?.error?.code ?? json?.code;
  return {
    ok: res.ok,
    status: res.status,
    ms: Math.round(performance.now() - start),
    bytes: text.length,
    code,
    json,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollPool(base, token, durationMs, intervalMs, label) {
  const samples = [];
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    const r = await fetchJson(`${base}/monitoring/pool-pressure`, token);
    const d = r.json?.data;
    if (d) {
      samples.push({
        t: new Date().toISOString(),
        activeCount: d.activeCount ?? Math.max(0, (d.total ?? 0) - (d.idle ?? 0)),
        idleCount: d.idleCount ?? d.idle ?? 0,
        waitingCount: d.waitingCount ?? d.waiting ?? 0,
        total: d.total ?? 0,
        saturated: d.saturated ?? false,
        label,
      });
    }
    await sleep(intervalMs);
  }
  return samples;
}

async function runBootstrapBurst(base, token, concurrency, label) {
  const path = '/state/bulk-chunked?limit=200&offset=0';
  const dashboardPaths = [
    '/dashboard/metrics?from=2024-01-01&to=2026-12-31',
    '/dashboard/snapshots',
    '/dashboard/charts?year=2026',
    '/dashboard/activity?limit=5',
  ];

  const startedAt = Date.now();
  let pollDone = false;
  const pollPromise = pollPool(base, token, 45000, 1000, label).then((s) => {
    pollDone = true;
    return s;
  });

  await sleep(500);

  const bootstrapPromises = Array.from({ length: concurrency }, (_, i) =>
    fetchJson(`${base}${path}`, token).then((r) => ({ worker: i + 1, kind: 'bootstrap', path, ...r }))
  );

  const dashboardPromises =
    concurrency >= 3
      ? dashboardPaths.map((p, i) =>
          fetchJson(`${base}${p}`, token).then((r) => ({ worker: `dash-${i + 1}`, kind: 'dashboard', path: p, ...r }))
        )
      : [];

  const results = await Promise.all([...bootstrapPromises, ...dashboardPromises]);
  const elapsedMs = Date.now() - startedAt;

  while (!pollDone) await sleep(200);
  const poolSamples = await pollPromise;

  const pool503 = results.filter((r) => r.status === 503);
  const saturatedSamples = poolSamples.filter((s) => s.saturated || s.waitingCount > 0);

  return {
    label,
    concurrency,
    elapsedMs,
    bootstrapResults: results.filter((r) => r.kind === 'bootstrap'),
    dashboardResults: results.filter((r) => r.kind === 'dashboard'),
    counts: {
      totalRequests: results.length,
      status503: pool503.length,
      poolSaturatedCode: results.filter((r) => r.code === 'POOL_SATURATED').length,
      ok: results.filter((r) => r.ok).length,
    },
    bootstrapMs: {
      avg: Math.round(
        results.filter((r) => r.kind === 'bootstrap' && r.ok).reduce((s, r) => s + r.ms, 0) /
          Math.max(1, results.filter((r) => r.kind === 'bootstrap' && r.ok).length)
      ),
      max: Math.max(0, ...results.filter((r) => r.kind === 'bootstrap').map((r) => r.ms)),
    },
    poolSamples,
    poolPeak: {
      activeCount: poolSamples.reduce((m, s) => Math.max(m, s.activeCount ?? 0), 0),
      waitingCount: poolSamples.reduce((m, s) => Math.max(m, s.waitingCount ?? 0), 0),
      saturatedObserved: saturatedSamples.length > 0,
    },
  };
}

async function runSingleBootstrapProfile(base, token) {
  const path = '/state/bulk-chunked?limit=200&offset=0';
  const poolBefore = await fetchJson(`${base}/monitoring/pool-pressure`, token);
  const t0 = Date.now();
  const bootstrap = await fetchJson(`${base}${path}`, token);
  const poolDuring = await pollPool(base, token, 3000, 500, 'single-profile');
  let ownership = null;
  const own = await fetchJson(`${base}/pool-ownership/report`, token);
  if (own.ok) ownership = own.json?.data ?? own.json;

  return {
    bootstrap,
    durationMs: Date.now() - t0,
    poolBefore: poolBefore.json?.data ?? null,
    poolDuringPeak: {
      activeCount: poolDuring.reduce((m, s) => Math.max(m, s.activeCount ?? 0), 0),
      waitingCount: poolDuring.reduce((m, s) => Math.max(m, s.waitingCount ?? 0), 0),
    },
    ownershipReport: ownership,
    codeConstants: {
      bootstrapConcurrency: 6,
      globalPoolSlots: 8,
      poolMaxDefault: 20,
      shedWaitingThreshold: 12,
      staticEntityLoaders: 21,
      loaderThunksTotal: 27,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  let token = args.token;
  if (!token) {
    token = await mintTokenFromDb(args.tenantId);
    console.error('[validation-01] Minted JWT from staging DB (no password login)');
  }

  const health = await fetch(`${args.base.replace(/\/api\/v1$/, '')}/health`);
  if (!health.ok) {
    console.error(`API health check failed: ${health.status}`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const scenarios = [];

  for (const n of args.scenarios) {
    console.error(`[validation-01] Scenario: ${n} concurrent bootstrap(s)...`);
    scenarios.push(await runBootstrapBurst(args.base, token, n, `concurrency-${n}`));
    await sleep(3000);
  }

  console.error('[validation-01] Single bootstrap connection profile...');
  const connectionProfile = await runSingleBootstrapProfile(args.base, token);

  const productionNavProbe = {
    source: 'docs/performance/cloud/captures/nav-probe-2026-06-22-atp.json',
    api503Count: 18,
    bulkEndpoints: { '/state/bulk': 12, '/state/bulk-chunked': 6 },
    rootCauseClass: 'POOL_SATURATED',
    overlayMaxMs: 92925,
  };

  const summary = {
    program: 'PERF-ARCH-VALIDATION-01',
    startedAt,
    base: args.base,
    tenantId: args.tenantId,
    hypothesis:
      'Parallel bootstrap (runBatched ×6, global slots 8) saturates PG pool (max 20) → 503 POOL_SATURATED → bulk breaker → slow login/dashboard',
    measurement1_poolPressure: scenarios.map((s) => ({
      concurrency: s.concurrency,
      peakActive: s.poolPeak.activeCount,
      peakWaiting: s.poolPeak.waitingCount,
      saturatedObserved: s.poolPeak.saturatedObserved,
      samples: s.poolSamples,
    })),
    measurement2_bootstrapTiming: scenarios.map((s) => ({
      users: s.concurrency,
      avgBootstrapMs: s.bootstrapMs.avg,
      maxBootstrapMs: s.bootstrapMs.max,
      elapsedMs: s.elapsedMs,
    })),
    measurement3_503Correlation: scenarios.map((s) => ({
      scenario: s.label,
      concurrency: s.concurrency,
      count503: s.counts.status503,
      poolSaturatedCode: s.counts.poolSaturatedCode,
      okCount: s.counts.ok,
    })),
    measurement4_connectionProfile: connectionProfile,
    measurement5_dashboardImpact: scenarios.map((s) => ({
      concurrency: s.concurrency,
      dashboardResults: s.dashboardResults.map((r) => ({
        path: r.path,
        status: r.status,
        ms: r.ms,
        code: r.code,
      })),
    })),
    measurement6_reactQuery: {
      method: 'static-code-analysis',
      atLogin: [
        'refetchOnWindowFocus=false globally (queryClient default)',
        'Financial tier (dashboardMetrics): refetchOnWindowFocus=true after 30s stale — requires tab blur/focus, not initial paint',
        'pageActiveInvalidation: runs on page group re-activation, not first dashboard mount',
      ],
      afterInteraction: [
        'refetchOnWindowFocus on ledger/invoices/transactions/dashboardMetrics',
        'invalidatePageGroupQueries on DASHBOARD/RENTAL/PROJECT/etc. when hidden page becomes active',
        'socket entity events → invalidateQueriesForEntityEvent (continuous, not login-only)',
      ],
      runtimeCapturePending: 'Enable PBOOKS_STARTUP_PERF=1 + browser login export for counts',
    },
    productionEvidence: productionNavProbe,
    scenarios,
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
