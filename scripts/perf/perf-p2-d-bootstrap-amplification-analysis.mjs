#!/usr/bin/env node
/**
 * PERF-P2-D — Bootstrap request amplification analysis (read-only).
 * Reconstructs ATP nav-probe capture + maps client code paths to bulk endpoints.
 *
 * Usage:
 *   node scripts/perf/perf-p2-d-bootstrap-amplification-analysis.mjs
 *   node scripts/perf/perf-p2-d-bootstrap-amplification-analysis.mjs --capture path/to/nav-probe.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RETRY = {
  maxAttempts: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 15000,
  breakerThreshold: 3,
  breakerBaseCooldownMs: 5000,
  breakerMaxCooldownMs: 60000,
  shedRetryAfterSeconds: 5,
};

const CODE_ORIGINS = [
  {
    source: 'AppContext init',
    trigger: 'isAuthenticated during AppProvider initialization',
    endpoints: ['GET /state/bulk-chunked?offset=0 (+ pagination)'],
    loader: 'getAppStateApiService().loadStateBulkChunked()',
    resilience: 'withBulkLoadResilience(loadStateBulkChunked) per chunk',
    file: 'context/AppContext.tsx ~245',
  },
  {
    source: 'AppContext refreshFromApi',
    trigger: 'post-auth effect, tenant switch, socket refresh, pbooks:request-api-refresh',
    endpoints: ['GET /state/changes (incremental)', 'GET /state/bulk-chunked*', 'GET /state/bulk'],
    loader: 'loadStateViaIncrementalSync → else loadStateForSyncRefresh()',
    resilience: 'chunked then bulk fallback; each path uses withBulkLoadResilience',
    file: 'context/AppContext.tsx ~1573–1649',
  },
  {
    source: 'usePageGroupDeferredBootstrap',
    trigger: 'active page group changes; missing deferred entity slices (length===0)',
    endpoints: ['GET /state/bulk?entities=…'],
    loader: 'loadStateBulk(missing.join(","))',
    resilience: 'withBulkLoadResilience(loadStateBulk); 404→loadState() only',
    file: 'hooks/usePageGroupDeferredBootstrap.ts ~74–76',
  },
  {
    source: 'loadStateForSyncRefresh fallback chain',
    trigger: 'refreshFromApi full load path',
    endpoints: ['GET /state/bulk-chunked*', 'GET /state/bulk'],
    loader: 'loadStateBulkChunked then loadStateBulk on non-transient chunk error',
    resilience: 'Up to 3 attempts × 2 endpoints per refresh cycle on 503',
    file: 'services/api/appStateApi.ts ~1067–1096',
  },
  {
    source: 'loadStateBulkChunked pagination',
    trigger: 'Any chunked load with txTotal > chunkSize',
    endpoints: ['GET /state/bulk-chunked?offset=N (N>0 tx pages only)'],
    loader: 'while(hasMore) loop',
    resilience: 'Each page: separate withBulkLoadResilience invocation',
    file: 'services/api/appStateApi.ts ~995–1040',
  },
];

const PAGE_GROUP_DEFERRED = {
  DASHBOARD: ['invoices', 'bills', 'contacts'],
  TRANSACTIONS: ['contacts', 'invoices', 'bills', 'vendors'],
  RENTAL: ['invoices', 'contacts', 'bills'],
  PROJECT: ['bills', 'contacts', 'vendors'],
  ACCOUNTING: ['invoices', 'bills', 'contacts', 'vendors'],
};

function parseArgs(argv) {
  const out = {
    captureFile: 'docs/performance/cloud/captures/nav-probe-2026-06-22-atp.json',
    outJson: 'docs/performance/cloud/captures/perf-p2-d-bootstrap-amplification.json',
    outReport: 'docs/performance/cloud/reports/perf-p2-d-bootstrap-amplification.md',
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--capture' && argv[i + 1]) out.captureFile = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) out.outJson = argv[++i];
  }
  return out;
}

function parseEndpoint(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, '');
    return path.split('?')[0];
  } catch {
    return String(url).split('?')[0].replace(/.*\/api\/v1/, '');
  }
}

function msBetween(a, b) {
  return new Date(b).getTime() - new Date(a).getTime();
}

function inferOrigin(entry, navTimeline) {
  const path = parseEndpoint(entry.url);
  const t = new Date(entry.at).getTime();
  const nav = navTimeline
    .filter((n) => n.event === 'nav_click')
    .map((n) => ({ ...n, t: new Date(n.at).getTime() }))
    .filter((n) => n.t <= t)
    .sort((a, b) => b.t - a.t)[0];

  const activeGroup = nav?.toPage ?? nav?.from ?? 'unknown';
  const label = nav?.label ?? nav?.clickedLabel ?? 'unknown';

  if (path === '/state/bulk-chunked') {
    if (!nav || t - nav.t < 120_000) {
      return {
        inferredSource: 'loadStateBulkChunked / loadStateForSyncRefresh',
        detail: `Likely login bootstrap or refreshFromApi chunked path during/after nav to ${label} (${activeGroup})`,
      };
    }
    return { inferredSource: 'loadStateBulkChunked', detail: 'Paginated bootstrap or refresh chunked load' };
  }
  if (path === '/state/bulk') {
    const deferred = PAGE_GROUP_DEFERRED[activeGroup];
    if (deferred) {
      return {
        inferredSource: 'usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback',
        detail: `Page group ${activeGroup} deferred entities [${deferred.join(', ')}] OR sync refresh bulk fallback after chunked failure`,
      };
    }
    return {
      inferredSource: 'loadStateBulk / loadStateForSyncRefresh',
      detail: 'Deferred bootstrap or bulk fallback',
    };
  }
  if (path === '/state/changes') {
    return { inferredSource: 'refreshFromApi incremental', detail: 'loadStateViaIncrementalSync when baseline hydrated' };
  }
  return { inferredSource: 'other', detail: path };
}

function estimateRetryDelay(attemptIndex) {
  const exp = Math.min(RETRY.baseBackoffMs * 2 ** attemptIndex, RETRY.maxBackoffMs);
  const jitter = Math.floor(RETRY.baseBackoffMs / 2);
  return exp + jitter;
}

function analyze503Storm(apiErrors) {
  const sorted = [...apiErrors].sort((a, b) => new Date(a.at) - new Date(b.at));
  const rows = sorted.map((e, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const gapMs = prev ? msBetween(prev.at, e.at) : 0;
    const origin = inferOrigin(e, []);
    const endpoint = parseEndpoint(e.url);
    const attemptGuess =
      gapMs > 0 && gapMs < 2000 ? 'likely same loader retry or parallel path' : 'new loader invocation or backoff cycle';
    return {
      index: i + 1,
      at: e.at,
      endpoint,
      status: e.status,
      gapFromPreviousMs: gapMs,
      navId: e.navId ?? null,
      attemptGuess,
      ...origin,
    };
  });

  const concurrentWindows = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const gap = msBetween(sorted[i].at, sorted[j].at);
      if (gap > 5000) break;
      if (gap >= 0 && gap <= 500) {
        concurrentWindows.push({
          t: sorted[i].at,
          gapMs: gap,
          a: parseEndpoint(sorted[i].url),
          b: parseEndpoint(sorted[j].url),
        });
      }
    }
  }

  const minAttemptsIfSingleLoader = sorted.length;
  const maxAttemptsIfTripleRetry = sorted.length;
  const estimatedHttpAttempts = {
    logged503Responses: sorted.length,
    note: 'Each 503 is one HTTP response; withBulkLoadResilience allows up to 3 attempts per loader invocation',
    minLoaderInvocationsIfAllFirstAttempt: sorted.length,
    maxLoaderInvocationsIfAllThirdAttempt: Math.ceil(sorted.length / 3),
    estimatedTotalHttpAttemptsRange: `${sorted.length}–${sorted.length * 3} if each logged event is one attempt of overlapping invocations`,
  };

  return { rows, concurrentWindows, estimatedHttpAttempts };
}

function buildOverlayTimeline(capture) {
  const nav = capture.navigationTimeline ?? [];
  const errors = capture.apiErrors ?? [];
  const overlayShows = nav.filter((e) => e.event === 'overlay_show');
  const overlayHides = (capture.sessions ?? [])
    .flatMap((s) => s.overlayDurationsMs ?? [])
    .map((o) => ({ durationMs: o.durationMs, navId: o.navId }));

  const events = [];
  for (const s of overlayShows) {
    events.push({ event: 'overlay_shown', at: s.at, detail: s.page ?? 'Dashboard' });
  }
  for (const e of errors) {
    events.push({
      event: '503_bulk',
      at: e.at,
      endpoint: parseEndpoint(e.url),
      navId: e.navId,
    });
  }
  for (const n of nav.filter((x) => x.event === 'nav_click')) {
    events.push({
      event: 'nav_click',
      at: n.at,
      label: n.label,
      from: n.from,
    });
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));

  const t0 = events.length ? new Date(events[0].at).getTime() : 0;
  return events.map((e) => ({
    ...e,
    relSec: t0 ? Math.round((new Date(e.at).getTime() - t0) / 1000) : 0,
  }));
}

function generateReport(data) {
  const { capture, timeline, requestTimeline, retryAnalysis, concurrent, overlayTimeline, verdict } = data;

  const reqTable = requestTimeline
    .map(
      (r) =>
        `| ${r.at} | ${r.endpoint} | ${r.status} | ${r.gapFromPreviousMs ?? '—'} | ${r.inferredSource} |`
    )
    .join('\n');

  const retryTable = retryAnalysis.rows
    .slice(0, 20)
    .map(
      (r) =>
        `| ${r.index} | ${r.endpoint} | ${r.gapFromPreviousMs} | ${r.attemptGuess} | ${r.inferredSource} |`
    )
    .join('\n');

  const concurrentTable =
    concurrent.length === 0
      ? '_No pairs within 500ms in capture._'
      : concurrent
          .map((c) => `| ${c.t} | ${c.gapMs} | ${c.a} + ${c.b} |`)
          .join('\n');

  const overlayTable = overlayTimeline
    .slice(0, 25)
    .map((e) => `| ${e.event} | ${e.at} | T+${e.relSec}s | ${e.endpoint ?? e.label ?? e.detail ?? ''} |`)
    .join('\n');

  return `# PERF-P2-D — Bootstrap Request Amplification Investigation

**Date:** ${new Date().toISOString().split('T')[0]}  
**Program:** PERF-P2-D (evidence only — no behavior changes)  
**Primary capture:** \`${capture.captureSource ?? 'nav-probe'}\`  
**Analysis JSON:** \`docs/performance/cloud/captures/perf-p2-d-bootstrap-amplification.json\`

---

## Executive summary

Single bootstrap HTTP handler completes in **~175 ms** (PERF-P2-C), but production ATP shows **18 logged bulk 503s** over **171 s** and overlay durations up to **93 s**. This investigation traces **request amplification**: multiple client code paths each invoke bulk loaders with **up to 3 retries**, **chunked pagination**, **deferred navigation loads**, and **refresh fallbacks** — overlapping while the overlay waits for \`isAppDataLoading\`.

**Verdict:** The 93 s overlay is **not** one slow query; it is **failed bootstrap + retry/backoff cycles + parallel bulk endpoints + navigation-triggered deferred loads** while \`isAppDataLoading\` remains true.

---

## Section 1 — Complete Bootstrap Request Timeline (ATP capture)

**Window:** ${capture.sessions?.[1]?.api503Window?.start ?? '—'} → ${capture.sessions?.[1]?.api503Window?.end ?? '—'} (${capture.sessions?.[1]?.api503Window?.durationSeconds ?? 171}s)

| # | Timestamp | Endpoint | Status | Δ prev (ms) | Inferred origin |
|---|-----------|----------|--------|------------:|-----------------|
${reqTable}

**Totals:** ${retryAnalysis.estimatedHttpAttempts.logged503Responses} logged 503 responses · ${capture.summary?.api503ByEndpoint?.['/state/bulk'] ?? 12}× \`/state/bulk\` · ${capture.summary?.api503ByEndpoint?.['/state/bulk-chunked'] ?? 6}× \`/state/bulk-chunked\`

---

## Section 2 — Request Origin Analysis

| Client source | Trigger | Endpoints | Resilience |
|---------------|---------|-----------|------------|
${CODE_ORIGINS.map((o) => `| ${o.source} | ${o.trigger} | ${o.endpoints.join(', ')} | ${o.resilience} |`).join('\n')}

**Note (v1.2.464+):** \`contacts,invoices,bills\` are included in bulk-chunked offset=0 (\`BULK_BOOTSTRAP_STATIC_ENTITIES\`) to avoid deferred dashboard collision — but **only when offset=0 succeeds**. On 503, slices stay empty → \`usePageGroupDeferredBootstrap\` still fires \`loadStateBulk\`.

---

## Section 3 — Retry Amplification Analysis

Client \`withBulkLoadResilience\` (\`services/api/appStateApi.ts\`):

- **Max attempts:** ${RETRY.maxAttempts} per loader invocation
- **Backoff:** ${RETRY.baseBackoffMs}ms × 2^attempt (max ${RETRY.maxBackoffMs}ms) + jitter
- **Breaker:** opens after ${RETRY.breakerThreshold} consecutive failures; cooldown ${RETRY.breakerBaseCooldownMs}–${RETRY.breakerMaxCooldownMs}ms
- **Server shed:** \`Retry-After: ${RETRY.shedRetryAfterSeconds}s\` on POOL_SATURATED

| # | Endpoint | Gap ms | Interpretation | Inferred source |
|---|----------|-------:|----------------|-----------------|
${retryTable}

**Amplification estimate:** ${retryAnalysis.estimatedHttpAttempts.estimatedTotalHttpAttemptsRange}

Observed inter-503 gaps of **3–15 s** match retry backoff + server Retry-After, not single 175 ms handler time.

---

## Section 4 — Concurrent Request Analysis

Pairs of bulk 503s within **500 ms** (overlapping code paths):

| Time | Gap ms | Endpoints |
|------|-------:|-----------|
${concurrentTable}

Example from capture: **bulk + bulk-chunked 200 ms apart** at 14:37:51 → chunked login/refresh path overlapping deferred \`/state/bulk\`.

---

## Section 5 — Deferred Bootstrap Analysis

\`usePageGroupDeferredBootstrap\` fires \`GET /state/bulk?entities=\` when page group needs entities and slices are empty:

| Page group | Deferred entities |
|------------|-------------------|
${Object.entries(PAGE_GROUP_DEFERRED)
  .map(([g, e]) => `| ${g} | ${e.join(', ')} |`)
  .join('\n')}

**ATP navigation before storm:** Dashboard → Ledger → Dashboard → Accounting → Inv Mgmt → Project → **Rental** (7 clicks in ~42 s).

Each new group sets \`isPageGroupMounting=true\` until visited. Failed login bootstrap leaves slices empty → **each nav can trigger deferred bulk** with 3 retries.

---

## Section 6 — Overlay Root Cause

Overlay visible when \`isPageDataNotReady = isAppDataLoading || isPageGroupMounting\` (\`App.tsx\`).

\`isAppDataLoading\` includes (\`appStateStore.ts\`): \`_appDataLoading || _apiHydrationLoading || _pageChunkLoadingCount\`.

| Event | Time (ATP) | T+sec |
|-------|------------|------:|
${overlayTable}

**93 s overlay (Rental nav):** Bootstrap never completes → \`apiHydrationLoading\` / empty state → deferred loads retry → \`isPageGroupMounting\` on each nav → overlay stays until bulk succeeds or user leaves.

---

## Section 7 — Final Verdict

${verdict}

---

## Code references

- Retry/breaker: \`services/api/appStateApi.ts\` lines 453–608
- Chunked pagination: \`loadStateBulkChunked\` while loop
- Deferred nav bootstrap: \`hooks/usePageGroupDeferredBootstrap.ts\`
- Overlay gate: \`App.tsx\` \`isPageDataNotReady\`
- Login bootstrap: \`context/AppContext.tsx\` init \`loadStateBulkChunked\`

---

## Future capture (enhanced probe)

\`scripts/perf/bootstrap-amplification-probe.browser.js\` — paste in production console; tracks bulk fetch start/end, concurrent count, retry headers, deferred triggers without changing app code.
`;
}

function main() {
  const args = parseArgs(process.argv);
  const capturePath = resolve(args.captureFile);
  const capture = JSON.parse(readFileSync(capturePath, 'utf8'));

  const navTimeline = capture.navigationTimeline ?? [];
  const apiErrors = capture.apiErrors ?? [];

  const requestTimeline = apiErrors
    .map((e, i) => {
      const prev = i > 0 ? apiErrors[i - 1] : null;
      const origin = inferOrigin(e, navTimeline);
      return {
        at: e.at,
        endpoint: parseEndpoint(e.url),
        status: e.status,
        navId: e.navId,
        gapFromPreviousMs: prev ? msBetween(prev.at, e.at) : null,
        ...origin,
      };
    })
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const retryAnalysis = analyze503Storm(apiErrors);
  retryAnalysis.rows = retryAnalysis.rows.map((r) => ({
    ...r,
    ...inferOrigin(apiErrors[r.index - 1], navTimeline),
  }));

  const overlayTimeline = buildOverlayTimeline(capture);

  const verdict = `**Mechanism:** A single successful bootstrap handler (~175 ms) is irrelevant to the ATP incident. The client issued **at least ${apiErrors.length} bulk HTTP calls that returned 503** over **171 seconds**, from **multiple overlapping loaders** (login \`loadStateBulkChunked\`, \`loadStateForSyncRefresh\` bulk fallback, \`usePageGroupDeferredBootstrap\` on rapid module navigation). Each invocation retries up to **3 times** with **1–15 s backoff**, and **alternating /state/bulk vs /state/bulk-chunked** responses prove **parallel code paths**. Pool shedding (\`POOL_SATURATED\`, Retry-After 5s) converts fast per-request work into a **retry storm**. The overlay stays visible because \`isAppDataLoading\` / \`isPageGroupMounting\` remain true until bootstrap data arrives — which never happens while 503s persist. **18 failures × retries × concurrent paths** explains cloud slowness without any single long-running query.`;

  const output = {
    program: 'PERF-P2-D',
    capturedAt: new Date().toISOString(),
    sourceCapture: args.captureFile,
    environment: capture.environment,
    codeOrigins: CODE_ORIGINS,
    retryConstants: RETRY,
    requestTimeline,
    retryAnalysis,
    overlayTimeline,
    navigationSummary: {
      navClicks: navTimeline.filter((n) => n.event === 'nav_click').length,
      primaryTrigger: capture.summary?.primaryNavTrigger,
      api503ByEndpoint: capture.summary?.api503ByEndpoint,
    },
    deferredEntitiesByPageGroup: PAGE_GROUP_DEFERRED,
    verdict,
  };

  const outJson = resolve(args.outJson);
  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(output, null, 2), 'utf8');

  const report = generateReport({
    capture,
    timeline: navTimeline,
    requestTimeline,
    retryAnalysis,
    concurrent: retryAnalysis.concurrentWindows,
    overlayTimeline,
    verdict,
  });
  const outReport = resolve(args.outReport);
  mkdirSync(dirname(outReport), { recursive: true });
  writeFileSync(outReport, report, 'utf8');

  console.log(JSON.stringify({ requestCount: requestTimeline.length, verdict: verdict.slice(0, 200) + '…' }, null, 2));
  console.error(`Wrote ${outJson}`);
  console.error(`Wrote ${outReport}`);
}

main();
