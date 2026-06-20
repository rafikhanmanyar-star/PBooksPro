# Real-Time Event Emission Audit

Tracks tenant-scoped `emitEntityEvent()` / `emitFinancialPosted()` / `emitLockEvent()` coverage on mutation routes.

**Standard:** Every business entity mutation must emit after PostgreSQL commit. See `doc/ARCHITECTURE_V2_AGENT_RULES.md` § Real-Time First.

**Modernization status:** Track E complete; Track F P4 complete; production **v1.2.396** shipped (2026-06-15). See `doc/ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md`.

## Compliant (core business modules)

These module routes emit on create/update/delete/post:

| Module | Routes file | Notes |
|--------|-------------|-------|
| Accounting | `accountsRoutes`, `categoriesRoutes`, `transactionsRoutes`, `journalRoutes` | GL via `emitFinancialPosted` or entity events |
| Accounting | `accountingPeriodsRoutes` | ✅ Added `accounting_period` events + `financial.posted` on close |
| Accounting | `investorJournalRoutes` | ✅ Uses `emitFinancialPosted` for journal posts |
| Vendors | `billsRoutes`, `vendorsRoutes`, `quotationsRoutes`, `contractorRoutes` | |
| Customers | `invoicesRoutes`, `recurringInvoiceTemplatesRoutes` | |
| CRM | `contactsRoutes` | |
| Properties | `propertiesRoutes`, `buildingsRoutes`, `unitsRoutes` | |
| Leases | `rentalAgreementsRoutes` | |
| Project selling | `projectsRoutes`, `contractsRoutes`, `budgetsRoutes`, … | Retention release emits `contract` updated |
| Project expense | `projectExpenseVoucherRoutes` | |
| Payroll | `payrollRoutes` | |
| Personal finance | `personalFinanceRoutes`, `tasksRoutes` | ✅ Tasks CRUD emits `personal_task` |
| Documents | `documentsRoutes` | |
| Organization | `dataManagementRoutes` | ✅ `settings` `bulkRefresh` on clear-transactions / factory-reset |
| App settings | `appSettingsRoutes` | |
| Users | `usersRoutes` | |
| Reporting | `reportDesignerRoutes`, `customReportsRoutes` | `report_definition` / `custom_report_template` events |
| Locks | `locksRoutes` | Uses `emitLockEvent` (not entity_*) |

## Intentionally exempt

| Area | Reason |
|------|--------|
| Auth login/logout/MFA | Session, not tenant entity |
| Admin portal (`/api/admin`) | Platform ops, separate JWT |
| Webhooks (Paddle, WhatsApp) | External ingress |
| Backup/DR restore | Infrastructure, not live entity CRUD |
| Billing subscription checkout | SaaS billing, not tenant ERP entities |
| Onboarding/demo/marketing leads | Pre-tenant or low-frequency |

## Gaps to address (future)

| Route | Priority | Action |
|-------|----------|--------|
| Import/export wizard (`/data-import-export/*`) | Low | Emit completion event if/when backend route is implemented |
| `notificationsRoutes` | Done via `notification_created` socket | Separate from entity_* |

## New entity types

When adding domains, extend:

1. `backend/src/core/realtime.ts` — `RealtimeEntityType`
2. Route — `emitEntityEvent()` after commit
3. `services/realtime/entityQueryInvalidation.ts` — React Query keys

## Verification

```powershell
npm run build:backend
npm run test:staging
```

Multi-user test: User A mutates entity → User B's list/dashboard updates without manual refresh.
