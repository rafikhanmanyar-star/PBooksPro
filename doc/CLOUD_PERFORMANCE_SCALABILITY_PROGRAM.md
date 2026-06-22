# Cloud Performance & Scalability Program

**Status:** Measurement phase (no optimization until baselines signed off)  
**Authority:** Architecture V2.1 finalized stack · Payroll closed · RBAC V2 closed · Data scope complete  
**Deferred:** Approval Matrix · Payroll logic changes · RBAC logic changes  

---

## Objective

Measure and document cloud performance on the finalized PostgreSQL → API → React architecture. Identify the **top 10 bottlenecks ranked by impact** before implementing any fixes.

---

## Program phases

| Phase | Focus | Instrumentation | Deliverable |
|------:|-------|-----------------|-------------|
| **1** | Login & Dashboard Baseline | Client milestones + server probe | [01-performance-baseline.md](cloud/reports/01-performance-baseline.md) |
| **2** | Startup Request Audit | Client request log + catalog | [02-startup-request-matrix.md](cloud/reports/02-startup-request-matrix.md) |
| **3** | Pool Analysis | `pool-pressure` polling + optional sampling | [03-pool-analysis.md](cloud/reports/03-pool-analysis.md) |
| **4** | Dashboard Performance | Cold/warm dashboard probes | [04-dashboard-optimization.md](cloud/reports/04-dashboard-optimization.md) |
| **5** | Scalability Testing | Grouped benchmark on large tenant | [05-scalability.md](cloud/reports/05-scalability.md) |
| **Final** | Roadmap | Aggregate captures | [06-optimization-roadmap.md](cloud/reports/06-optimization-roadmap.md) |

---

## Enable instrumentation

### Client (browser / Cloud / Electron)

```javascript
localStorage.setItem('PBOOKS_STARTUP_PERF', '1');
// Log out, log in, land on dashboard, then:
copy(JSON.stringify(window.__PBOOKS_EXPORT_STARTUP_PERF__(), null, 2));
// Save to docs/performance/cloud/captures/startup-client.json
```

**Milestones captured:** `app_boot` → `auth_check_*` → `login_submit` → `login_success` → `bootstrap_*` → `dashboard_ready`

### Server (API)

Set on Render or local `.env.staging` / `.env.production`:

```env
PBOOKS_PERF_POOL_SAMPLE=1
PBOOKS_PERF_BASELINE_EXPORT=1
```

Optional pool hold tracking (investigation):

```env
PBOOKS_PERF_POOL_OWNERSHIP=1
```

Endpoints (tenant JWT):

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/monitoring/pool-pressure` | Live `activeCount`, `idleCount`, `waitingCount` |
| `GET /api/v1/monitoring/perf-baseline?windowMinutes=15` | API metrics + pool sample summary (when export enabled) |

Platform admin (cross-tenant): `/api/admin/monitoring/health-center` (existing).

---

## Capture commands

Replace `TOKEN` and base URL for target environment (staging `:3001`, production cloud `https://api.pbookspro.com/api/v1`).

```powershell
$env:PBooks_BENCHMARK_TOKEN = "TOKEN"
$env:PBooks_API_BASE = "https://api.pbookspro.com/api/v1"

# Phase 1
node scripts/perf/cloud-login-dashboard-baseline.mjs

# Phase 2 (after saving client JSON)
node scripts/perf/cloud-startup-request-matrix.mjs --in docs/performance/cloud/captures/startup-client.json

# Phase 3 (repeat per scenario)
node scripts/perf/cloud-pool-analysis.mjs --scenario login
node scripts/perf/cloud-pool-analysis.mjs --scenario dashboard
node scripts/perf/cloud-pool-analysis.mjs --scenario reports
node scripts/perf/cloud-pool-analysis.mjs --scenario payroll

# Phase 4
node scripts/perf/cloud-dashboard-probe.mjs

# Phase 5 (run against large-tenant JWT)
node scripts/perf/cloud-scalability-probe.mjs --tenant-label pakland-large --iterations 10

# Roadmap draft
node scripts/perf/generate-optimization-roadmap.mjs --captures docs/performance/cloud/captures/phase1-baseline.json,docs/performance/cloud/captures/phase5-scalability.json
```

Or use npm scripts:

```powershell
npm run perf:cloud:baseline
npm run perf:cloud:pool -- --scenario dashboard
npm run perf:cloud:roadmap
```

---

## Known startup hotspots (pre-measurement hypothesis)

From code audit — **verify with Phase 1–2 captures**:

| Hotspot | Class | Notes |
|---------|-------|-------|
| `GET /state/bulk-chunked` (paginated) | Required | Dominates bootstrap time |
| `GET /tenants/license-status` ×3–4 | Duplicate | applyAuthSession, LicenseContext, Sidebar |
| Double `refreshFromApi()` on fresh login | Duplicate | Parallel AppContext effects |
| `GET /dashboard/metrics` + charts + snapshots | Required (admin) | Parallel SQL in `computeSnapshot` |
| Payroll list tail after bulk | Optional | Permission-gated |
| Deferred `state/bulk?entities=…` | Duplicate | When slices empty after chunked bulk |

Full catalog: `shared/performance/startupRequestCatalog.ts`

---

## Success criteria

- [ ] All six deliverable reports populated with **measured** data (not estimates)
- [ ] Top 10 bottlenecks ranked in optimization roadmap
- [ ] Pool peak `waitingCount` documented per scenario
- [ ] Dashboard cold vs warm cache behavior documented
- [ ] Large-tenant scalability run completed on representative dataset
- [ ] **No optimization PRs** merged before baseline sign-off

---

## Related docs

- Prior perf work: `docs/performance/PERFORMANCE_IMPLEMENTATION_PLAN_V1.md` (frontend A2–A4 — separate track)
- Enterprise benchmark: `docs/performance/A3_7_ENTERPRISE_BENCHMARK.md`
- Dashboard scalability: `docs/performance/A3_5_DASHBOARD_SCALABILITY_REPORT.md`
- Empty baseline template: `docs/performance/PERFORMANCE_BASELINE.md`

---

## Constraints (enforced)

| Rule | Detail |
|------|--------|
| No Payroll logic changes | Measurement hooks only |
| No RBAC logic changes | `/permissions/me` stays as-is |
| No Approval Matrix | Do not enable |
| Measurement first | Roadmap items stay **deferred** until sign-off |
