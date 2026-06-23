# Connection Pool Analysis Report (Phase 3)

**Environment:** Production cloud (`api.pbookspro.com`)  
**Date:** 2026-06-22  
**Tenant context:** ATP (Admin navigation probe)  
**Pool max (PG_POOL_MAX):** **20** (code default; confirm Render env)  
**Shed threshold (PG_POOL_SHED_WAITING):** **12** (default)  
**Bulk concurrency (BULK_BOOTSTRAP_CONCURRENCY):** **6** (default)  
**Bulk global slots (BULK_BOOTSTRAP_GLOBAL_SLOTS):** **8** (default)  

**Primary capture:** [`../captures/nav-probe-2026-06-22-atp.json`](../captures/nav-probe-2026-06-22-atp.json)

**Status:** **Inferred from client 503 evidence** — live `pool-pressure` / `perf-baseline` samples not yet captured on Render.

---

## Executive summary

Production navigation triggered a **sustained pool saturation event**: **18 consecutive `503` responses** on `/state/bulk` and `/state/bulk-chunked` over **~171 seconds**, all consistent with server-side **`POOL_SATURATED`** shedding. No other API paths appeared in the error log — bulk state reads monopolize pool capacity during bootstrap and deferred module loads.

---

## Scenarios

Formal scenario scripts (`npm run perf:cloud:pool -- --scenario <name>`) require JWT + `PBOOKS_PERF_POOL_SAMPLE=1`. Rows below combine **script placeholders** with **nav-probe inference**.

| Scenario | Peak activeCount | Peak waitingCount | Saturated samples | Notes |
|----------|----------------:|------------------:|------------------:|-------|
| Login | _pending_ | _pending_ | **Yes (DevTools)** | 503 on `bulk-chunked` at login reported separately |
| Dashboard | _pending_ | _pending_ | **Likely** | Overlay visible at probe install on Dashboard |
| **Navigation (rapid, 7 modules)** | _pending_ | **≥ 12 (inferred)** | **18× HTTP 503** | See capture window 14:36:59–14:39:50 UTC |
| Reports | _pending_ | _pending_ | _not measured_ | |
| Payroll | _pending_ | _not measured_ | _not measured_ | Out of scope for this capture |

---

## Client-side saturation timeline (Rental nav `nav-1782139021569`)

| Time (UTC) | Endpoint | Status |
|------------|----------|-------:|
| 14:37:35 | `/state/bulk-chunked` | 503 |
| 14:37:45 | `/state/bulk` | 503 |
| 14:37:51 | `/state/bulk` + `/state/bulk-chunked` | 503 |
| 14:37:54 – 14:39:50 | Alternating bulk / bulk-chunked | 503 (14 more) |

**Pattern:** Retry storm — client backoff + parallel refresh paths re-queue bulk work while pool remains saturated.

---

## Pool metrics definitions

| Metric | Source |
|--------|--------|
| **activeCount** | `total − idle` (connections in use) |
| **idleCount** | `pool.idleCount` |
| **waitingCount** | `pool.waitingCount` (queued acquires) |

**Shed rule** (`backend/src/db/pool.ts`): when `idle === 0` and `waitingCount ≥ PG_POOL_SHED_WAITING` (default **12**), heavy routes return **503** before acquiring a connection.

**Affected routes** (`stateRoutes.ts`): `GET /state/bulk`, `GET /state/bulk-chunked`.

---

## Slow routes under pressure

_From nav probe (client) — server `perf-baseline` slowAcquireRoutes pending._

| Route | Observed failures | Window | Impact |
|-------|------------------:|--------|--------|
| `GET /state/bulk` | **12** | ~171 s | Deferred module bootstrap |
| `GET /state/bulk-chunked` | **6** | ~171 s | Login / refresh paginated state |
| Other routes | **0** in capture | — | Bulk paths dominate |

---

## Causal model

```
Navigation / login
  → bulk-chunked + deferred bulk (parallel)
  → pool active = max, waiting ≥ 12
  → POOL_SATURATED 503
  → client withBulkLoadResilience retries
  → more bulk requests
  → overlay stays up (5–93 s)
```

**Contributing client factors** (measurement only, not fixes):

- `withBulkLoadResilience` — up to 3 attempts per call
- Parallel `refreshFromApi` / init merge on login
- `usePageGroupDeferredBootstrap` — per-module `/state/bulk?entities=…`
- `MAX_PERSISTENT_PAGES = 3` — remount + re-fetch on eviction

---

## Render / server actions (measurement phase)

Enable on API service before re-running Phase 3 scripts:

```env
PBOOKS_PERF_POOL_SAMPLE=1
PBOOKS_PERF_BASELINE_EXPORT=1
```

Then:

```powershell
$env:PBooks_BENCHMARK_TOKEN = "<JWT>"
$env:PBooks_API_BASE = "https://api.pbookspro.com/api/v1"
npm run perf:cloud:pool -- --scenario dashboard
```

Correlate `[POOL_SHED]` / `[POOL_PRESSURE]` log lines around **14:36–14:40 UTC** with capture timestamps.

---

## Recommendations (deferred until sign-off)

| Priority | Investigation lead | Rationale |
|----------|-------------------|-----------|
| P0 | Confirm Render `PG_POOL_MAX` vs Postgres max connections | Default 20 may be insufficient for bulk concurrency 6 × global slots 8 |
| P0 | Log `waitingCount` at each 503 during nav probe window | Validates shed threshold trigger |
| P0 | Count concurrent bulk + bulk-chunked requests per nav | Explains retry storm |
| P1 | Tune `BULK_BOOTSTRAP_GLOBAL_SLOTS` / `BULK_BOOTSTRAP_CONCURRENCY` | Reduce parallel pool hold time |
| P1 | Review shed threshold `PG_POOL_SHED_WAITING` | Trade fast-fail vs queue depth |

**Do not implement** until Phase 1 baseline and this report are signed off.

---

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Engineering | | | ☐ |
