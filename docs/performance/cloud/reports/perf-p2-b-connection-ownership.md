# PERF-P2-B — Bootstrap Connection Ownership Analysis

**Date:** 2026-06-23  
**Capture:** `docs/performance/cloud/captures/perf-p2-b-connection-ownership.json`  
**Script:** `scripts/perf/perf-p2-b-connection-ownership.mjs`  
**Log analysis:** `scripts/perf/analyze-p2b-holds.mjs`

## Executive answer

Reducing `BULK_BOOTSTRAP_CONCURRENCY` from 6→1 **does not reduce P2-A `peakActive`** because that metric is **not measuring bootstrap `runBatched()` fan-out**. It is a **process-wide, 20-second max** over the full login + dashboard flow (and background pool warm-up). Instrumented ownership shows a **single** `GET /state/bulk-chunked?offset=0` request holds at most **4 connections at once** on the bulk route — **the same peak for concurrency 1 and concurrency 6** on an empty tenant.

When bootstrap concurrency is 1, the “remaining” simultaneous connections are **not** extra `runBatched` loaders. They come from **fixed bypass paths**, **auth middleware DB work**, **pipeline hand-off overlap**, and (in benchmarks) **measurement traffic**.

---

## Why P2-A peak stayed ~16–18 for all concurrency values

| Factor | Effect |
|--------|--------|
| **20 s poll window** | `pollPoolDuring(..., 20000, 500)` in P2-A samples pool for 20 s while a ~200–800 ms login flow runs, then continues sampling mostly idle/warm pool state. |
| **Dashboard included** | After bootstrap, P2-A fires **4 parallel** dashboard endpoints (`/dashboard/metrics`, `/snapshots`, `/charts`, `/activity`). |
| **Login shell included** | **2 parallel** calls (`/permissions/me`, `/tenants/license-status`) before bootstrap. |
| **Process-wide metric** | `activeCount = total − idle` is **global** to the API process, not per bootstrap request. |
| **Pool warm-up** | `pool.totalCount` grows toward `PG_POOL_MAX=20` as connections are opened and retained; single-user P2-A often records `peakActive` ≈ 16–18 during/after dashboard, while 3–5 user scenarios oddly peak at 3–4 (timing/sample alignment — not lower real bootstrap demand). |
| **No ownership in P2-A** | P2-A did not enable `PBOOKS_PERF_POOL_OWNERSHIP=1`; peak cannot be attributed to code paths. |

**Conclusion:** P2-A `peakActive` is dominated by **measurement design + post-bootstrap dashboard parallelism + pool retention**, not by `BOOTSTRAP_CONCURRENCY`.

---

## Single bootstrap request — measured ownership

**Environment:** isolated API, port 3003, `test-company`, `PG_POOL_MAX=20`, `BULK_BOOTSTRAP_GLOBAL_SLOTS=8`, ownership enabled (`PBOOKS_PERF_POOL_HOLD_WARN_MS=0`).

### Summary (bootstrap-only, `offset=0`)

| Setting | Request duration | Bulk-route holds | **Peak simultaneous (bulk route only)** | Process peak (incl. poller) |
|---------|------------------|------------------|----------------------------------------|------------------------------|
| `BULK_BOOTSTRAP_CONCURRENCY=1` | ~122 ms | 47 | **4** | **7** |
| `BULK_BOOTSTRAP_CONCURRENCY=6` | ~similar | 47 | **4** | **6–11** |

Each bootstrap request performs **47 connection acquire/release cycles** attributed to `GET /state/bulk-chunked` over **~50–85 ms** (empty tenant). Only **4** of those overlap at any instant — **unchanged** when concurrency drops 6→1.

---

## Waterfall — one request (`BULK_BOOTSTRAP_CONCURRENCY=1`)

Relative times from first bulk-route `acquireAt` (request `cd3e3a5a…`, empty tenant):

```
Bootstrap HTTP request enters (auth middleware)
│
├─ t+0ms    Connection A acquired  (hold ~4ms)  ← auth peekV2Versions / early pool.query
├─ t+2ms    Connection B acquired  (hold ~4ms)  ← overlaps A (pipeline / countTenantTransactions)
├─ t+4ms    Connection A released
├─ t+5ms    Connection C acquired  (hold ~4ms)  ← countTenantTransactions or 1st guarded loader
├─ t+6ms    Connection B released
├─ t+9ms    Connection C released
│
├─ t+16ms   Connection D acquired  (hold ~4ms)  ← runBatched loader (batch size 1)
├─ t+19–40ms  Serial loader cycle: acquire → ~2–4ms hold → release (~every 2ms)
│             Peak overlap in this window = 4 (release lag + next acquire)
│
├─ …        21 static entity loaders (guarded), one connection at a time
│
├─ ~t+45ms  fetchPlSubTypesForTenant — unguarded withPoolClient (sequential after loaders)
├─ ~t+50ms  listTransactions chunk   — unguarded withPoolClient
│
└─ t+74ms   Last bulk-route connection released
```

**Overlap period (conc=1):** connections A–D above can coexist for **~4–9 ms windows** at the start; later loaders mostly serialize but **micro-overlap** (next `connect()` before prior `release()` completes in the tracker) sustains **peak = 4**.

**Overlap period (conc=6):** first batch starts up to 6 thunks, but **connect completion is staggered** (+0, +2, +3, +6, +8, +10 ms). Early loaders **release in ~6 ms** before later ones finish acquiring → **measured peak still 4**, not 6.

---

## Code paths — connection ownership map

For `GET /state/bulk-chunked?offset=0`:

| Phase | Function | Pool API | Semaphore / runBatched | Notes |
|-------|----------|----------|------------------------|-------|
| 0 | `authMiddleware` → `peekV2Versions` | `pool.query()` | **Bypass** | Every authenticated request; attributed to bulk route in ownership context |
| 1 | `countTenantTransactions()` | `pool.query()` | **Bypass** | Runs before any loader; sequential |
| 2 | `getBulkAppState()` → 21 entity loaders | `withPoolClientGuarded` → `connect()` | **runBatched(N)** + global semaphore (8) | Only this phase respects `BULK_BOOTSTRAP_CONCURRENCY` |
| 3 | `fetchPlSubTypesForTenant()` | `withPoolClient()` | **Bypass** | After all loaders; unguarded |
| 4 | `listTransactions()` chunk page | `withPoolClient()` | **Bypass** | After static entities; unguarded |

**Skipped loaders (no connection):** `transactions`, `vendors`, `quotations`, `documents`, `transactionLog`, `personalTransactions` — filtered by `BULK_BOOTSTRAP_STATIC_ENTITIES`.

**Not on bootstrap-only request:** dashboard endpoints (P2-A adds these after bootstrap).

---

## Investigation checklist (items 1–6)

### 1. `countTenantTransactions()`

- **1×** `getPool().query()` per chunked bootstrap.
- **Bypasses** semaphore and `runBatched`.
- Always runs **before** static entity loaders.

### 2. `fetchPlSubTypesForTenant()`

- **1×** `withPoolClient()` after batched loaders.
- **Bypasses** semaphore (explicit comment in `appStateBulkService.ts`).
- Sequential with loaders; does not multiply with concurrency setting.

### 3. Transaction page loading

- **1×** `withPoolClient()` → `listTransactions(..., { limit, offset })` on **every** chunked call (including `offset=0`).
- **Bypasses** semaphore.
- Separate from inner `transactions` loader (which is **skipped** in static filter).

### 4. Dashboard startup endpoints

- **Not part of bootstrap handler.**
- P2-A **`simulateUserLoginFlow`** runs **4 parallel** dashboard routes after bootstrap — primary contributor to **process-wide** `peakActive` in P2-A single-user runs.
- Each uses `authMiddleware` (peek query) plus route-specific DB work.

### 5. Global bootstrap semaphore

- `_bsgAcquire()` / `BOOTSTRAP_GLOBAL_POOL_SLOTS=8` caps **guarded loader** acquisitions process-wide.
- Does **not** apply to count, plSubTypes, transaction chunk, or auth.
- With **one user**, semaphore is **not** the limiter; measured bulk peak is **4**, not 8.

### 6. Loaders bypassing `runBatched()`

Confirmed bypass paths (always active on `offset=0`):

1. `countTenantTransactions`
2. `fetchPlSubTypesForTenant`
3. `listTransactions` (chunk)
4. `authMiddleware` DB (peek and/or full auth on cache miss)

---

## What specifically consumes connections when concurrency = 1?

| Consumer | Parallel with loaders? | Bounded by conc=1? |
|----------|------------------------|-------------------|
| Auth `peekV2Versions` | Yes (middleware, same request) | No |
| `countTenantTransactions` | Overlaps first loader hand-off | No |
| 21× guarded entity loaders | **No** (batch size 1) | **Yes** |
| `fetchPlSubTypesForTenant` | Sequential after loaders | No |
| `listTransactions` chunk | Sequential after plSubTypes | No |
| Pipeline release/acquire overlap | Up to **4** concurrent on route | No |
| Benchmark `pool-pressure` poller (P2-B) | Yes | No |

**At concurrency 1, peak simultaneous bulk-route connections (4) equals concurrency 6** because:

1. Loader batch parallelism is **not** the dominant overlap (staggered connects + fast holds cap batch overlap at ~4 even for batch size 6).
2. **Fixed bypass paths** (auth + count + plSubTypes + tx page) add **2–3** connections outside `runBatched`.
3. **Micro-overlap** between sequential `connect()`/`release()` cycles adds **+1** to peak.

---

## Evidence files

- JSON capture: `docs/performance/cloud/captures/perf-p2-b-connection-ownership.json`
- P2-A benchmark (unchanged peak): `docs/performance/cloud/captures/perf-p2-a-concurrency-benchmark.json`
- Raw `[POOL_HOLD]` log: agent run output (1050 events, 4 bulk-chunked request IDs)

---

## Methodology note

No production behavior was changed. Measurements used temporary env flags on an isolated API instance only.

**Recommended follow-up (measurement only):** re-run P2-A with (a) pool ownership enabled, (b) poll window limited to bootstrap request duration, (c) dashboard phase separated — to confirm P2-A peak decomposition without code changes.
