#!/usr/bin/env node
/**
 * PERF-P2-B — Bootstrap connection ownership analysis.
 * Measurement only. Spawns isolated API with pool ownership tracking.
 *
 * Usage:
 *   node --import tsx scripts/perf/perf-p2-b-connection-ownership.mjs
 *   node --import tsx scripts/perf/perf-p2-b-connection-ownership.mjs --concurrency 1,6
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

dotenv.config({ path: resolve('.env.staging') });

function parseArgs(argv) {
  const out = {
    port: 3003,
    tenantId: process.env.PBOOKS_VALIDATION_TENANT_ID ?? 'test-company',
    concurrencies: [1, 6],
    outFile: 'docs/performance/cloud/captures/perf-p2-b-connection-ownership.json',
    skipBuild: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) out.port = Number(argv[++i]) || 3003;
    else if (a === '--tenant' && argv[i + 1]) out.tenantId = argv[++i];
    else if (a === '--concurrency' && argv[i + 1]) {
      out.concurrencies = argv[++i].split(',').map(Number).filter(Boolean);
    } else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--skip-build') out.skipBuild = true;
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mintToken(tenantId) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT u.id, u.role FROM users u WHERE u.tenant_id = $1 AND u.is_active IS DISTINCT FROM false
       ORDER BY CASE WHEN u.role ILIKE '%admin%' THEN 0 ELSE 1 END LIMIT 1`,
      [tenantId]
    );
    const { id: userId, role } = r.rows[0];
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

async function waitForHealth(base, ms = 90000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(800);
  }
  throw new Error('health timeout');
}

async function runCommand(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: resolve('.'), shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (c) => (c === 0 ? resolve(undefined) : reject(new Error(`exit ${c}`))));
  });
}

function startApi(port, bootstrapConcurrency) {
  const logs = [];
  const child = spawn('node', ['backend/dist/index.js'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      BULK_BOOTSTRAP_CONCURRENCY: String(bootstrapConcurrency),
      BULK_BOOTSTRAP_GLOBAL_SLOTS: '8',
      PG_POOL_MAX: '20',
      PBOOKS_PERF_POOL_OWNERSHIP: '1',
      PBOOKS_PERF_POOL_HOLD_WARN_MS: '0',
      DEMO_AUTO_RESET: 'false',
      ENABLE_DEMO_SCHEDULER: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (chunk) => {
    const s = chunk.toString();
    logs.push(s);
    if (s.includes('[POOL_HOLD]') || s.includes('[PERF_BULK]') || s.includes('[POOL_INIT]')) {
      process.stderr.write(s);
    }
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);
  return { child, logs, base: `http://127.0.0.1:${port}`, api: `http://127.0.0.1:${port}/api/v1` };
}

function stopApi(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve(undefined);
    child.once('exit', () => resolve(undefined));
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 5000);
  });
}

async function fetchJson(url, token) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - t0), json };
}

async function measureBootstrapOnly(api, token) {
  const poolSamples = [];
  let peakActive = 0;
  let peakWaiting = 0;
  let sampling = true;

  const poll = (async () => {
    while (sampling) {
      const r = await fetchJson(`${api}/monitoring/pool-pressure`, token);
      const d = r.json?.data;
      if (d) {
        const active = d.activeCount ?? Math.max(0, (d.total ?? 0) - (d.idle ?? 0));
        const waiting = d.waitingCount ?? d.waiting ?? 0;
        poolSamples.push({ t: Date.now(), active, idle: d.idleCount ?? d.idle, waiting, total: d.total });
        peakActive = Math.max(peakActive, active);
        peakWaiting = Math.max(peakWaiting, waiting);
      }
      await sleep(25);
    }
  })();

  await sleep(100);
  const t0 = Date.now();
  const bootstrap = await fetchJson(`${api}/state/bulk-chunked?limit=200&offset=0`, token);
  const requestEnd = Date.now();
  await sleep(200);
  sampling = false;
  await poll;

  const ownership = await fetchJson(`${api}/pool-ownership/report`, token);
  const holds = ownership.json?.data?.topByHold ?? ownership.json?.topByHold ?? [];

  return {
    requestMs: bootstrap.ms,
    requestStartOffsetMs: t0,
    requestEndOffsetMs: requestEnd,
    peakActiveDuringRequest: peakActive,
    peakWaitingDuringRequest: peakWaiting,
    poolSamples,
    holdEventCount: Array.isArray(holds) ? holds.length : 0,
    holdEvents: holds,
    bootstrapStatus: bootstrap.status,
  };
}

async function measureLoginPlusBootstrap(api, token) {
  const poolSamples = [];
  let peakActive = 0;
  let sampling = true;
  const poll = (async () => {
    while (sampling) {
      const r = await fetchJson(`${api}/monitoring/pool-pressure`, token);
      const d = r.json?.data;
      if (d) {
        const active = d.activeCount ?? Math.max(0, (d.total ?? 0) - (d.idle ?? 0));
        peakActive = Math.max(peakActive, active);
        poolSamples.push({ t: Date.now(), active, idle: d.idleCount ?? d.idle, waiting: d.waitingCount ?? 0 });
      }
      await sleep(25);
    }
  })();

  await sleep(100);
  const t0 = Date.now();
  await fetchJson(`${api}/permissions/me`, token);
  await fetchJson(`${api}/tenants/license-status`, token);
  const bootstrap = await fetchJson(`${api}/state/bulk-chunked?limit=200&offset=0`, token);
  const requestEnd = Date.now();
  await sleep(200);
  sampling = false;
  await poll;

  const ownership = await fetchJson(`${api}/pool-ownership/report`, token);
  const holds = ownership.json?.data?.topByHold ?? ownership.json?.topByHold ?? [];

  return {
    totalMs: requestEnd - t0,
    bootstrapMs: bootstrap.ms,
    peakActiveDuringRequest: peakActive,
    holdEventCount: Array.isArray(holds) ? holds.length : 0,
    holdEvents: holds,
  };
}

function analyzeHolds(holds, requestStartMs) {
  if (!Array.isArray(holds) || holds.length === 0) return { simultaneousPeak: 0, timeline: [] };

  const events = holds
    .map((h, i) => ({
      id: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? i : ''),
      route: h.route,
      acquireAt: h.acquireAt,
      releaseAt: h.releaseAt,
      holdMs: h.holdMs,
      waitMs: h.waitMs,
      relAcquireMs: h.acquireAt - requestStartMs,
      relReleaseMs: h.releaseAt - requestStartMs,
      poolAtAcquire: {
        total: h.poolTotalAtAcquire,
        idle: h.poolIdleAtAcquire,
        waiting: h.poolWaitingAtAcquire,
      },
    }))
    .sort((a, b) => a.acquireAt - b.acquireAt);

  // Sweepline for max overlap
  const points = [];
  for (const e of events) {
    points.push({ t: e.acquireAt, delta: 1 });
    points.push({ t: e.releaseAt, delta: -1 });
  }
  points.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let cur = 0;
  let maxOverlap = 0;
  for (const p of points) {
    cur += p.delta;
    maxOverlap = Math.max(maxOverlap, cur);
  }

  return { simultaneousPeak: maxOverlap, timeline: events };
}

function parsePoolHoldLogs(logs, requestIdHint) {
  const lines = logs.join('').split('\n');
  const holds = [];
  for (const line of lines) {
    if (!line.includes('[POOL_HOLD]')) continue;
    const m = line.match(
      /route="([^"]+)" requestId=([^\s]+) acquireAt=(\d+) releaseAt=(\d+) holdMs=(\d+) waitMs=(\d+) atAcquire=\{total:(\d+),idle:(\d+),waiting:(\d+)\}/
    );
    if (!m) continue;
    holds.push({
      route: m[1],
      requestId: m[2],
      acquireAt: Number(m[3]),
      releaseAt: Number(m[4]),
      holdMs: Number(m[5]),
      waitMs: Number(m[6]),
      poolTotalAtAcquire: Number(m[7]),
      poolIdleAtAcquire: Number(m[8]),
      poolWaitingAtAcquire: Number(m[9]),
    });
  }
  return holds;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.skipBuild) {
    console.error('[p2-b] build:backend...');
    await runCommand('npm', ['run', 'build:backend']);
  }

  const token = await mintToken(args.tenantId);
  const results = [];

  for (const conc of args.concurrencies) {
    console.error(`[p2-b] === BOOTSTRAP_CONCURRENCY=${conc} ===`);
    const { child, logs, api, base } = startApi(args.port, conc);
    try {
      await waitForHealth(base);
      await sleep(3000); // let startup background work settle

      const bootstrapOnly = await measureBootstrapOnly(api, token);
      const requestStart = bootstrapOnly.poolSamples[0]?.t ?? Date.now();
      const holdsFromReport = analyzeHolds(bootstrapOnly.holdEvents, requestStart);
      const holdsFromLogs = parsePoolHoldLogs(logs);

      // Filter holds for bulk-chunked route only
      const bulkHolds = holdsFromLogs.filter((h) => h.route.includes('/state/bulk-chunked'));
      const bulkAnalysis = analyzeHolds(bulkHolds, bulkHolds[0]?.acquireAt ?? requestStart);

      await sleep(2000);
      const loginFlow = await measureLoginPlusBootstrap(api, token);

      results.push({
        bootstrapConcurrency: conc,
        bootstrapOnly: {
          ...bootstrapOnly,
          holdAnalysisFromReport: holdsFromReport,
          holdAnalysisBulkRoute: bulkAnalysis,
          bulkHoldCount: bulkHolds.length,
        },
        loginPlusBootstrap: {
          ...loginFlow,
          holdAnalysis: analyzeHolds(loginFlow.holdEvents, Date.now()),
        },
        logHoldLines: bulkHolds.length,
        codePaths: {
          bypassRunBatched: [
            'countTenantTransactions → getPool().query() (no semaphore)',
            'fetchPlSubTypesForTenant → withPoolClient() (no semaphore)',
            'listTransactions chunk → withPoolClient() (no semaphore)',
            'authMiddleware → pool.query() / pool.connect() per request',
            'issueStandardAccessToken path already done before benchmark request',
          ],
          guardedRunBatched: '21 entity loaders via withPoolClientGuarded in batches of BOOTSTRAP_CONCURRENCY',
        },
      });
    } finally {
      await stopApi(child);
      await sleep(2000);
    }
  }

  const summary = {
    program: 'PERF-P2-B',
    capturedAt: new Date().toISOString(),
    tenantId: args.tenantId,
    poolMax: 20,
    globalSlots: 8,
    p2aAnomalyExplanation:
      'P2-A used 20–45s pool poll windows; peak active 16–18 was process-wide sampling artifact, not simultaneous bootstrap fan-out.',
    variants: results,
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
