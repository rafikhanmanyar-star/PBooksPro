#!/usr/bin/env node
/**
 * PERF-P2-A — Bootstrap concurrency remediation benchmark.
 * Tests BULK_BOOTSTRAP_CONCURRENCY variants via env (no production code change).
 *
 * Spawns an isolated API on port 3002 per variant, runs 1/3/5-user scenarios, writes JSON report.
 *
 * Usage:
 *   node --import tsx scripts/perf/perf-p2-a-concurrency-benchmark.mjs
 *   node --import tsx scripts/perf/perf-p2-a-concurrency-benchmark.mjs --variants 6,3,2,1 --skip-build
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

dotenv.config({ path: resolve('.env.staging') });

const VARIANTS = [
  { id: 'A', label: 'baseline', bootstrapConcurrency: 6 },
  { id: 'B', label: 'reduced-3', bootstrapConcurrency: 3 },
  { id: 'C', label: 'reduced-2', bootstrapConcurrency: 2 },
  { id: 'D', label: 'serial-1', bootstrapConcurrency: 1 },
];

const POOL_MAX = parseInt(process.env.PG_POOL_MAX || '20', 10) || 20;
const GLOBAL_SLOTS = parseInt(process.env.BULK_BOOTSTRAP_GLOBAL_SLOTS || '8', 10) || 8;
const SHED_WAITING = parseInt(process.env.PG_POOL_SHED_WAITING || '12', 10) || 12;

function parseArgs(argv) {
  const out = {
    port: 3002,
    tenantId: process.env.PBOOKS_VALIDATION_TENANT_ID ?? 'test-company',
    outFile: 'docs/performance/cloud/captures/perf-p2-a-concurrency-benchmark.json',
    variants: VARIANTS,
    skipBuild: false,
    userCounts: [1, 3, 5],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) out.port = Number(argv[++i]) || 3002;
    else if (a === '--tenant' && argv[i + 1]) out.tenantId = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--variants' && argv[i + 1]) {
      const nums = argv[++i].split(',').map(Number).filter(Boolean);
      out.variants = VARIANTS.filter((v) => nums.includes(v.bootstrapConcurrency));
    } else if (a === '--skip-build') out.skipBuild = true;
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mintTokenFromDb(tenantId) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT u.id, u.role FROM users u
       WHERE u.tenant_id = $1 AND u.is_active IS DISTINCT FROM false
       ORDER BY CASE WHEN u.role ILIKE '%admin%' THEN 0 ELSE 1 END, u.created_at ASC
       LIMIT 1`,
      [tenantId]
    );
    if (r.rows.length === 0) throw new Error(`No active user for tenant ${tenantId}`);
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

async function fetchJson(url, token) {
  const start = performance.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  const code = json?.error?.code;
  return {
    ok: res.ok,
    status: res.status,
    ms: Math.round(performance.now() - start),
    code,
    json,
  };
}

async function waitForHealth(baseUrl, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error(`Health check failed for ${baseUrl}`);
}

function runCommand(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: resolve('.'),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function startBenchmarkApi(port, bootstrapConcurrency) {
  const apiRoot = `http://127.0.0.1:${port}`;
  const child = spawn('node', ['backend/dist/index.js'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      BULK_BOOTSTRAP_CONCURRENCY: String(bootstrapConcurrency),
      BULK_BOOTSTRAP_GLOBAL_SLOTS: String(GLOBAL_SLOTS),
      PG_POOL_MAX: String(POOL_MAX),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d) => {
    const s = d.toString();
    if (s.includes('[POOL_') || s.includes('[PERF_BULK]')) {
      process.stderr.write(`[api:${bootstrapConcurrency}] ${s}`);
    }
  });

  await waitForHealth(apiRoot);
  return { child, apiRoot, base: `${apiRoot}/api/v1` };
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

async function pollPoolDuring(base, token, durationMs, intervalMs, onSample) {
  const samples = [];
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    const r = await fetchJson(`${base}/monitoring/pool-pressure`, token);
    const d = r.json?.data ?? r;
    const sample = {
      t: Date.now(),
      activeCount: d.activeCount ?? Math.max(0, (d.total ?? 0) - (d.idle ?? 0)),
      idleCount: d.idleCount ?? d.idle ?? 0,
      waitingCount: d.waitingCount ?? d.waiting ?? 0,
      total: d.total ?? 0,
      saturated: d.saturated ?? false,
    };
    samples.push(sample);
    onSample?.(sample);
    await sleep(intervalMs);
  }
  return samples;
}

/** Simulates one user login → bootstrap → dashboard ready. */
async function simulateUserLoginFlow(base, token) {
  const loginStart = performance.now();
  const shell = await Promise.all([
    fetchJson(`${base}/permissions/me`, token),
    fetchJson(`${base}/tenants/license-status`, token),
  ]);
  const bootstrap = await fetchJson(`${base}/state/bulk-chunked?limit=200&offset=0`, token);
  const loginMs = Math.round(performance.now() - loginStart);

  const dashStart = performance.now();
  const dashboard = await Promise.all([
    fetchJson(`${base}/dashboard/metrics?from=2024-01-01&to=2026-12-31`, token),
    fetchJson(`${base}/dashboard/snapshots`, token),
    fetchJson(`${base}/dashboard/charts?year=2026`, token),
    fetchJson(`${base}/dashboard/activity?limit=5`, token),
  ]);
  const dashboardMs = Math.round(performance.now() - dashStart);

  const all = [...shell, bootstrap, ...dashboard];
  return {
    loginMs,
    dashboardMs,
    totalMs: loginMs + dashboardMs,
    count503: all.filter((r) => r.status === 503).length,
    poolSaturated: all.filter((r) => r.code === 'POOL_SATURATED').length,
    breakerLike: all.filter((r) => r.code === 'BULK_LOAD_UNAVAILABLE').length,
    bootstrapMs: bootstrap.ms,
    dashboardMaxMs: Math.max(...dashboard.map((r) => r.ms)),
    ok: all.every((r) => r.ok),
  };
}

async function runConcurrentScenario(base, token, userCount) {
  let peakActive = 0;
  let peakWaiting = 0;
  let saturatedFlag = false;

  const pollPromise = pollPoolDuring(base, token, 20000, 500, (s) => {
    peakActive = Math.max(peakActive, s.activeCount ?? 0);
    peakWaiting = Math.max(peakWaiting, s.waitingCount ?? 0);
    if (s.saturated) saturatedFlag = true;
  });

  await sleep(300);
  const flows = await Promise.all(
    Array.from({ length: userCount }, () => simulateUserLoginFlow(base, token))
  );
  await sleep(500);
  const poolSamples = await pollPromise;

  const count503 = flows.reduce((s, f) => s + f.count503, 0);
  const loginMs = flows.map((f) => f.loginMs);
  const dashboardMs = flows.map((f) => f.dashboardMs);

  return {
    userCount,
    loginMs: {
      avg: Math.round(loginMs.reduce((a, b) => a + b, 0) / userCount),
      max: Math.max(...loginMs),
    },
    dashboardMs: {
      avg: Math.round(dashboardMs.reduce((a, b) => a + b, 0) / userCount),
      max: Math.max(...dashboardMs),
    },
    bootstrapMs: {
      avg: Math.round(flows.reduce((s, f) => s + f.bootstrapMs, 0) / userCount),
      max: Math.max(...flows.map((f) => f.bootstrapMs)),
    },
    peakActive,
    peakWaiting,
    saturatedFlag,
    count503,
    poolSaturatedResponses: flows.reduce((s, f) => s + f.poolSaturated, 0),
    breakerActivations: flows.reduce((s, f) => s + f.breakerLike, 0),
    allOk: flows.every((f) => f.ok),
    poolSampleCount: poolSamples.length,
  };
}

function estimateCapacity(peakActiveSingleUser, bootstrapConcurrency) {
  const observedPerUser = Math.max(1, peakActiveSingleUser);
  const theoreticalPerUser = Math.min(bootstrapConcurrency + 2, GLOBAL_SLOTS);
  const usersUntilPoolFull = Math.max(1, Math.floor(POOL_MAX / observedPerUser));
  const usersUntilShedQueue =
    peakActiveSingleUser >= POOL_MAX
      ? Math.floor(POOL_MAX / observedPerUser)
      : Math.floor((POOL_MAX + SHED_WAITING) / observedPerUser);
  return {
    bootstrapConcurrencySetting: bootstrapConcurrency,
    observedPeakActiveSingleUser: peakActiveSingleUser,
    theoreticalMinConnectionsPerUser: theoreticalPerUser,
    estimatedUsersUntilActiveEqualsPoolMax: usersUntilPoolFull,
    estimatedUsersUntilShedRisk: usersUntilShedQueue,
    poolMax: POOL_MAX,
    globalSlots: GLOBAL_SLOTS,
    shedWaitingThreshold: SHED_WAITING,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.skipBuild) {
    console.error('[p2-a] Building backend...');
    await runCommand('npm', ['run', 'build:backend'], {});
  }

  const token = await mintTokenFromDb(args.tenantId);
  const startedAt = new Date().toISOString();
  const variantResults = [];

  for (const variant of args.variants) {
    console.error(`[p2-a] Variant ${variant.id}: BOOTSTRAP_CONCURRENCY=${variant.bootstrapConcurrency}`);
    const { child, base } = await startBenchmarkApi(args.port, variant.bootstrapConcurrency);
    try {
      await sleep(2000);
      const rows = [];
      for (const users of args.userCounts) {
        console.error(`[p2-a]   ${users} concurrent user(s)...`);
        const row = await runConcurrentScenario(base, token, users);
        rows.push(row);
        await sleep(3000);
      }
      const single = rows.find((r) => r.userCount === 1);
      variantResults.push({
        variant: variant.id,
        label: variant.label,
        bootstrapConcurrency: variant.bootstrapConcurrency,
        capacityEstimate: estimateCapacity(single?.peakActive ?? 1, variant.bootstrapConcurrency),
        scenarios: rows,
        matrix: rows.map((r) => ({
          variant: variant.id,
          bootstrapConcurrency: variant.bootstrapConcurrency,
          users: r.userCount,
          loginMsAvg: r.loginMs.avg,
          loginMsMax: r.loginMs.max,
          dashboardMsAvg: r.dashboardMs.avg,
          dashboardMsMax: r.dashboardMs.max,
          peakActive: r.peakActive,
          peakWaiting: r.peakWaiting,
          count503: r.count503,
          breakerActivations: r.breakerActivations,
          allOk: r.allOk,
        })),
      });
    } finally {
      await stopApi(child);
      await sleep(2000);
    }
  }

  const flatMatrix = variantResults.flatMap((v) => v.matrix);

  const summary = {
    program: 'PERF-P2-A',
    startedAt,
    environment: {
      apiPort: args.port,
      tenantId: args.tenantId,
      poolMax: POOL_MAX,
      globalSlots: GLOBAL_SLOTS,
      shedWaitingThreshold: SHED_WAITING,
      note: 'Variants applied via BULK_BOOTSTRAP_CONCURRENCY env at API spawn (no production code change)',
    },
    variants: variantResults,
    flatMatrix,
    productionReference: {
      source: 'nav-probe-2026-06-22-atp.json',
      variantA503Count: 18,
      note: 'Production ATP uses default concurrency 6; large tenant data not replicated in test-company',
    },
  };

  const outPath = resolve(process.cwd(), args.outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify({ flatMatrix, capacity: variantResults.map((v) => v.capacityEstimate) }, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
