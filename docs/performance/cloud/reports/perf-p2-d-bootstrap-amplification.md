# PERF-P2-D — Bootstrap Request Amplification Investigation

**Date:** 2026-06-23  
**Program:** PERF-P2-D (evidence only — no behavior changes)  
**Primary capture:** `scripts/perf/nav-overlay-probe.browser.js`  
**Analysis JSON:** `docs/performance/cloud/captures/perf-p2-d-bootstrap-amplification.json`

---

## Executive summary

Single bootstrap HTTP handler completes in **~175 ms** (PERF-P2-C), but production ATP shows **18 logged bulk 503s** over **171 s** and overlay durations up to **93 s**. This investigation traces **request amplification**: multiple client code paths each invoke bulk loaders with **up to 3 retries**, **chunked pagination**, **deferred navigation loads**, and **refresh fallbacks** — overlapping while the overlay waits for `isAppDataLoading`.

**Verdict:** The 93 s overlay is **not** one slow query; it is **failed bootstrap + retry/backoff cycles + parallel bulk endpoints + navigation-triggered deferred loads** while `isAppDataLoading` remains true.

---

## Section 1 — Complete Bootstrap Request Timeline (ATP capture)

**Window:** 2026-06-22T14:36:59.768Z → 2026-06-22T14:39:50.835Z (171s)

| # | Timestamp | Endpoint | Status | Δ prev (ms) | Inferred origin |
|---|-----------|----------|--------|------------:|-----------------|
| 2026-06-22T14:36:59.768Z | /state/bulk | 503 | — | loadStateBulk / loadStateForSyncRefresh |
| 2026-06-22T14:37:35.456Z | /state/bulk-chunked | 503 | 35688 | loadStateBulkChunked / loadStateForSyncRefresh |
| 2026-06-22T14:37:45.157Z | /state/bulk | 503 | 9701 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:37:51.363Z | /state/bulk | 503 | 6206 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:37:51.563Z | /state/bulk-chunked | 503 | 200 | loadStateBulkChunked / loadStateForSyncRefresh |
| 2026-06-22T14:37:54.568Z | /state/bulk | 503 | 3005 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:37:58.661Z | /state/bulk-chunked | 503 | 4093 | loadStateBulkChunked / loadStateForSyncRefresh |
| 2026-06-22T14:38:02.639Z | /state/bulk | 503 | 3978 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:38:15.861Z | /state/bulk | 503 | 13222 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:38:20.669Z | /state/bulk | 503 | 4808 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:38:42.246Z | /state/bulk-chunked | 503 | 21577 | loadStateBulkChunked / loadStateForSyncRefresh |
| 2026-06-22T14:39:06.529Z | /state/bulk-chunked | 503 | 24283 | loadStateBulkChunked |
| 2026-06-22T14:39:13.464Z | /state/bulk | 503 | 6935 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:39:25.572Z | /state/bulk | 503 | 12108 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:39:29.561Z | /state/bulk | 503 | 3989 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:39:30.264Z | /state/bulk-chunked | 503 | 703 | loadStateBulkChunked |
| 2026-06-22T14:39:37.957Z | /state/bulk | 503 | 7693 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 2026-06-22T14:39:50.835Z | /state/bulk | 503 | 12878 | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |

**Totals:** 18 logged 503 responses · 12× `/state/bulk` · 6× `/state/bulk-chunked`

---

## Section 2 — Request Origin Analysis

| Client source | Trigger | Endpoints | Resilience |
|---------------|---------|-----------|------------|
| AppContext init | isAuthenticated during AppProvider initialization | GET /state/bulk-chunked?offset=0 (+ pagination) | withBulkLoadResilience(loadStateBulkChunked) per chunk |
| AppContext refreshFromApi | post-auth effect, tenant switch, socket refresh, pbooks:request-api-refresh | GET /state/changes (incremental), GET /state/bulk-chunked*, GET /state/bulk | chunked then bulk fallback; each path uses withBulkLoadResilience |
| usePageGroupDeferredBootstrap | active page group changes; missing deferred entity slices (length===0) | GET /state/bulk?entities=… | withBulkLoadResilience(loadStateBulk); 404→loadState() only |
| loadStateForSyncRefresh fallback chain | refreshFromApi full load path | GET /state/bulk-chunked*, GET /state/bulk | Up to 3 attempts × 2 endpoints per refresh cycle on 503 |
| loadStateBulkChunked pagination | Any chunked load with txTotal > chunkSize | GET /state/bulk-chunked?offset=N (N>0 tx pages only) | Each page: separate withBulkLoadResilience invocation |

**Note (v1.2.464+):** `contacts,invoices,bills` are included in bulk-chunked offset=0 (`BULK_BOOTSTRAP_STATIC_ENTITIES`) to avoid deferred dashboard collision — but **only when offset=0 succeeds**. On 503, slices stay empty → `usePageGroupDeferredBootstrap` still fires `loadStateBulk`.

---

## Section 3 — Retry Amplification Analysis

Client `withBulkLoadResilience` (`services/api/appStateApi.ts`):

- **Max attempts:** 3 per loader invocation
- **Backoff:** 1000ms × 2^attempt (max 15000ms) + jitter
- **Breaker:** opens after 3 consecutive failures; cooldown 5000–60000ms
- **Server shed:** `Retry-After: 5s` on POOL_SATURATED

| # | Endpoint | Gap ms | Interpretation | Inferred source |
|---|----------|-------:|----------------|-----------------|
| 1 | /state/bulk | 0 | new loader invocation or backoff cycle | loadStateBulk / loadStateForSyncRefresh |
| 2 | /state/bulk-chunked | 35688 | new loader invocation or backoff cycle | loadStateBulkChunked / loadStateForSyncRefresh |
| 3 | /state/bulk | 9701 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 4 | /state/bulk | 6206 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 5 | /state/bulk-chunked | 200 | likely same loader retry or parallel path | loadStateBulkChunked / loadStateForSyncRefresh |
| 6 | /state/bulk | 3005 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 7 | /state/bulk-chunked | 4093 | new loader invocation or backoff cycle | loadStateBulkChunked / loadStateForSyncRefresh |
| 8 | /state/bulk | 3978 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 9 | /state/bulk | 13222 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 10 | /state/bulk | 4808 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 11 | /state/bulk-chunked | 21577 | new loader invocation or backoff cycle | loadStateBulkChunked / loadStateForSyncRefresh |
| 12 | /state/bulk-chunked | 24283 | new loader invocation or backoff cycle | loadStateBulkChunked |
| 13 | /state/bulk | 6935 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 14 | /state/bulk | 12108 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 15 | /state/bulk | 3989 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 16 | /state/bulk-chunked | 703 | likely same loader retry or parallel path | loadStateBulkChunked |
| 17 | /state/bulk | 7693 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |
| 18 | /state/bulk | 12878 | new loader invocation or backoff cycle | usePageGroupDeferredBootstrap OR loadStateForSyncRefresh bulk fallback |

**Amplification estimate:** 18–54 if each logged event is one attempt of overlapping invocations

Observed inter-503 gaps of **3–15 s** match retry backoff + server Retry-After, not single 175 ms handler time.

---

## Section 4 — Concurrent Request Analysis

Pairs of bulk 503s within **500 ms** (overlapping code paths):

| Time | Gap ms | Endpoints |
|------|-------:|-----------|
| 2026-06-22T14:37:51.363Z | 200 | /state/bulk + /state/bulk-chunked |

Example from capture: **bulk + bulk-chunked 200 ms apart** at 14:37:51 → chunked login/refresh path overlapping deferred `/state/bulk`.

---

## Section 5 — Deferred Bootstrap Analysis

`usePageGroupDeferredBootstrap` fires `GET /state/bulk?entities=` when page group needs entities and slices are empty:

| Page group | Deferred entities |
|------------|-------------------|
| DASHBOARD | invoices, bills, contacts |
| TRANSACTIONS | contacts, invoices, bills, vendors |
| RENTAL | invoices, contacts, bills |
| PROJECT | bills, contacts, vendors |
| ACCOUNTING | invoices, bills, contacts, vendors |

**ATP navigation before storm:** Dashboard → Ledger → Dashboard → Accounting → Inv Mgmt → Project → **Rental** (7 clicks in ~42 s).

Each new group sets `isPageGroupMounting=true` until visited. Failed login bootstrap leaves slices empty → **each nav can trigger deferred bulk** with 3 retries.

---

## Section 6 — Overlay Root Cause

Overlay visible when `isPageDataNotReady = isAppDataLoading || isPageGroupMounting` (`App.tsx`).

`isAppDataLoading` includes (`appStateStore.ts`): `_appDataLoading || _apiHydrationLoading || _pageChunkLoadingCount`.

| Event | Time (ATP) | T+sec |
|-------|------------|------:|
| overlay_shown | 2026-06-22T14:36:19.232Z | T+0s | Dashboard |
| nav_click | 2026-06-22T14:36:45.093Z | T+26s | General Ledger |
| nav_click | 2026-06-22T14:36:46.268Z | T+27s | Dashboard |
| nav_click | 2026-06-22T14:36:46.952Z | T+28s | Accounting |
| nav_click | 2026-06-22T14:36:48.825Z | T+30s | Inv Mgmt |
| nav_click | 2026-06-22T14:36:53.407Z | T+34s | Project construction |
| 503_bulk | 2026-06-22T14:36:59.768Z | T+41s | /state/bulk |
| nav_click | 2026-06-22T14:37:01.569Z | T+42s | Rental |
| 503_bulk | 2026-06-22T14:37:35.456Z | T+76s | /state/bulk-chunked |
| 503_bulk | 2026-06-22T14:37:45.157Z | T+86s | /state/bulk |
| 503_bulk | 2026-06-22T14:37:51.363Z | T+92s | /state/bulk |
| 503_bulk | 2026-06-22T14:37:51.563Z | T+92s | /state/bulk-chunked |
| 503_bulk | 2026-06-22T14:37:54.568Z | T+95s | /state/bulk |
| 503_bulk | 2026-06-22T14:37:58.661Z | T+99s | /state/bulk-chunked |
| 503_bulk | 2026-06-22T14:38:02.639Z | T+103s | /state/bulk |
| 503_bulk | 2026-06-22T14:38:15.861Z | T+117s | /state/bulk |
| 503_bulk | 2026-06-22T14:38:20.669Z | T+121s | /state/bulk |
| 503_bulk | 2026-06-22T14:38:42.246Z | T+143s | /state/bulk-chunked |
| 503_bulk | 2026-06-22T14:39:06.529Z | T+167s | /state/bulk-chunked |
| 503_bulk | 2026-06-22T14:39:13.464Z | T+174s | /state/bulk |
| 503_bulk | 2026-06-22T14:39:25.572Z | T+186s | /state/bulk |
| 503_bulk | 2026-06-22T14:39:29.561Z | T+190s | /state/bulk |
| 503_bulk | 2026-06-22T14:39:30.264Z | T+191s | /state/bulk-chunked |
| 503_bulk | 2026-06-22T14:39:37.957Z | T+199s | /state/bulk |
| 503_bulk | 2026-06-22T14:39:50.835Z | T+212s | /state/bulk |

**93 s overlay (Rental nav):** Bootstrap never completes → `apiHydrationLoading` / empty state → deferred loads retry → `isPageGroupMounting` on each nav → overlay stays until bulk succeeds or user leaves.

---

## Section 7 — Final Verdict

**Mechanism:** A single successful bootstrap handler (~175 ms) is irrelevant to the ATP incident. The client issued **at least 18 bulk HTTP calls that returned 503** over **171 seconds**, from **multiple overlapping loaders** (login `loadStateBulkChunked`, `loadStateForSyncRefresh` bulk fallback, `usePageGroupDeferredBootstrap` on rapid module navigation). Each invocation retries up to **3 times** with **1–15 s backoff**, and **alternating /state/bulk vs /state/bulk-chunked** responses prove **parallel code paths**. Pool shedding (`POOL_SATURATED`, Retry-After 5s) converts fast per-request work into a **retry storm**. The overlay stays visible because `isAppDataLoading` / `isPageGroupMounting` remain true until bootstrap data arrives — which never happens while 503s persist. **18 failures × retries × concurrent paths** explains cloud slowness without any single long-running query.

---

## Code references

- Retry/breaker: `services/api/appStateApi.ts` lines 453–608
- Chunked pagination: `loadStateBulkChunked` while loop
- Deferred nav bootstrap: `hooks/usePageGroupDeferredBootstrap.ts`
- Overlay gate: `App.tsx` `isPageDataNotReady`
- Login bootstrap: `context/AppContext.tsx` init `loadStateBulkChunked`

---

## Future capture (enhanced probe)

`scripts/perf/bootstrap-amplification-probe.browser.js` — paste in production console; tracks bulk fetch start/end, concurrent count, retry headers, deferred triggers without changing app code.
