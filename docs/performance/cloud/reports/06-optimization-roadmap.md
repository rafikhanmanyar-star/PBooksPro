# Optimization Roadmap (Draft)

**Program:** Cloud Performance & Scalability  
**Generated:** 2026-06-22  
**Evidence:** [`../captures/nav-probe-2026-06-22-atp.json`](../captures/nav-probe-2026-06-22-atp.json), DevTools login 503 reports, code audit hypotheses  

> **Measurement-only phase.** Do **not** implement fixes until baseline reports **01**, **03**, and stakeholder sign-off are complete.

**Status:** Baseline evidence sufficient to **rank** bottlenecks; all items below remain **deferred**.

---

## Top 10 bottlenecks (ranked by measured impact)

| Rank | Area | Metric | Value | Proposed investigation | Status |
|-----:|---|---|---:|---|---|
| 1 | Postgres pool → bulk 503 | HTTP 503 count | **18** in ~171 s | Enable pool sampling; confirm `PG_POOL_MAX`, Postgres limits, Render instance size | **deferred** |
| 2 | Client bulk retry storm | 503 inter-arrival | **3–15 s** alternating endpoints | Trace `withBulkLoadResilience` + parallel refresh; single-flight bulk per tenant session | **deferred** |
| 3 | Loading overlay duration | `overlayDurationsMs.max` | **92,925 ms** | Decouple overlay from full bulk completion; cap visible wait; show partial page shell | **deferred** |
| 4 | `/state/bulk-chunked` bootstrap | 503 at login + nav | **6+** failures | Reduce payload pages; stagger entity groups; dedupe login refresh | **deferred** |
| 5 | Deferred `/state/bulk?entities=` | 503 after module nav | **12×** bulk failures | Preload critical entity slices during chunked bootstrap | **deferred** |
| 6 | LRU page cache (`MAX_PERSISTENT_PAGES=3`) | Remount on revisit | 7 nav / 42 s test | Raise limit or pin Dashboard + active module; measure memory trade-off | **deferred** |
| 7 | Rapid navigation amplification | Concurrent bulk jobs | 7 clicks / 42 s | Debounce nav overlay; cancel in-flight bootstrap on route change | **deferred** |
| 8 | Duplicate startup requests | Code audit | license-status ×3–4 | Phase 2 matrix: dedupe `applyAuthSession` / LicenseContext / Sidebar | **deferred** |
| 9 | Double `refreshFromApi()` on login | Code audit | parallel effects | Phase 2 matrix: single bootstrap coordinator | **deferred** |
| 10 | Dashboard parallel SQL | Code audit | metrics + charts + snapshots | Phase 4 cold/warm probe; cache TTL tuning | **deferred** |

---

## Optimization categories (post-baseline only)

### P0 — Pool & bootstrap (blocks ERP usability)

1. **Pool capacity** — Validate Render `PG_POOL_MAX` (default 20), `BULK_BOOTSTRAP_GLOBAL_SLOTS` (8), `BULK_BOOTSTRAP_CONCURRENCY` (6) against ATP tenant data volume.
2. **Stop retry amplification** — Ensure one bulk-chunked flight + coordinated deferred bulk; avoid parallel refresh while pool is shedding.
3. **Overlay UX** — Do not hold full-screen block for entire circuit-breaker window when route shell is mountable.

### P1 — Startup & navigation efficiency

4. **Startup deduplication** — license-status, permissions/me, double refresh (Phase 2 matrix).
5. **Page persistence** — Tune `MAX_PERSISTENT_PAGES` or selective preload for high-traffic modules.
6. **Deferred bootstrap** — Batch entity groups server-side; avoid N parallel `/state/bulk` on every module first visit.

### P2 — Dashboard & scale

7. **Dashboard SQL** — `computeSnapshot` parallel queries; snapshot cache TTL.
8. **Large-tenant path** — Phase 5 scalability probe on pakland-scale JWT.
9. **Reporting modules** — Separate pool scenario after P0 stable.

---

## Expected outcomes (after optimization sprint — not started)

| Metric | Current (ATP capture) | Target |
|--------|----------------------:|-------:|
| Overlay max on single nav | 92.9 s | < 2 s |
| Overlay typical | 5–54 s | < 500 ms |
| 503 on bulk during nav | 18 / session | 0 |
| Login bootstrap 503 | Observed | 0 |

---

## Gate checklist before any fix

- [ ] Phase 1 baseline signed off ([`01-performance-baseline.md`](01-performance-baseline.md))
- [ ] Phase 2 startup matrix reviewed ([`02-startup-request-matrix.md`](02-startup-request-matrix.md))
- [ ] Phase 3 pool analysis on Render with sampling ([`03-pool-analysis.md`](03-pool-analysis.md))
- [ ] Phase 4 dashboard cold/warm documented ([`04-dashboard-optimization.md`](04-dashboard-optimization.md))
- [ ] Phase 5 large-tenant comparison captured ([`05-scalability.md`](05-scalability.md))
- [ ] `PBOOKS_PERF_POOL_SAMPLE=1` enabled on production API (measurement window)
- [ ] Stakeholder approval to begin optimization sprint

---

## Next measurement steps (no code)

1. Enable Render env vars (`PBOOKS_PERF_POOL_SAMPLE=1`, `PBOOKS_PERF_BASELINE_EXPORT=1`).
2. Re-run `npm run perf:cloud:baseline` with production JWT.
3. Capture `startup-client.json` after fresh login with `PBOOKS_STARTUP_PERF=1`.
4. Run clean single-nav probe → `nav-probe-2026-06-22-atp-clean.json`.
5. Re-generate roadmap:  
   `npm run perf:cloud:roadmap -- --captures docs/performance/cloud/captures/phase1-baseline.json,docs/performance/cloud/captures/nav-probe-2026-06-22-atp.json`

---

## Sign-off to begin optimization

| Role | Name | Date | Approved |
|------|------|------|----------|
| Engineering lead | | | ☐ |
| Product / Ops | | | ☐ |

**Until signed:** payroll, RBAC, and approval-matrix work remain out of scope for this program per [`doc/CLOUD_PERFORMANCE_SCALABILITY_PROGRAM.md`](../../../../doc/CLOUD_PERFORMANCE_SCALABILITY_PROGRAM.md).
