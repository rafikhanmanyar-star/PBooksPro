# PBooks Pro — Full Production Launch Audit

**Audit date:** June 7, 2026  
**Version:** 1.2.297 (`package.json`)  
**Scope:** Security, accounting, property/project modules, subscriptions, performance  
**Deployment targets:** LAN PostgreSQL API + Electron/web clients; cloud SaaS with Paddle billing  
**Test status:** 151 / 152 backend unit tests passing (`legalAcceptance.test.ts` failing)  
**Migrations:** Through `086_production_monitoring.sql` (86 numbered migrations + `schema_migrations` tracking)

---

## Executive Summary

PBooks Pro has matured significantly since the June 6 system audit: **schema migration tracking**, **journal-based account balances**, **enterprise RBAC on financial writes**, **subscription enforcement**, **reconciliation certification**, **MFA**, and **production monitoring** are in place. The product is **viable for a controlled pilot** (single org, LAN, <10k transactions, supervised accounting review).

It is **not ready for unrestricted multi-tenant SaaS production** or **audit-grade financial close** without resolving data-scale limits, session security gaps, hybrid reporting, and subscription read-access policy.

| Domain | Score | Status |
|--------|-------|--------|
| Security | 68/100 | Acceptable with hardening |
| Accounting | 58/100 | Management reports OK; audit close needs work |
| Property Management | 72/100 | Functional; scale limits on reports |
| Project Management | 70/100 | Functional; client-side analytics risk |
| Subscriptions | 75/100 | Launchable with Paddle + migrations |
| Performance | 52/100 | Not ready at scale (>50k tx) |

**Overall production readiness: 66/100 — Ready with Fixes (conditional go-live)**

---

## SECURITY

### Authentication — **Mostly solid**

| Control | Status | Evidence |
|---------|--------|----------|
| JWT bearer auth | ✅ | `backend/src/auth/jwt.ts` |
| DB revalidation per HTTP request (`is_active`, role) | ✅ | `backend/src/middleware/authMiddleware.ts` |
| Stale role detection (`TOKEN_STALE`) | ✅ | `isTokenRoleStale()` |
| Login rate limit (20 / 15 min / IP) | ✅ | `backend/src/routes/authRoutes.ts` |
| bcrypt password hashing (cost 10) | ✅ | `authRoutes.ts`, `usersRoutes.ts` |
| MFA (TOTP + recovery codes, encrypted at rest) | ✅ | `mfaService.ts`, `mfaCrypto.ts` |
| Login audit trail | ✅ | `enterpriseAuditService.recordLoginEvent` |

**Gaps:** 7-day JWT default; logout does not revoke tokens; password policy is minimal (8 chars + letter + number); no per-user lockout.

### Authorization — **Partial**

| Control | Status | Evidence |
|---------|--------|----------|
| Enterprise permission matrix | ✅ | `backend/src/auth/permissions.ts` |
| `requireFinancialWriteOnMutations` on bills, transactions, invoices, etc. | ✅ | `backend/src/index.ts` |
| Report routes gated (`reports.*.read`) | ✅ | balance sheet, P&L, TB, reconciliation routes |
| Admin routes (`super_admin`) | ✅ | subscriptions, referrals, monitoring, email automation |
| Read-side RBAC on operational GET APIs | ❌ | `requireFinancialWriteOnMutations` skips GET; `/state/bulk` exposes full tenant snapshot |

**Risk:** `read_only` and `sales_user` roles can read all financial/property data via GET even when UI hides screens.

### Session Handling — **Gaps remain**

| Item | Severity | Detail |
|------|----------|--------|
| No server-side token revocation | High | `/auth/logout` is audit-only; stolen JWT valid until expiry |
| WebSocket skips DB revalidation | Critical | `core/realtime.ts` — JWT verify only, no `is_active`/role check |
| MFA disable keeps existing JWT | High | `mfaRoutes.ts` — privileged users can disable MFA without re-auth |

### API Security — **Acceptable for LAN; tighten for internet**

| Control | Status |
|---------|--------|
| JSON body limit (2MB) | ✅ |
| Introspection rate limits | ✅ |
| Paddle webhook HMAC (prod) | ✅ |
| CORS `origin: '*'` | ⚠️ LAN OK; internet exposure risky |
| Public `/api/discover`, tenant directory | ⚠️ Mitigate with `DISCOVERY_TOKEN`, `PUBLIC_TENANT_DIRECTORY=false` |
| Global authenticated rate limit | ❌ |
| Security headers (HSTS, etc.) | ⚠️ Only when `TRUST_PROXY=true` |

### Encryption — **Good with config discipline**

| Area | Status |
|------|--------|
| Backup encryption (PBKENC1/PBKENC2) | ✅ `backupCryptoService.ts` |
| MFA secret encryption (AES-256-GCM) | ✅ |
| Storage credential encryption | ✅ |
| Dedicated encryption keys in production | ⚠️ Falls back to `JWT_SECRET` if unset |
| Tenant backup export (unencrypted gzip) | ⚠️ `databaseBackupRoutes.ts` |
| TLS | Deployment responsibility (`TRUST_PROXY`, reverse proxy) |

---

## ACCOUNTING

### Trial Balance — **Partial**

- **Canonical engine:** journal-unified via `trialBalanceCore.ts` + `journalLedgerLoadService.ts` (excludes reversed entries).
- **Report SQL path:** `trialBalanceReportService.ts` / `journalService.getTrialBalanceReport` — **does not filter `journal_reversals`** → can disagree with certification after reversals.
- **Duplicate APIs:** legacy route on `journalRoutes.ts` vs canonical `trialBalanceRoutes.ts`.
- **Tests:** `trialBalanceCore.test.ts`, `accountBalanceSql.test.ts` ✅

### Balance Sheet — **Hybrid**

- Uses journal balances with hybrid overlays (AR/AP, received assets, retained earnings from P&L engine).
- Registry status: `partial` in `financialReconciliationEngine.ts`.
- Requires pre-built `dist/balanceSheetEngine.mjs` at runtime.
- **Tests:** engine unit tests via reconciliation suite ✅

### Profit & Loss — **Hybrid**

- Journal-mirrored transactions + category `plSubType` aggregation — not pure GL revenue/expense accounts.
- **Tests:** bundled engine + reconciliation cross-checks ✅

### General Ledger — **Partial**

- Per-account ledger from `journal_lines`; reversal exclusion gap same as TB in SQL report path.
- Journal immutability triggers on PostgreSQL (migration `062`) ✅
- Transaction → journal mirroring on CRUD ✅ (`transactionJournalPostingService.ts`)

### Audit Trail — **Fragmented but present**

- `audit_events` / `login_events` (migration `067`) — enterprise audit with RBAC `audit_logs.read`
- Billing audit → `billingAuditService.ts`
- Journal reversals → `accounting_audit_log` (separate from `audit_events`)
- UI: Enterprise Audit Viewer, Transaction Log, new Monitoring dashboard
- **Gap:** No integration tests for audit trail HTTP routes

### Reconciliation certification — **Strong framework**

- `GET /api/reports/reconciliation/certification` — TB balance, BS equation, equity/P&L tie, missing journal mirrors
- UI: `ReconciliationDashboard.tsx`
- **Pre-launch requirement:** Run `npm run backfill-transaction-journal --prefix backend` per tenant; target score ≥ 85, `missingJournalCount = 0`

### Accounting launch blockers

1. Journal backfill + per-tenant certification pass
2. TB/GL reversal exclusion fix in report SQL
3. Treat P&L/BS as management reports until `partial` → `unified` in registry

---

## PROPERTY MANAGEMENT

### Property Records — **Functional**

- Buildings, properties, units: full CRUD APIs + Settings/Rental UI
- Indexes: tenant, building, owner composites ✅
- Property delete blocked when active rental agreements exist ✅
- **Gaps:** No FK on `rental_agreements.property_id`; SQLite/PG units schema drift for local-only mode

### Tenant Records — **Functional**

- Contacts module powers tenants, vendors, owners
- Rental agreements link contacts to properties/units
- **Gap:** No domain-specific RBAC (any `financial.write` user can mutate)

### Lease Tracking — **Functional with scale risk**

- Rental agreements: create, renew, reconcile, expiry reports
- Renewal chain repair (migration `045`) + tests ✅
- Record locks on agreement updates ✅
- **High risk:** `syncReconcileRentalAgreementsForTenant` scans all agreements on each save
- **Missing indexes:** `(tenant_id, status)`, `(tenant_id, updated_at)` on `rental_agreements`

### Rental reporting — **High scale risk**

- Owner income, tenant ledger, BM analysis, rental bills dashboard load up to **500,000 transactions** per request
- Only BM Analysis has 120s memory cache

---

## PROJECT MANAGEMENT

### Cost Tracking — **Functional**

- Transactions indexed by `(tenant_id, project_id, date)` ✅
- Contracts, bills, contractor advances, vendor ledger for job costs
- No unified server-side job-cost SQL view (spread across services)

### Budget Tracking — **Functional**

- `budgets` table + `BudgetManagement.tsx` (client-side actuals from in-memory transactions)
- **Gap:** No `(tenant_id, project_id)` index on budgets; no server-side budget vs actual API

### Vendor Costs — **Functional**

- Vendor directory, bills, settlements, vendor ledger report
- Vendor advance clearing (migrations `056`, `057`)

### Project reporting — **Same scale pattern as rental**

- Project P&L, BS, client ledger, reconciliation load 500k transactions
- **Project profitability** computed client-side over full `AppState` — main-thread risk at scale
- `ProjectManagementPage` uses static imports (larger first paint vs lazy rental module)

---

## SUBSCRIPTIONS

### Paddle Billing — **Good design**

- Schema: `073` billing, `074` Paddle, `075` license enforcement, **`082` grace period (required)**
- Webhook idempotency + retry queue ✅
- Signature verification in production ✅
- **Gap:** `transaction.completed` no-ops without `custom_data.tenant_id` + `plan_code`

### Trial Handling — **Good**

- Trial plan, `startTrialSubscription`, scheduler expiry sweep
- Email automation drip (migration `085`) when enabled
- Referral trial extension ✅

### Plan Enforcement — **Good with policy gap**

- `requireActiveSubscription()` on `/api` mutating routes; auto-enabled in production
- Grace period (`PAST_DUE_GRACE_DAYS`, default 7) ✅
- Quota checks for users/projects/storage ✅
- **High gap:** Expired/past-due tenants retain **full read access** (GET not enforced)
- Invoice quota middleware is effectively a no-op

### Subscription pre-launch checklist

1. Apply migrations through `086`
2. Set `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, price IDs
3. Ensure checkout passes `tenant_id` + `plan_code` in Paddle `custom_data`
4. Confirm `ENABLE_BILLING_SCHEDULER` / production defaults active
5. Decide read-lock policy for expired tenants

---

## PERFORMANCE

### Page Load Speed — **Moderate**

- Vite code-splitting: `vendor-charts`, `vendor-xlsx`, `vendor-base` ✅
- Rental module: nested `React.lazy` ✅
- Project module: mixed static/lazy imports ⚠️
- Largest chunks: `vendor-base` ~1.3MB, `SettingsPage` ~245KB, `PayrollHub` ~256KB
- Page preloader disabled (404 issues) ⚠️

### Query Performance — **Gaps at scale**

| Issue | Severity |
|-------|----------|
| Sync cap **50,000** txs (`BULK_TRANSACTION_CAP`) vs reports **500,000** | **Critical** |
| Report services load full transaction sets into memory | **High** |
| `authMiddleware` DB hit on every request | **High** (latency under concurrency) |
| No SQL slow-query logging (HTTP monitoring only) | **Medium** |
| Missing indexes: budgets by project, rental_agreements by status/updated_at | **Medium** |

### API Response Times — **Monitored**

- `requestLoggingMiddleware` logs `durationMs` per request ✅
- Production monitoring (migration `086`): slow request capture at 3000ms default ✅
- `GET /api/health/ready` — DB + dependency readiness ✅
- No SLA targets or P95 dashboards in-app (use external APM: Sentry/OTel stubs ready)

### Test & build health

- Backend: **151/152** tests pass
- Frontend + backend production builds succeed
- Integration tests optional (`test:integration` requires live PG)

---

## CRITICAL ISSUES (must fix before unrestricted production)

| ID | Domain | Issue | Remediation |
|----|--------|-------|-------------|
| **C1** | Performance / Data integrity | **50k sync cap vs 500k report cap** — clients may have incomplete data while reports scan 10× more | Unify caps; paginate reports; show "incomplete data" warnings |
| **C2** | Security | **WebSocket auth skips DB revalidation** — deactivated users retain realtime access | Mirror `authMiddleware` checks in `realtime.ts` |
| **C3** | Accounting | **TB/GL report SQL includes reversed journal entries** — reports can disagree with certification | Add `journal_reversals` exclusion to `trialBalanceReportService.ts` / `journalService.ts` |
| **C4** | Accounting | **Journal backfill required** — certification fails on historical tenants without mirrors | Run `backfill-transaction-journal` per tenant before go-live |
| **C5** | Subscriptions | **Migration 082 mandatory** — `past_due_at` and plan consolidation; code assumes it | Run full migration chain through `086` |

---

## HIGH ISSUES (fix before scale or SaaS launch)

| ID | Domain | Issue |
|----|--------|-------|
| **H1** | Security | 7-day JWT with no revocation; logout is client-only |
| **H2** | Security | MFA can be disabled without invalidating session |
| **H3** | Security | Read-side RBAC weak — GET exposes full tenant financial/property data |
| **H4** | Security | Encryption keys fall back to `JWT_SECRET` if dedicated keys unset |
| **H5** | Subscriptions | Paddle webhook activation silent failure without `custom_data` |
| **H6** | Subscriptions | Expired tenants retain full read/export access |
| **H7** | Performance | Rental/project reports load up to 500k transactions per request |
| **H8** | Accounting | P&L and Balance Sheet are hybrid — not audit-grade GL truth |
| **H9** | Property | Full-tenant rental agreement reconcile on every agreement save |
| **H10** | Performance | `authMiddleware` PostgreSQL query on every authenticated request |

---

## MEDIUM ISSUES (address in first 30 days post-launch)

| ID | Domain | Issue |
|----|--------|-------|
| **M1** | Security | CORS `*` and permissive public introspection defaults |
| **M2** | Security | `productionEnvCheck` does not enforce encryption keys, `TRUST_PROXY`, discovery token |
| **M3** | Security | Tenant backup export unencrypted; backup password in query string |
| **M4** | Security | No global authenticated API rate limiting |
| **M5** | Accounting | Duplicate trial balance API routes |
| **M6** | Accounting | Reversal entries post to today's date — period distortion |
| **M7** | Accounting | Audit trail fragmented across `audit_events` and `accounting_audit_log` |
| **M8** | Accounting | Cash Flow still transaction-based (excluded from certification) |
| **M9** | Property | No FK `rental_agreements.property_id → properties` |
| **M10** | Property | Missing indexes on `rental_agreements(status, updated_at)` |
| **M11** | Project | Budget vs actual client-only; missing budget project index |
| **M12** | Project | Record locks not on contracts/budgets/bills |
| **M13** | Performance | No SQL slow-query logging; only HTTP duration |
| **M14** | Performance | Project profitability blocks main thread at scale |
| **M15** | Subscriptions | Invoice quota enforcement is a no-op |
| **M16** | Quality | 1 failing backend test (`legalAcceptance.test.ts`) |

---

## LAUNCH RECOMMENDATION

### Verdict: **Conditional Go-Live — "Ready with Fixes"**

PBooks Pro **can launch to production** under these conditions:

#### ✅ Approved launch profile (pilot / LAN / single org)

- One tenant or small multi-tenant LAN (<10,000 transactions)
- PostgreSQL migrations applied through **086**
- Journal backfill run and reconciliation certification **passes** for each tenant
- Paddle configured with correct `custom_data` on checkout
- Production secrets: strong `JWT_SECRET`, dedicated `MFA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`
- `NODE_ENV=production`, subscription enforcement enabled, billing scheduler enabled
- TLS at reverse proxy + `TRUST_PROXY=true`
- `DISCOVERY_TOKEN` set, `PUBLIC_TENANT_DIRECTORY=false`, demo/marketing disabled
- Supervised accounting review monthly; do not rely on TB/GL alone after reversals until C3 fixed

#### ❌ Not approved without remediation

- Multi-tenant SaaS at scale (>50k transactions per tenant)
- Audit-grade year-end close without certification pass + hybrid report caveats
- Internet-exposed deployment without fixing C2, H1–H4, M1–M4
- Processing real money at volume without fixing C1 (data cap mismatch)

### Pre-launch checklist (ordered)

```text
1. npm run migrate --prefix backend          # through 086
2. npm run build --prefix backend
3. npm run backfill-transaction-journal --prefix backend
4. Per tenant: GET /api/reports/reconciliation/certification → reconciled, score ≥ 85
5. Configure production .env (secrets, Paddle, TRUST_PROXY, discovery token)
6. Fix or accept C3 (reversal TB/GL) — document for accountants if deferred
7. Fix C2 (WebSocket revalidation) before multi-user internet deployment
8. Smoke test: auth, MFA, billing webhook, backup restore, monitoring dashboard
9. Load test with realistic transaction count (not empty tenant)
```

### Post-launch priority roadmap (30 days)

1. **Week 1:** C1 data cap alignment, C2 WebSocket auth, C3 reversal filter  
2. **Week 2:** H1–H4 security hardening, extend `productionEnvCheck`  
3. **Week 3:** H7 report pagination/caching, rental reconcile scope fix  
4. **Week 4:** H6 subscription read-lock policy, observability SDK wiring (Sentry/OTel)

---

## Positive controls (launch enablers)

- Enterprise RBAC with financial write gating and report permissions
- Subscription lifecycle with Paddle, grace period, scheduler, enforcement middleware
- Journal-unified account balances and transaction mirroring
- Reconciliation certification engine + dashboard
- MFA, login audit, backup encryption, restore session tokens
- Production monitoring (events, alerts, health checks, admin dashboard)
- Customer Success Center, email automation, referral program (when enabled)
- Schema migration tracking and journal immutability on PostgreSQL

---

*This audit synthesizes codebase review, agent-assisted domain analysis, test execution (151/152 pass), and prior reports in `audit/system-audit-report.md` and `audit/reconciliation-certification-report.md`. Re-run certification and load tests after each remediation.*
