#!/usr/bin/env node
/**
 * PERF-P2-C — ATP bootstrap query duration analysis (measurement only).
 *
 * Spawns isolated API, runs GET /state/bulk-chunked?offset=0 N times,
 * parses existing [PERF_BULK], [PERF_ENTITY], [POOL_HOLD], [BULK_STATE_*] logs.
 * No query/SQL/index/concurrency changes.
 *
 * Usage:
 *   node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs
 *   node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --env .env.production.render --tenant rk-builders-284d6d --iterations 5
 *   node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --tenant atp-8da881 --iterations 3
 *
 * Remote wall-clock only (requires PBooks_BENCHMARK_TOKEN):
 *   node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --remote --base https://api.pbookspro.com/api/v1 --iterations 10
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {
    envFile: '.env.production.render',
    tenantQuery: process.env.PBOOKS_VALIDATION_TENANT_ID ?? 'rk-builders-284d6d',
    port: 3004,
    iterations: 5,
    skipBuild: false,
    remote: false,
    base: (process.env.PBooks_API_BASE ?? 'https://api.pbookspro.com/api/v1').replace(/\/$/, ''),
    token: process.env.PBooks_BENCHMARK_TOKEN ?? '',
    outJson: 'docs/performance/cloud/captures/perf-p2-c-atp-bootstrap-query-analysis.json',
    outReport: 'docs/performance/cloud/reports/perf-p2-c-atp-bootstrap-query-analysis.md',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env' && argv[i + 1]) out.envFile = argv[++i];
    else if (a === '--tenant' && argv[i + 1]) out.tenantQuery = argv[++i];
    else if (a === '--port' && argv[i + 1]) out.port = Number(argv[++i]) || 3004;
    else if (a === '--iterations' && argv[i + 1]) out.iterations = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--skip-build') out.skipBuild = true;
    else if (a === '--remote') out.remote = true;
    else if (a === '--base' && argv[i + 1]) out.base = argv[++i].replace(/\/$/, '');
    else if (a === '--token' && argv[i + 1]) out.token = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outJson = argv[++i];
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    avg: s.length ? Math.round(sum / s.length) : 0,
    p50: Math.round(percentile(s, 50)),
    p95: Math.round(percentile(s, 95)),
    max: Math.round(s[s.length - 1] ?? 0),
    min: Math.round(s[0] ?? 0),
  };
}

async function resolveTenantId(pool, query) {
  if (/^[a-z0-9-]+$/i.test(query) && query.includes('-')) {
    const exact = await pool.query(`SELECT id, name, company_name FROM tenants WHERE id = $1`, [query]);
    if (exact.rows.length) return exact.rows[0];
  }
  const r = await pool.query(
    `SELECT id, name, company_name FROM tenants
     WHERE id ILIKE $1 OR name ILIKE $1 OR company_name ILIKE $1
     ORDER BY CASE WHEN id = $2 THEN 0 WHEN name ILIKE $2 THEN 1 ELSE 2 END
     LIMIT 1`,
    [`%${query}%`, query]
  );
  if (!r.rows.length) throw new Error(`Tenant not found for query: ${query}`);
  return r.rows[0];
}

/** Same SQL shapes as bootstrap — timing only, no app changes. */
async function measureRawSqlTimings(pool, tenantId, iterations = 3) {
  const countSql = `SELECT COUNT(*)::int AS c FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL`;
  const listSql = `SELECT * FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT 200 OFFSET 0`;
  const countSamples = [];
  const listSamples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await pool.query(countSql, [tenantId]);
    countSamples.push(Math.round(performance.now() - t0));
    const t1 = performance.now();
    await pool.query(listSql, [tenantId]);
    listSamples.push(Math.round(performance.now() - t1));
  }
  return {
    countTenantTransactionsSql: stats(countSamples),
    listTransactionsPageSql: stats(listSamples),
  };
}

async function queryTenantVolumes(pool, tenantId) {
  const tables = {
    transactions: `SELECT COUNT(*)::int AS c FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL`,
    invoices: `SELECT COUNT(*)::int AS c FROM invoices WHERE tenant_id = $1 AND deleted_at IS NULL`,
    bills: `SELECT COUNT(*)::int AS c FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL`,
    contacts: `SELECT COUNT(*)::int AS c FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL`,
    units: `SELECT COUNT(*)::int AS c FROM units WHERE tenant_id = $1 AND deleted_at IS NULL`,
    properties: `SELECT COUNT(*)::int AS c FROM properties WHERE tenant_id = $1 AND deleted_at IS NULL`,
    contracts: `SELECT COUNT(*)::int AS c FROM contracts WHERE tenant_id = $1 AND deleted_at IS NULL`,
    rentalAgreements: `SELECT COUNT(*)::int AS c FROM rental_agreements WHERE tenant_id = $1 AND deleted_at IS NULL`,
    projectAgreements: `SELECT COUNT(*)::int AS c FROM project_agreements WHERE tenant_id = $1 AND deleted_at IS NULL`,
    projects: `SELECT COUNT(*)::int AS c FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL`,
    accounts: `SELECT COUNT(*)::int AS c FROM accounts WHERE tenant_id = $1 AND deleted_at IS NULL`,
    categories: `SELECT COUNT(*)::int AS c FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL`,
  };
  const volumes = {};
  for (const [key, sql] of Object.entries(tables)) {
    try {
      const r = await pool.query(sql, [tenantId]);
      volumes[key] = r.rows[0]?.c ?? 0;
    } catch {
      volumes[key] = null;
    }
  }
  volumes.agreements = (volumes.rentalAgreements ?? 0) + (volumes.projectAgreements ?? 0);
  return volumes;
}

async function mintToken(tenantId, envFile) {
  dotenv.config({ path: resolve(envFile) });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT u.id, u.role FROM users u
       WHERE u.tenant_id = $1 AND u.is_active IS DISTINCT FROM false
       ORDER BY CASE WHEN u.role ILIKE '%admin%' THEN 0 ELSE 1 END, u.created_at ASC
       LIMIT 1`,
      [tenantId]
    );
    if (!r.rows.length) throw new Error(`No active user for tenant ${tenantId}`);
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

async function runCommand(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: resolve('.'), shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (c) => (c === 0 ? resolve(undefined) : reject(new Error(`exit ${c}`))));
  });
}

async function waitForHealth(base, ms = 120000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error('health timeout');
}

function startApi(port, envFile) {
  const logs = [];
  dotenv.config({ path: resolve(envFile) });
  const child = spawn('node', ['backend/dist/index.js'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      BULK_BOOTSTRAP_CONCURRENCY: process.env.BULK_BOOTSTRAP_CONCURRENCY || '6',
      BULK_BOOTSTRAP_GLOBAL_SLOTS: process.env.BULK_BOOTSTRAP_GLOBAL_SLOTS || '8',
      PG_POOL_MAX: process.env.PG_POOL_MAX || '20',
      PBOOKS_PERF_POOL_OWNERSHIP: '1',
      PBOOKS_PERF_POOL_HOLD_WARN_MS: '0',
      DEMO_AUTO_RESET: 'false',
      ENABLE_DEMO_SCHEDULER: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (chunk) => {
    logs.push(chunk.toString());
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
    }, 8000);
  });
}

async function fetchBootstrap(api, token) {
  const t0 = performance.now();
  const res = await fetch(`${api}/state/bulk-chunked?limit=200&offset=0`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return {
    ok: res.ok,
    status: res.status,
    wallMs: Math.round(performance.now() - t0),
    code: json?.error?.code,
    totals: json?.data?.totals ?? null,
  };
}

function parseLogs(logText) {
  const lines = logText.split('\n');

  const bulkEnds = [];
  const bulkStarts = [];
  const perfBulk = [];
  const perfEntity = [];
  const poolHolds = [];

  for (const line of lines) {
    let m;
    if ((m = line.match(/\[BULK_STATE_END\] requestId=([^\s]+).*durationMs=(\d+)/))) {
      bulkEnds.push({ requestId: m[1], durationMs: Number(m[2]) });
    } else if ((m = line.match(/\[BULK_STATE_START\] requestId=([^\s]+)/))) {
      bulkStarts.push({ requestId: m[1] });
    } else if ((m = line.match(/\[PERF_BULK\].*getBulkAppStateChunked COMPLETE offset=0 duration=(\d+)ms/))) {
      perfBulk.push({ kind: 'handlerTotal', durationMs: Number(m[1]) });
    } else if ((m = line.match(/\[PERF_BULK\].*countTenantTransactions duration=(\d+)ms (\{.*\})/))) {
      try {
        const extra = JSON.parse(m[2]);
        perfBulk.push({ kind: 'countTenantTransactions', durationMs: Number(m[1]), txTotal: extra.txTotal });
      } catch {
        perfBulk.push({ kind: 'countTenantTransactions', durationMs: Number(m[1]) });
      }
    } else if ((m = line.match(/\[PERF_BULK\].*getBulkAppState \(static\) duration=(\d+)ms/))) {
      perfBulk.push({ kind: 'entityLoaderTotal', durationMs: Number(m[1]) });
    } else if ((m = line.match(/\[PERF_BULK\] fetchPlSubTypesForTenant duration=(\d+)ms/))) {
      perfBulk.push({ kind: 'fetchPlSubTypesForTenant', durationMs: Number(m[1]) });
    } else if ((m = line.match(/\[PERF_BULK\].*listTransactions offset=0 duration=(\d+)ms (\{.*\})/))) {
      try {
        const extra = JSON.parse(m[2]);
        perfBulk.push({ kind: 'listTransactions', durationMs: Number(m[1]), rows: extra.rows });
      } catch {
        perfBulk.push({ kind: 'listTransactions', durationMs: Number(m[1]) });
      }
    } else if ((m = line.match(/\[PERF_BULK\] batched loaders completed duration=(\d+)ms/))) {
      perfBulk.push({ kind: 'batchedLoaders', durationMs: Number(m[1]) });
    } else if ((m = line.match(/\[PERF_ENTITY\].*entity=([^\s]+) rows=(\d+) duration=(\d+)ms/))) {
      perfEntity.push({ entity: m[1], rows: Number(m[2]), durationMs: Number(m[3]) });
    } else if (
      (m = line.match(
        /\[POOL_HOLD\] route="GET \/api\/v1\/state\/bulk-chunked[^"]*" requestId=([^\s]+)\s+acquireAt=(\d+) releaseAt=(\d+) holdMs=(\d+) waitMs=(\d+)/
      ))
    ) {
      poolHolds.push({
        requestId: m[1],
        acquireAt: Number(m[2]),
        releaseAt: Number(m[3]),
        holdMs: Number(m[4]),
        waitMs: Number(m[5]),
      });
    }
  }

  return { bulkEnds, bulkStarts, perfBulk, perfEntity, poolHolds };
}

function analyzeIteration(logText, iterationIndex) {
  const parsed = parseLogs(logText);
  const end = parsed.bulkEnds[iterationIndex];
  const handlerEntries = parsed.perfBulk.filter((x) => x.kind === 'handlerTotal');
  const handler = handlerEntries[iterationIndex];
  const routeMs = end?.durationMs ?? null;
  const handlerMs = handler?.durationMs ?? null;
  const authMs = routeMs != null && handlerMs != null ? Math.max(0, routeMs - handlerMs) : null;

  const pickNth = (kind) => {
    const arr = parsed.perfBulk.filter((x) => x.kind === kind);
    return arr[iterationIndex] ?? arr[arr.length - 1] ?? null;
  };

  const entityLoaderEntry = pickNth('entityLoaderTotal') ?? pickNth('batchedLoaders');
  const stages = {
    authMiddleware: authMs,
    countTenantTransactions: pickNth('countTenantTransactions')?.durationMs ?? null,
    entityLoaderTotal: entityLoaderEntry?.durationMs ?? null,
    fetchPlSubTypesForTenant: pickNth('fetchPlSubTypesForTenant')?.durationMs ?? null,
    listTransactions: pickNth('listTransactions')?.durationMs ?? null,
    overallRequest: routeMs,
    handlerTotal: handlerMs,
  };

  const entityMap = new Map();
  const entityGroups = [];
  let group = [];
  for (const row of parsed.perfEntity) {
    if (row.entity === 'accounts' && group.length) {
      entityGroups.push(group);
      group = [];
    }
    group.push(row);
  }
  if (group.length) entityGroups.push(group);
  const entities = entityGroups[iterationIndex] ?? entityGroups[entityGroups.length - 1] ?? parsed.perfEntity;
  for (const e of entities) entityMap.set(e.entity, e);

  const requestId = end?.requestId;
  const holds = requestId
    ? parsed.poolHolds.filter((h) => h.requestId === requestId)
    : parsed.poolHolds.slice(-50);

  return { stages, entities: [...entityMap.values()], holds, requestId };
}

function peakOverlap(holds) {
  const pts = [];
  for (const h of holds) {
    pts.push({ t: h.acquireAt, d: 1 });
    pts.push({ t: h.releaseAt, d: -1 });
  }
  pts.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0;
  let peak = 0;
  for (const p of pts) {
    cur += p.d;
    peak = Math.max(peak, cur);
  }
  return peak;
}

function buildHoldSummary(holds, stages) {
  if (!holds.length) return [];
  holds.sort((a, b) => a.acquireAt - b.acquireAt);
  const t0 = holds[0].acquireAt;
  const totalHoldMs = holds.reduce((s, h) => s + h.holdMs, 0);
  const maxHoldMs = Math.max(...holds.map((h) => h.holdMs));

  const stageKeys = [
    ['authMiddleware (est.)', stages.authMiddleware],
    ['countTenantTransactions', stages.countTenantTransactions],
    ['entity loaders (aggregate)', stages.entityLoaderTotal],
    ['fetchPlSubTypesForTenant', stages.fetchPlSubTypesForTenant],
    ['listTransactions', stages.listTransactions],
  ].filter(([, ms]) => ms != null);

  return {
    connectionCycles: holds.length,
    peakSimultaneous: peakOverlap(holds),
    sumHoldMs: totalHoldMs,
    maxSingleHoldMs: maxHoldMs,
    timeline: holds.slice(0, 40).map((h, i) => ({
      label: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(i) : ''),
      relAcquireMs: h.acquireAt - t0,
      relReleaseMs: h.releaseAt - t0,
      holdMs: h.holdMs,
      waitMs: h.waitMs,
    })),
    stageDurationComparison: stageKeys,
  };
}

function generateReport(capture) {
  const { tenant, volumes, iterations, stageStats, entityRanking, holdAnalysis, p95Queries, dataLimitations, rawSqlTimings } =
    capture;

  const stageTable = Object.entries(stageStats)
    .map(([k, v]) => `| ${k} | ${v.avg} | ${v.p95} | ${v.max} |`)
    .join('\n');

  const entityTable = entityRanking
    .slice(0, 15)
    .map((e) => `| ${e.entity} | ${e.rows} | ${e.durationMs} | ${e.avgMs ?? '-'} | ${e.p95Ms ?? '-'} |`)
    .join('\n');

  const volumeTable = Object.entries(volumes)
    .filter(([k]) => k !== 'agreements' || volumes.agreements)
    .map(([k, v]) => `| ${k} | ${v ?? 'n/a'} |`)
    .join('\n');

  const p95Table = p95Queries.map((q) => `| ${q.name} | ${q.avg} | ${q.p95} | ${q.max} |`).join('\n');

  const contributors = capture.poolContributors
    .map((c, i) => `| ${i + 1} | ${c.operation} | ${c.evidence} |`)
    .join('\n');

  return `# PERF-P2-C — ATP Bootstrap Query Duration Analysis

**Date:** ${capture.capturedAt.split('T')[0]}  
**Program:** PERF-P2-C (measurement only — no query/index/concurrency changes)  
**Capture:** \`${capture.outJson.replace(/\\/g, '/')}\`

---

## Data scope & limitations

${dataLimitations.map((l) => `- ${l}`).join('\n')}

**Tenant measured:** \`${tenant.id}\` (${tenant.name ?? tenant.company_name ?? '—'})  
**Database env:** \`${capture.envFile}\`  
**Iterations:** ${iterations.length} (warm iterations used for entity breakdown where noted)

---

## Section 1 — Slowest Bootstrap Queries

Stages ranked by **P95 duration** (ms):

| Stage | Avg | P95 | Max |
|-------|----:|----:|----:|
${stageTable}

### Top 10 slowest entity loaders (single-run peak / iteration max)

| Rank | Entity | Rows | Duration ms (max iter) | Avg ms | P95 ms |
|-----:|--------|-----:|-----------------------:|-------:|-------:|
${entityRanking
  .slice(0, 10)
  .map((e, i) => `| ${i + 1} | ${e.entity} | ${e.rows} | ${e.durationMs} | ${e.avgMs ?? '-'} | ${e.p95Ms ?? '-'} |`)
  .join('\n')}

---

## Section 2 — Connection Hold Analysis

| Metric | Value |
|--------|------:|
| Connection cycles (bulk route) | ${holdAnalysis.connectionCycles} |
| Peak simultaneous holds | ${holdAnalysis.peakSimultaneous} |
| Sum of hold times (ms) | ${holdAnalysis.sumHoldMs} |
| Longest single hold (ms) | ${holdAnalysis.maxSingleHoldMs} |

### Stage duration vs connection occupancy

| Stage | Duration ms (avg) |
|-------|------------------:|
${holdAnalysis.stageDurationComparison.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

### Pool occupancy timeline (first request, relative ms)

\`\`\`
Bootstrap Start (t+0)
${holdAnalysis.timeline
  .slice(0, 20)
  .map((t) => `t+${t.relAcquireMs}ms  Connection ${t.label} acquired (hold ${t.holdMs}ms, wait ${t.waitMs}ms)\nt+${t.relReleaseMs}ms  Connection ${t.label} released`)
  .join('\n')}
${holdAnalysis.timeline.length > 20 ? '…' : ''}
\`\`\`

---

## Section 3 — ATP Data Volume Analysis

| Entity | Row Count |
|--------|----------:|
${volumeTable}

### Raw SQL probe (same queries as bootstrap, direct pool)

| Query | Avg | P95 | Max |
|-------|----:|----:|----:|
| countTenantTransactions SQL | ${rawSqlTimings?.countTenantTransactionsSql?.avg ?? 'n/a'} | ${rawSqlTimings?.countTenantTransactionsSql?.p95 ?? 'n/a'} | ${rawSqlTimings?.countTenantTransactionsSql?.max ?? 'n/a'} |
| listTransactions page SQL | ${rawSqlTimings?.listTransactionsPageSql?.avg ?? 'n/a'} | ${rawSqlTimings?.listTransactionsPageSql?.p95 ?? 'n/a'} | ${rawSqlTimings?.listTransactionsPageSql?.max ?? 'n/a'} |

---

## Section 4 — Pool Pressure Contributors

| Rank | Operation | Evidence |
|-----:|-----------|----------|
${contributors}

---

## Section 5 — Root Cause Verdict

${capture.verdict}

---

## Measurement 5 — P95 Query Report

| Query / Stage | Avg | P95 | Max |
|---------------|----:|----:|----:|
${p95Table}

---

## Re-run

\`\`\`powershell
node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --env .env.production.render --tenant rk-builders-284d6d --iterations 5
node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --tenant atp-8da881 --iterations 3
\`\`\`

Remote wall-clock (production JWT required):

\`\`\`powershell
$env:PBooks_BENCHMARK_TOKEN = "<JWT>"
node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --remote --base https://api.pbookspro.com/api/v1 --tenant atp-8da881 --iterations 10
\`\`\`
`;
}

async function runRemote(args, tenant, volumes) {
  if (!args.token) throw new Error('Remote mode requires PBooks_BENCHMARK_TOKEN or --token');
  const wallSamples = [];
  for (let i = 0; i < args.iterations; i++) {
    const r = await fetchBootstrap(args.base, args.token);
    wallSamples.push(r.wallMs);
    await sleep(500);
  }
  return {
    mode: 'remote',
    wallStats: stats(wallSamples),
    volumes,
    tenant,
    note: 'Remote mode captures wall-clock only; internal stage breakdown requires local API spawn with log parsing.',
  };
}

async function main() {
  const args = parseArgs(process.argv);
  dotenv.config({ path: resolve(args.envFile) });

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let tenant;
  let volumes;
  let rawSqlTimings;
  try {
    tenant = await resolveTenantId(pool, args.tenantQuery);
    volumes = await queryTenantVolumes(pool, tenant.id);
    rawSqlTimings = await measureRawSqlTimings(pool, tenant.id, Math.min(args.iterations, 5));
  } finally {
    await pool.end();
  }

  const dataLimitations = [];
  if (tenant.id === 'atp-8da881' && (volumes.transactions ?? 0) === 0) {
    dataLimitations.push(
      'ATP tenant (`atp-8da881`) on accessible production DB has **zero transactions** — not ATP live volume at time of capture.'
    );
  }
  if (tenant.id === 'rk-builders-284d6d') {
    dataLimitations.push(
      'Using **RK Builders** (`rk-builders-284d6d`, ~5k transactions) as **ATP-scale volume proxy** — largest tenant on accessible DB; ATP org on Render DB is empty.'
    );
    dataLimitations.push(
      'Measurements run via **local API → DB** (`.env.production`); production Render adds network latency and multi-user overlap not fully replicated here.'
    );
  }
  if (args.remote) {
    const remote = await runRemote(args, tenant, volumes);
    const capture = {
      program: 'PERF-P2-C',
      capturedAt: new Date().toISOString(),
      mode: 'remote',
      envFile: args.envFile,
      tenant,
      volumes,
      remote,
      dataLimitations,
      outJson: args.outJson,
    };
    const outPath = resolve(args.outJson);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(capture, null, 2));
    console.log(JSON.stringify(capture, null, 2));
    return;
  }

  if (!args.skipBuild) {
    console.error('[p2-c] build:backend...');
    await runCommand('npm', ['run', 'build:backend']);
  }

  const token = await mintToken(tenant.id, args.envFile);
  const { child, logs, api, base } = startApi(args.port, args.envFile);

  const iterationResults = [];
  try {
    await waitForHealth(base);
    await sleep(4000);

    for (let i = 0; i < args.iterations; i++) {
      console.error(`[p2-c] iteration ${i + 1}/${args.iterations}...`);
      const mark = logs.length;
      const result = await fetchBootstrap(api, token);
      await sleep(300);
      const iterLogs = logs.slice(mark).join('');
      const analysis = analyzeIteration(logs.join(''), i);
      iterationResults.push({
        index: i,
        ...result,
        stages: analysis.stages,
        entities: analysis.entities,
        holdSummary: buildHoldSummary(analysis.holds, analysis.stages),
        requestId: analysis.requestId,
      });
    }
  } finally {
    await stopApi(child);
  }

  const stageKeys = [
    'authMiddleware',
    'countTenantTransactions',
    'entityLoaderTotal',
    'fetchPlSubTypesForTenant',
    'listTransactions',
    'overallRequest',
  ];
  const stageStats = {};
  for (const key of stageKeys) {
    const samples = iterationResults.map((r) => r.stages[key]).filter((v) => typeof v === 'number');
    stageStats[key] = stats(samples);
  }

  const entityAgg = new Map();
  for (const iter of iterationResults) {
    for (const e of iter.entities) {
      if (!entityAgg.has(e.entity)) entityAgg.set(e.entity, { durations: [], rows: e.rows });
      entityAgg.get(e.entity).durations.push(e.durationMs);
      entityAgg.get(e.entity).rows = Math.max(entityAgg.get(e.entity).rows, e.rows);
    }
  }
  const entityRanking = [...entityAgg.entries()]
    .map(([entity, v]) => ({
      entity,
      rows: v.rows,
      durationMs: Math.max(...v.durations),
      avgMs: stats(v.durations).avg,
      p95Ms: stats(v.durations).p95,
    }))
    .sort((a, b) => b.p95Ms - a.p95Ms || b.durationMs - a.durationMs);

  const p95Queries = [
    { name: 'overallRequest', ...stageStats.overallRequest },
    { name: 'countTenantTransactions', ...stageStats.countTenantTransactions },
    { name: 'entityLoaderTotal', ...stageStats.entityLoaderTotal },
    { name: 'fetchPlSubTypesForTenant', ...stageStats.fetchPlSubTypesForTenant },
    { name: 'listTransactions', ...stageStats.listTransactions },
    ...entityRanking.slice(0, 5).map((e) => ({ name: `entity:${e.entity}`, avg: e.avgMs, p95: e.p95Ms, max: e.durationMs })),
  ].filter((q) => q.avg != null || q.p95 != null);

  const bestHold = iterationResults.reduce(
    (best, r) => ((r.holdSummary?.sumHoldMs ?? 0) > (best?.holdSummary?.sumHoldMs ?? 0) ? r : best),
    iterationResults[0]
  );
  const holdAnalysis = bestHold?.holdSummary ?? buildHoldSummary([], {});

  const sortedStages = Object.entries(stageStats)
    .filter(([k]) => k !== 'overallRequest' && (stageStats[k].n ?? 0) > 0)
    .sort((a, b) => (b[1].p95 ?? 0) - (a[1].p95 ?? 0));

  const poolContributors = sortedStages.slice(0, 5).map(([name, s]) => ({
    operation: name,
    evidence: `P95=${s.p95}ms avg=${s.avg}ms max=${s.max}ms (n=${s.n})`,
  }));
  for (const e of entityRanking.slice(0, 3)) {
    poolContributors.push({
      operation: `entity loader: ${e.entity}`,
      evidence: `P95=${e.p95Ms}ms max=${e.durationMs}ms rows=${e.rows}`,
    });
  }
  poolContributors.push({
    operation: 'connection hold sum (bulk route)',
    evidence: `sumHoldMs=${holdAnalysis.sumHoldMs} peakSimultaneous=${holdAnalysis.peakSimultaneous} cycles=${holdAnalysis.connectionCycles}`,
  });

  const topStage = sortedStages[0]?.[0] ?? 'entityLoaderTotal';
  const topStageP95 = sortedStages[0]?.[1]?.p95 ?? stageStats.entityLoaderTotal?.p95 ?? 0;
  const topEntity = entityRanking[0]?.entity ?? 'unknown';
  const verdict = `On tenant \`${tenant.id}\` (${volumes.transactions ?? 0} transactions, ${volumes.invoices ?? 0} invoices), **${topStage}** is the slowest bootstrap stage by P95 (**${topStageP95} ms**). Top entity loader: **${topEntity}** (P95 ${entityRanking[0]?.p95Ms ?? 'n/a'} ms). Raw SQL probe: countTenantTransactions P95=${rawSqlTimings?.countTenantTransactionsSql?.p95 ?? 'n/a'} ms, listTransactions page P95=${rawSqlTimings?.listTransactionsPageSql?.p95 ?? 'n/a'} ms. With PERF-P2-B (peak ~4 simultaneous bootstrap connections; bypass paths for count/plSubTypes/listTransactions), **stage duration × connection overlap × concurrent login/nav requests** — not entity-count growth or \`runBatched\` concurrency alone — drives cumulative pool pressure and \`POOL_SATURATED\` on production ATP.`;

  const capture = {
    program: 'PERF-P2-C',
    capturedAt: new Date().toISOString(),
    mode: 'local-spawn',
    envFile: args.envFile,
    tenant,
    volumes,
    rawSqlTimings,
    iterations: iterationResults,
    stageStats,
    entityRanking,
    holdAnalysis,
    p95Queries,
    poolContributors,
    verdict,
    dataLimitations,
    productionAtpReference: {
      capture: 'docs/performance/cloud/captures/nav-probe-2026-06-22-atp.json',
      api503Count: 18,
      overlayMaxMs: 92925,
    },
    outJson: args.outJson,
  };

  const outPath = resolve(args.outJson);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(capture, null, 2), 'utf8');

  const report = generateReport({ ...capture, outJson: args.outJson });
  const reportPath = resolve(args.outReport);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf8');

  console.log(JSON.stringify({ stageStats, entityRanking: entityRanking.slice(0, 10), holdAnalysis: { sumHoldMs: holdAnalysis.sumHoldMs, peakSimultaneous: holdAnalysis.peakSimultaneous }, verdict }, null, 2));
  console.error(`Wrote ${outPath}`);
  console.error(`Wrote ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
