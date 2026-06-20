# financial.write — Permission Migration Map

**Phase:** A5.1.0.4 — Final Review Closure (NM3); §11 updated A5.1.0.3 (NR2)  
**Status:** Architecture reference — no implementation  
**Purpose:** Complete mapping of every `financial.write` usage to RBAC 2.0 feature → page → action keys

---

## Summary

| Metric | Count |
|--------|-------|
| Roles granted `financial.write` (static matrix) | 3 (`company_admin`, `accountant`, `project_manager`) |
| API router mounts using `requireFinancialWriteOnMutations` | 22 |
| Routes using `requireLedgerRole` / `requireFinancialWriteRole` | 20+ |
| Frontend `canWriteFinancial` usages | 2 components + `usePermissions` helpers |
| Helper functions treating `financial.write` as superset | 6 in `shared/rbac/permissions.ts` |

**Bundle policy:** `financial.write` remains a v1 alias that expands to the v2 keys listed in §2 during PermissionEngine resolution. Individual route guards migrate to specific v2 keys in Phase 3+.

---

## §1 — Static role matrix

| Role | Has `financial.write` | Migration note |
|------|----------------------|----------------|
| `super_admin` | Yes (all permissions) | Unchanged |
| `company_admin` | Yes | Split into domain-specific write keys; retain bundle alias during migration |
| `accountant` | Yes | Map to accounting + procurement write keys; **SoD review** for approve pairs |
| `project_manager` | Yes | Map to projects + procurement subset; not full accounting |
| `sales_user` | No | Uses `project_selling.*` keys |
| `read_only` | No | — |

---

## §2 — Bundle expansion definition

When PermissionEngine resolves `financial.write`, it expands to this **canonical v2 set**:

### Accounting

| v2 Permission | Layer |
|---------------|-------|
| `accounting.access` | feature |
| `accounting.chart_of_accounts.view` | page |
| `accounting.chart_of_accounts.create` | action |
| `accounting.chart_of_accounts.edit` | action |
| `accounting.chart_of_accounts.delete` | action |
| `accounting.categories.view` | page |
| `accounting.categories.create` | action |
| `accounting.categories.edit` | action |
| `accounting.categories.delete` | action |
| `accounting.journals.view` | page |
| `accounting.journals.create` | action |
| `accounting.journals.reverse` | action |
| `accounting.transactions.view` | page |
| `accounting.transactions.create` | action |
| `accounting.transactions.edit` | action |
| `accounting.periods.view` | page |
| `accounting.periods.open` | action |
| `accounting.periods.close` | action |
| `accounting.budgets.view` | page |
| `accounting.budgets.create` | action |
| `accounting.budgets.edit` | action |
| `accounting.budgets.delete` | action |
| `accounting.investor_journals.create` | action |
| `accounting.transaction_audit.create` | action |

### Procurement

| v2 Permission | Layer |
|---------------|-------|
| `procurement.access` | feature |
| `procurement.vendors.view` | page |
| `procurement.vendors.create` | action |
| `procurement.vendors.edit` | action |
| `procurement.vendors.delete` | action |
| `procurement.bills.view` | page |
| `procurement.bills.create` | action |
| `procurement.bills.edit` | action |
| `procurement.bills.delete` | action |
| `procurement.quotations.create` | action |
| `procurement.quotations.edit` | action |

### Property & rental

| v2 Permission | Layer |
|---------------|-------|
| `property.access` | feature |
| `property.buildings.view` | page |
| `property.buildings.create` | action |
| `property.buildings.edit` | action |
| `property.buildings.delete` | action |
| `property.properties.view` | page |
| `property.properties.create` | action |
| `property.properties.edit` | action |
| `property.properties.delete` | action |
| `rental.access` | feature |
| `rental.agreements.view` | page |
| `rental.agreements.create` | action |
| `rental.agreements.edit` | action |
| `rental.agreements.delete` | action |

### Projects & construction

| v2 Permission | Layer |
|---------------|-------|
| `projects.access` | feature |
| `projects.contracts.view` | page |
| `projects.contracts.create` | action |
| `projects.contracts.edit` | action |
| `projects.contracts.delete` | action |
| `projects.contractors.view` | page |
| `projects.contractors.create` | action |
| `projects.contractors.edit` | action |
| `projects.contractors.delete` | action |

### Customers & billing documents

| v2 Permission | Layer |
|---------------|-------|
| `customers.access` | feature |
| `customers.recurring_invoices.view` | page |
| `customers.recurring_invoices.create` | action |
| `customers.recurring_invoices.edit` | action |
| `customers.recurring_invoices.delete` | action |

### Facility / PM

| v2 Permission | Layer |
|---------------|-------|
| `property.pm_cycles.view` | page |
| `property.pm_cycles.edit` | action |

### Administration

| v2 Permission | Layer |
|---------------|-------|
| `administration.settings.view` | page |
| `administration.settings.edit` | action |
| `administration.locks.edit` | action |

### Personal finance

**Removed from `FINANCIAL_WRITE_BUNDLE`** — see [§12 personal.finance classification](#12--personalfinance-classification-nm3).

~~Included in bundle (deprecated):~~

| v2 Permission | Layer |
|---------------|-------|
| ~~`personal.finance.view`~~ | page |
| ~~`personal.finance.create`~~ | action |
| ~~`personal.finance.edit`~~ | action |
| ~~`personal.finance.delete`~~ | action |

### Reports (write-capable)

| v2 Permission | Layer |
|---------------|-------|
| `reports.custom.create` | action |
| `reports.custom.edit` | action |
| `reports.custom.delete` | action |
| `reports.custom.export` | action |
| `reports.designer.edit` | action |

**Explicitly NOT in bundle** (require separate approve permissions — SoD):

- `payroll.runs.approve`
- `procurement.purchase_orders.approve`
- `procurement.bills.approve`
- `accounting.journals.approve`
- `accounting.journals.approve` (reversal approval)
- `approve.payments`

---

## §3 — API route mount map (`mountVersionedApi.ts`)

Each row: router protected by `requireFinancialWriteOnMutations` (POST/PUT/PATCH/DELETE require `financial.write`; GET passes through).

| Router module | Path prefix (typical) | Feature | Page | Mutation actions (v2) |
|---------------|----------------------|---------|------|------------------------|
| `accountsRouter` | `/accounts` | accounting | chart_of_accounts | create, edit, delete |
| `categoriesRouter` | `/categories` | accounting | categories | create, edit, delete — **or** `project_selling.catalog.write` via `requireFinancialWriteOrProjectSellingCatalogOnMutations` |
| `billsRouter` | `/bills` | procurement | bills | create, edit, delete |
| `buildingsRouter` | `/buildings` | property | buildings | create, edit, delete |
| `propertiesRouter` | `/properties` | property | properties | create, edit, delete |
| `vendorsRouter` | `/vendors` | procurement | vendors | create, edit, delete |
| `quotationsRouter` | `/quotations` | procurement | quotations | create, edit |
| `quotationValidationRouter` | `/quotation-validation` | procurement | quotations | edit |
| `appSettingsRouter` | `/app-settings` | administration | settings | edit |
| `rentalAgreementsRouter` | `/rental-agreements` | rental | agreements | create, edit, delete |
| `contractsRouter` | `/contracts` | projects | contracts | create, edit, delete |
| `budgetsRouter` | `/budgets` | accounting | budgets | create, edit, delete |
| `journalRouter` | `/transactions/journal` | accounting | journals | create (see §4 for explicit guards) |
| `accountingPeriodsRouter` | `/accounting-periods` | accounting | periods | open, close |
| `investorJournalRouter` | `/investor/journal` | accounting | investor_journals | create |
| `recurringInvoiceTemplatesRouter` | `/recurring-invoice-templates` | customers | recurring_invoices | create, edit, delete |
| `pmCycleAllocationsRouter` | `/pm-cycle-allocations` | property | pm_cycles | edit |
| `locksRouter` | `/locks` | administration | locks | edit |
| `contractorRouter` | `/contractors` | projects | contractors | create, edit, delete |
| `personalFinanceRouter` | `/personal-categories`, `/personal-transactions` | personal | finance | create, edit, delete — **standalone `personal.finance.*` keys (not financial.write bundle)** |

### Routers using `requireWriteOnMutations` (financial.write as OR fallback)

| Router | Primary v2 permission | financial.write role |
|--------|----------------------|---------------------|
| `documentsRouter` | `project_selling.marketing_plans.write`, `.invoices.write`, `.agreements.write` | Fallback superset |
| `projectAgreementsRouter` | `project_selling.agreements.write` | Fallback |
| `projectReceivedAssetsRouter` | `project_selling.payments.receive` | Fallback |
| `salesReturnsRouter` | `project_selling.agreements.write` | Fallback |
| `invoicesRouter` | `project_selling.invoices.write`, `.payments.receive` | Fallback |
| `transactionsRouter` | `project_selling.payments.receive` | Fallback |
| `planAmenitiesRouter` | `project_selling.marketing_plans.write` | Fallback |
| `installmentPlansRouter` | `project_selling.marketing_plans.write` | Fallback |

**Migration:** Remove `financial.write` from OR lists once v2 keys are enforced on these routers; sales users should not inherit full financial bundle via fallback.

---

## §4 — Explicit route-level guards

### `requireLedgerRole` (= `financial.write`)

| File | Route | Method | v2 Feature | v2 Page | v2 Action |
|------|-------|--------|------------|---------|-----------|
| `journalRoutes.ts` | `/transactions/journal` | POST | accounting | journals | create |
| `journalRoutes.ts` | `/transactions/journal/:id/reverse` | POST | accounting | journals | reverse |
| `accountingPeriodsRoutes.ts` | `/accounting-periods` | GET | accounting | periods | view |
| `accountingPeriodsRoutes.ts` | `/accounting-periods/:id` | GET | accounting | periods | view |
| `accountingPeriodsRoutes.ts` | `/accounting-periods/open` | POST | accounting | periods | open |
| `accountingPeriodsRoutes.ts` | `/accounting-periods/:id/close` | POST | accounting | periods | close |
| `investorJournalRoutes.ts` | `/investor/journal/contribution` | POST | accounting | investor_journals | create |
| `investorJournalRoutes.ts` | `/investor/journal/withdrawal` | POST | accounting | investor_journals | create |
| `investorJournalRoutes.ts` | `/investor/journal/profit-allocation` | POST | accounting | investor_journals | create |
| `investorJournalRoutes.ts` | `/investor/journal/inter-project-transfer` | POST | accounting | investor_journals | create |

### `requireFinancialWriteRole` (= `financial.write`)

| File | Route | Method | v2 Feature | v2 Page | v2 Action |
|------|-------|--------|------------|---------|-----------|
| `transactionAuditRoutes.ts` | `/transaction-audit` | POST | accounting | transaction_audit | create |
| `customReportsRoutes.ts` | `/reports/custom/generate` | POST | reports | custom | export |
| `customReportsRoutes.ts` | `/reports/custom/export` | POST | reports | custom | export |
| `customReportsRoutes.ts` | `/reports/custom/save-template` | POST | reports | custom | create |
| `customReportsRoutes.ts` | `/reports/custom/template/:id` | PUT | reports | custom | edit |
| `customReportsRoutes.ts` | `/reports/custom/template/:id` | DELETE | reports | custom | delete |
| `reportDesignerRoutes.ts` | multiple | POST/PUT/DELETE | reports | designer | create, edit, delete |

---

## §5 — Middleware helpers

| Location | Usage | v2 replacement |
|----------|-------|----------------|
| `rbacMiddleware.requireFinancialWriteOnMutations` | Mount-level mutation gate | Per-router specific `requirePermission('domain.page.action')` |
| `rbacMiddleware.requireFinancialWriteRole` | Single permission check | Specific v2 action key |
| `rbacMiddleware.requireWriteOnMutations(...)` | OR with financial.write | Remove financial.write from OR after migration |
| `rbacMiddleware.requireFinancialWriteOrProjectSellingCatalogOnMutations` | Categories + selling | `accounting.categories.*` OR `project_selling.catalog.write` |
| `authMiddleware.requireLedgerRole` | Journal/period routes | `accounting.journals.create`, `accounting.periods.*` |

---

## §6 — Frontend usage

| Location | Current check | v2 replacement |
|----------|---------------|----------------|
| `hooks/usePermissions.ts` → `canWriteFinancial` | `has('financial.write')` | `hasAny(accounting write keys)` or feature `accounting.access` + any page write |
| `hooks/usePermissions.ts` → project selling helpers | OR `financial.write` | Remove OR; use specific selling keys only |
| `components/layout/Sidebar.tsx` | `canWriteFinancial` for Rental nav, People nav | `rental.access`, `payroll.access` |
| `components/accounting/UnpostedTransactionsQueuePage.tsx` | `canWriteFinancial` for approve actions | `accounting.transactions.edit` or `accounting.journals.create` |
| `reportCapability.ts` | `canCreateTemplates` uses financial.write | `reports.custom.create` |

---

## §7 — Shared helper functions (`shared/rbac/permissions.ts`)

| Function | financial.write role | v2 migration |
|----------|---------------------|--------------|
| `roleCanWriteProjectSelling` | OR with selling keys | Remove financial.write OR |
| `roleCanReadProjectSellingCatalog` | OR with selling keys | Use `project_selling.read` / catalog keys only |
| `roleCanWriteProjectSellingCatalog` | OR with selling keys | Use catalog write keys only |
| `roleCanViewAllMarketingPlans` | enterprise role check + financial.write in hook | Permission-based: `project_selling.marketing_plans.approve` |
| `roleCanApproveMarketingPlans` | same | `project_selling.marketing_plans.approve` |

---

## §8 — Other backend references

| Location | Usage | v2 mapping |
|----------|-------|------------|
| `unpostedTransactionService.ts` | `roleHasPermission(role, 'financial.write')` | `accounting.transactions.edit` |
| `permissions.test.ts` | Assert sales/read_only lack financial.write | Update for v2 keys |
| `rbacMiddleware.test.ts` | Mutation guard tests | Add v2 key test cases |

---

## §9 — Migration sequence (reference)

1. **Phase 1** — Register all §2 v2 keys in permission catalog; `financial.write` marked `aliasOf` bundle.
2. **Phase 3** — PermissionEngine expands bundle; dual-run logging compares outcomes.
3. **Phase 3 pilot** — Replace mount guards on `accountsRouter`, `journalRouter` with specific keys.
4. **Phase 6** — Replace remaining mounts; remove `financial.write` from `requireWriteOnMutations` OR lists.
5. **Phase 7** — Deprecate bundle alias after 100% route coverage verified by `npm run verify:rbac-v2`.

---

## §10 — Verification checklist

- [ ] Every `requireFinancialWriteOnMutations` mount has a row in §3
- [ ] Every `requireLedgerRole` / `requireFinancialWriteRole` route has a row in §4
- [ ] Bundle expansion (§2) excludes all SoD approve keys (§2 note)
- [ ] Frontend `canWriteFinancial` has replacement plan (§6)
- [ ] `project_manager` expansion is subset, not full §2 set (see §11)
- [ ] `personal.finance.*` excluded from `FINANCIAL_WRITE_BUNDLE` (see §12)

---

## §11 — project_manager bundle definition (NR2)

When PermissionEngine expands `financial.write` for a user whose enterprise role is **`project_manager`**, it uses the **`PROJECT_MANAGER_FINANCIAL_BUNDLE`** subset — **not** the full §2 canonical set.

Source of truth at implementation: `permissionBundles.ts` → `PROJECT_MANAGER_FINANCIAL_BUNDLE` (must match this section exactly).

### Included — direct v1 permissions (always granted to project_manager)

| Permission key |
|----------------|
| `reports.profit_loss.read` |
| `reports.cash_flow.read` |
| `project_selling.read` |
| `pev.read` |
| `pev.create` |
| `contracts.retention.view` |
| `contracts.retention.edit` |
| `contracts.retention.release` |
| `procurement.quotations.create` |
| `procurement.quotations.edit` |
| `procurement.quotations.compare` |
| `procurement.quotations.select` |
| `procurement.price_history.read` |
| `purchase_order.view` |
| `purchase_order.create` |
| `purchase_order.edit` |
| `workflow.view` |
| `goods_receipt.view` |
| `goods_receipt.create` |
| `goods_receipt.edit` |

### Included — v2 keys (project_manager financial.write subset)

| Permission key |
|----------------|
| `projects.access` |
| `projects.contracts.view` |
| `projects.contracts.create` |
| `projects.contracts.edit` |
| `projects.contracts.delete` |
| `projects.contractors.view` |
| `projects.contractors.create` |
| `projects.contractors.edit` |
| `projects.contractors.delete` |
| `accounting.budgets.view` |
| `accounting.budgets.create` |
| `accounting.budgets.edit` |
| `property.buildings.view` |
| `property.buildings.create` |
| `property.buildings.edit` |
| `property.properties.view` |
| `property.properties.create` |
| `property.properties.edit` |
| `procurement.vendors.view` |

### Excluded — v1 permissions not granted to project_manager

| Permission key | Reason |
|----------------|--------|
| `reports.trial_balance.read` | Finance consolidation — accountant role |
| `reports.balance_sheet.read` | Finance consolidation |
| `payroll.read` | HR/payroll domain |
| `payroll.write` | HR/payroll domain |
| `users.read` | Administration |
| `users.manage` | Administration |
| `billing.read` | Administration |
| `billing.manage` | Administration |
| `audit_logs.read` | Administration |
| `permissions.read` | RBAC |
| `backups.read` | Administration |
| `backups.manage` | Administration |
| `pev.approve` | SoD — approver role |
| `pev.post` | GL posting — accountant role |
| `contracts.retention.override` | Elevated retention control |
| `procurement.quotations.approve` | SoD — approver role |
| `procurement.price_validation.override` | Elevated procurement |
| `purchase_order.approve` | SoD — approver role |
| `purchase_order.cancel` | Elevated procurement |
| `workflow.manage` | Workflow admin |
| `workflow.approve` | SoD — approver role |
| `workflow.admin` | Workflow admin |
| `goods_receipt.post` | GL posting step |
| `goods_receipt.close` | Elevated GRN |

### Excluded — full §2 financial.write keys not in PM subset

| Permission key |
|----------------|
| `accounting.access` |
| `accounting.chart_of_accounts.view` |
| `accounting.chart_of_accounts.create` |
| `accounting.chart_of_accounts.edit` |
| `accounting.chart_of_accounts.delete` |
| `accounting.categories.view` |
| `accounting.categories.create` |
| `accounting.categories.edit` |
| `accounting.categories.delete` |
| `accounting.journals.view` |
| `accounting.journals.create` |
| `accounting.journals.reverse` |
| `accounting.transactions.view` |
| `accounting.transactions.create` |
| `accounting.transactions.edit` |
| `accounting.periods.view` |
| `accounting.periods.open` |
| `accounting.periods.close` |
| `accounting.budgets.delete` |
| `accounting.investor_journals.create` |
| `accounting.transaction_audit.create` |
| `procurement.access` |
| `procurement.vendors.create` |
| `procurement.vendors.edit` |
| `procurement.vendors.delete` |
| `procurement.bills.view` |
| `procurement.bills.create` |
| `procurement.bills.edit` |
| `procurement.bills.delete` |
| `property.access` |
| `property.buildings.delete` |
| `property.properties.delete` |
| `rental.access` |
| `rental.agreements.view` |
| `rental.agreements.create` |
| `rental.agreements.edit` |
| `rental.agreements.delete` |
| `customers.access` |
| `customers.recurring_invoices.view` |
| `customers.recurring_invoices.create` |
| `customers.recurring_invoices.edit` |
| `customers.recurring_invoices.delete` |
| `property.pm_cycles.view` |
| `property.pm_cycles.edit` |
| `administration.settings.view` |
| `administration.settings.edit` |
| `administration.locks.edit` |
| `personal.finance.view` |
| `personal.finance.create` |
| `personal.finance.edit` |
| `personal.finance.delete` |
| `reports.custom.create` |
| `reports.custom.edit` |
| `reports.custom.delete` |
| `reports.custom.export` |
| `reports.designer.edit` |

### Excluded — all approve-type permissions (SoD + role boundary)

| Permission key |
|----------------|
| `payroll.runs.approve` |
| `procurement.purchase_orders.approve` |
| `procurement.bills.approve` |
| `accounting.journals.approve` |
| `approve.payments` |

**Total included:** 20 v1 keys + 19 v2 PM subset keys = **39 permissions** effective for `project_manager` (union, deduplicated).

---

## §12 — personal.finance classification (NM3)

### What it is

| Attribute | Value |
|-----------|-------|
| **Data type** | Tenant-scoped **personal ledger** — `personal_categories` and `personal_transactions` (migration `024_personal_finance.sql`) |
| **Business purpose** | Admin-managed personal income/expense tracking linked to chart-of-accounts (`account_id` FK) — **not** ERP business transactions, **not** per-user private wallets |
| **Current guard** | Mount: `requireFinancialWriteOnMutations`; router internal: `requireAdminRole` (legacy role string) |
| **Tables** | `personal_categories`, `personal_transactions` — both `tenant_id` scoped |

### Sensitivity

| Level | **Medium** |
|-------|------------|
| Rationale | Tenant admin configuration data; references GL accounts; not payroll PII; not cross-tenant |
| MFA policy | Standard login (not step-up unless tenant policy requires for admin) |
| Audit | Mutations via standard `withAudit()` / domain audit when implemented |

### Scope requirements

| Dimension | Required? |
|-----------|-------------|
| `project` | No |
| `property` | No |
| `owner` | No |
| `department` | No |
| **Authorization model** | Permission-gated (`personal.finance.*`); tenant-wide rows when permitted — no row-level scope |

Personal finance is **administration-adjacent**, not construction/rental/payroll domain data.

### Decision: include in `financial.write` bundle?

**No — remove from `FINANCIAL_WRITE_BUNDLE`.**

| Option | Verdict |
|--------|---------|
| Include in `financial.write` | **Rejected** — conflates GL admin personal ledger with core accounting write; incorrectly grants PM/accountant paths via bundle expansion |
| Standalone `personal.finance.*` | **Accepted** |

### Target permission keys

| Key | Purpose |
|-----|---------|
| `personal.finance.view` | List/read categories and transactions |
| `personal.finance.create` | Create categories and transactions |
| `personal.finance.edit` | Update |
| `personal.finance.delete` | Soft delete |

### Default role assignment (v2)

| Role | Granted? |
|------|----------|
| `super_admin` | Yes (all) |
| `company_admin` | Yes — default |
| `accountant` | **No** by default (optional grant by super_admin) |
| `project_manager` | **No** |
| `sales_user` | **No** |

### Migration path

1. **Phase 1** — Register keys in catalog; **exclude** from `FINANCIAL_WRITE_BUNDLE` in `permissionBundles.ts`.
2. **Phase 6** — Replace mount `requireFinancialWriteOnMutations` with `requirePermission('personal.finance.edit')` on mutations; `personal.finance.view` on GET.
3. **Phase 6** — Remove `requireAdminRole` role-string check from `personalFinanceRouter`; use permission guards only.

### Impact on §11 project_manager

`personal.finance.*` keys remain in **Excluded** list (§11) — unchanged.

---

*End of Permission Migration Map.*
