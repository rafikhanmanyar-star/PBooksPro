# Performance Baseline Report (Phase 1)

**Environment:** Production cloud (`app.pbookspro.com` → `api.pbookspro.com`)  
**Date:** 2026-06-22  
**Tenant:** ATP (Admin)  
**Deploy:** `2026.06.22.daae718` (package `1.2.463`)  
**Status:** Partial baseline — client nav probe complete; server JWT probe and startup export pending  

**Primary capture:** [`../captures/nav-probe-2026-06-22-atp.json`](../captures/nav-probe-2026-06-22-atp.json)

---

## Executive summary

Production cloud navigation is **severely degraded** under normal multi-module use. The dominant failure mode is **`503 POOL_SATURATED`** on `/state/bulk` and `/state/bulk-chunked`, which keeps the **“Loading data…”** overlay visible for **4.6 s to 92.9 s** per navigation cycle (target: **< 500 ms**).

Login succeeds independently of bootstrap failures — users reach the dashboard while bulk state loads fail and retry in the background.

**No optimizations authorized** until this report and Phase 3 pool analysis are signed off.

---

## Measurement sources

| Source | File / method | Status |
|--------|---------------|--------|
| Nav overlay probe | `nav-probe-2026-06-22-atp.json` | ✅ Captured |
| Server endpoint probe | `phase1-baseline.json` | ⚠️ 401 — JWT not supplied to script |
| Client startup milestones | `startup-client.json` | ⏳ Not captured (`PBOOKS_STARTUP_PERF=1` + fresh login) |
| Pool sampling | `/monitoring/pool-pressure` | ⏳ Requires `PBOOKS_PERF_POOL_SAMPLE=1` on Render |

---

## Login & bootstrap (observed in DevTools)

| Step | Endpoint | Typical result |
|------|----------|----------------|
| Authenticate | `POST /auth/unified-login` | ✅ 200 (prior 401 = bad credentials on a failed attempt, not outage) |
| Paginated bootstrap | `GET /state/bulk-chunked?limit=200&offset=0` | ❌ 503 during pool pressure |
| Full bootstrap | `GET /state/bulk` | ❌ 503 during pool pressure |

**Error class:** `POOL_SATURATED` — intentional load shedding when Postgres pool has `idle=0` and `waitingCount ≥ 12` (default).

---

## Navigation overlay baseline (client probe)

Measured with `scripts/perf/nav-overlay-probe.browser.js` while logged in as Admin (ATP).

### Overlay duration (`overlay_hide` − `overlay_show`)

| Metric | Value | Target |
|--------|------:|-------:|
| **Maximum** | **92,925 ms (~93 s)** | < 500 ms |
| **Minimum (when cleared)** | **4,642 ms (~5 s)** | < 500 ms |
| **Median (4 samples)** | **~45 s** | < 500 ms |
| **Session with zero hides** | 76 s, 7 nav clicks | Should always hide |

### Navigation session

| Metric | Value |
|--------|------:|
| Modules clicked (rapid sequence) | 7 in ~42 s |
| Path | Dashboard → Ledger → Dashboard → Accounting → Inv Mgmt → Project → Rental |
| API 503 errors (bulk paths only) | **18** over ~171 s |
| Endpoints failing | `/state/bulk` (12×), `/state/bulk-chunked` (6×) |
| Primary trigger nav | Rental click (`nav-1782139021569`) |

### UX interpretation

The overlay in `App.tsx` stays visible while `isAppDataLoading || isPageGroupMounting` is true. Under 503 retry storms, bulk hydration never completes promptly — users see **“Loading data…” for tens of seconds to minutes**, including when revisiting modules (`MAX_PERSISTENT_PAGES = 3` LRU eviction).

---

## Server probe (automated script — incomplete)

`phase1-baseline.json` was run at `2026-06-22T13:49:04Z` without a valid JWT:

| Endpoint group | Result |
|----------------|--------|
| Shell (`/permissions/me`, `/tenants/license-status`) | 401 |
| Bootstrap (`/state/bulk-chunked`) | 401 |
| Dashboard (`/activity`, `/metrics`, `/snapshots`, `/charts`) | 401 |

**Action:** Re-run `npm run perf:cloud:baseline` with `$env:PBooks_BENCHMARK_TOKEN` set to a fresh production JWT to populate p50/p95 latency rows.

---

## Ranked bottlenecks (Phase 1 evidence)

| Rank | Bottleneck | Severity | Evidence |
|-----:|------------|----------|----------|
| 1 | Postgres pool saturation → 503 on bulk reads | **Critical** | 18× 503 on bulk endpoints |
| 2 | Client retry storm on failed bulk loads | **Critical** | Alternating bulk + bulk-chunked 503s ~3–15 s apart |
| 3 | Full-screen overlay held during bulk retries | **Critical** | Up to 93 s visible; 0 hides in first session |
| 4 | LRU 3-page cache + lazy remount | **High** | Every new module retriggers chunk + deferred bootstrap |
| 5 | Deferred `GET /state/bulk?entities=…` per module | **High** | First 503 after Project construction nav |
| 6 | Rapid multi-click navigation | **High** | 7 modules / 42 s stacks concurrent bulk work |
| 7 | Login bootstrap incomplete before nav | **Medium** | Overlay already visible at probe install |

---

## Gaps before sign-off

- [ ] Server JWT baseline (`phase1-baseline.json` with valid token)
- [ ] Client startup export (`startup-client.json`)
- [ ] Clean single-nav retest (refresh → login → wait for overlay clear → one module → 60 s wait)
- [ ] Enable `PBOOKS_PERF_POOL_SAMPLE=1` on Render for Phase 3 correlation

---

## Recommended clean retest (single number)

1. Hard refresh on `app.pbookspro.com`
2. Log in; wait on Dashboard until overlay clears (max 120 s)
3. Paste fresh `nav-overlay-probe.browser.js`
4. Click **one** module only; wait 60 s
5. Export JSON → save as `nav-probe-2026-06-22-atp-clean.json`

**Healthy expectation:** one `overlay_hide`, `durationMs < 2000`, zero 503s.  
**Current production (this capture):** 503s + overlay 5–93 s.

---

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Engineering | | | ☐ |
| Product / Ops | | | ☐ |

**Optimization gate:** No fixes until Phase 1–3 baselines reviewed — see [`06-optimization-roadmap.md`](06-optimization-roadmap.md).
