# SQLite (Local) vs PostgreSQL (Cloud) Schema Comparison

This document compares the local SQLite schema (desktop/Electron) with the PostgreSQL schema (server/cloud). Sync between them relies on compatible column names and entity mappings.

## Sources

| Database | Source | Purpose |
|----------|--------|---------|
| **SQLite** | `services/database/schema.ts` → `electron/schema.sql` | Local Electron desktop app, sql.js, sync_outbox |
| **PostgreSQL** | `server/migrations/postgresql-schema.sql` + migration files | Cloud API (Render), multi-tenant |

---

## 1. Tables Only in SQLite (Client-Only)

These tables exist locally for app state or sync and are **not** in PostgreSQL:

| Table | Purpose |
|-------|---------|
| `metadata` | Schema version, app settings |
| `sync_outbox` | Offline change queue (upstream sync) |
| `sync_metadata` | last_pull_at per tenant |
| `sync_conflicts` | Conflict audit trail |
| `app_settings` | App preferences (JSON) |
| `license_settings` | Local license cache |
| `chat_messages` | Local chat |
| `error_log` | Client error log |
| `transaction_log` | Client-side audit |
| `task_updates` | Task comment history |
| `task_performance_scores` | Leaderboard data |
| `task_performance_config` | KPI weights |
| `contract_categories` | Junction: contracts ↔ categories |
| `project_agreement_units` | Junction: agreements ↔ units |
| `p2p_bills` | P2P bill tracking |
| `p2p_audit_trail` | P2P audit |
| `registered_suppliers` | Supplier-buyer registry (may differ) |

---

## 2. Tables Only in PostgreSQL (Server-Only)

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant orgs |
| `admin_users` | Admin dashboard auth |
| `license_keys` | License issuance |
| `user_sessions` | JWT/session tracking |
| `schema_migrations` | Migration history |
| `payments` | License payments |
| `inventory_batches` | Inventory tracking |
| `investments` | Investment module |
| `shop_branches` | Shop POS branches |
| `shop_products` | Shop products |
| `shop_sales` | Shop sales |

---

## 3. Shared Tables – Column Differences

### accounts

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| description | ✓ TEXT | ✗ (missing) |
| user_id | ✓ TEXT | ✗ (missing) |
| version | ✓ INTEGER | ✗ |
| deleted_at | ✓ TEXT | ✗ |
| balance type | REAL | DECIMAL(15,2) |
| is_permanent | INTEGER | BOOLEAN |

### transactions

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| subtype | ✓ | ✗ |
| from_account_id | ✓ | ✗ |
| to_account_id | ✓ | ✗ |
| building_id | ✓ | ✗ |
| property_id | ✓ | ✗ |
| unit_id | ✓ | ✗ |
| contract_id | ✓ | ✗ |
| agreement_id | ✓ | ✗ |
| batch_id | ✓ | ✗ |
| is_system | ✓ | ✗ |
| version | ✓ | ✗ |
| deleted_at | ✓ | ✗ |
| amount type | REAL | DECIMAL(15,2) |
| date type | TEXT | DATE |

### invoices

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| paid_amount | ✓ | ✓ |
| project_id | ✓ | ✗ |
| building_id | ✓ | ✗ |
| property_id | ✓ | ✗ |
| unit_id | ✓ | ✗ |
| category_id | ✓ | ✗ |
| agreement_id | ✓ | ✗ |
| security_deposit_charge | ✓ | ✗ |
| service_charges | ✓ | ✗ |
| rental_month | ✓ | ✗ |
| description | ✓ | ✗ |
| version, deleted_at | ✓ | ✗ |
| due_date type | TEXT | DATE |

### bills

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| document_path | ✓ | ✗ |
| expense_category_items | ✓ | ✗ (or expense_bearer_type) |
| project_id | ✓ | ✗ |
| building_id | ✓ | ✗ |
| property_id | ✓ | ✗ |
| project_agreement_id | ✓ | ✗ |
| staff_id | ✓ | ✗ |
| version | ✓ | bill_version (different) |
| deleted_at | ✓ | ✗ |
| due_date | ✓ | ✗ (nullable in PG) |

### projects

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| description | ✓ | ✗ |
| color | ✓ | ✗ |
| pm_config | ✓ (JSON string) | ✗ |
| installment_config | ✓ (JSON string) | ✗ |
| version, deleted_at | ✓ | ✗ |

### buildings

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| description | ✓ | ✗ |
| color | ✓ | ✗ |
| version, deleted_at | ✓ | ✗ |

### properties

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| monthly_service_charge | ✓ | ✗ |
| description | ✓ | ✗ |
| version, deleted_at | ✓ | ✗ |

### units

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| sale_price | ✓ | ✗ |
| description | ✓ | ✗ |
| type | ✓ | ✗ |
| area | ✓ | ✗ |
| floor | ✓ | ✗ |
| version, deleted_at | ✓ | ✗ |

### rental_agreements

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| rent_due_date | ✓ | ✗ |
| description | ✓ | ✗ |
| security_deposit | ✓ | ✗ |
| broker_id | ✓ | ✗ |
| broker_fee | ✓ | ✗ |
| version, deleted_at | ✓ | ✗ |
| tenant_id | ✓ (SQLite) | org_id or tenant_id (PG) |

### installment_plans

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| duration_years | ✓ | ✓ (via migration 20260213) |
| down_payment_percentage | ✓ | ✓ (via migration 20260213) |
| frequency | ✓ | ✓ (via migration 20260213) |
| list_price | ✓ | ✓ (via migration 20260213) |
| customer_discount, floor_discount, etc. | ✓ | ✓ (via migration 20260213) |
| approval_requested_by, approval_requested_to | ✓ | ✓ (via migration 20260213) |
| selected_amenities | ✓ | ✓ (via migration 20260213, JSONB) |
| installment_amount | ✓ | ✓ (via migration 20260213) |
| version | ✓ | ✓ (via migration 20260213) |
| net_value | ✓ | ✓ (base PG) |

*Note: Migration `20260213_fix_marketing_schema.sql` adds many columns to PG `installment_plans`, aligning it with SQLite.*

### project_agreements

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| customer_discount, floor_discount, etc. | ✓ | ✗ |
| list_price_category_id | ✓ | ✗ |
| installment_plan | ✗ | ✓ (JSONB) |
| cancellation_details | ✓ | ✗ |
| version, deleted_at | ✓ | ✗ |

### contracts

| Column | SQLite | PostgreSQL |
|--------|--------|------------|
| terms_and_conditions | ✓ | ✗ |
| payment_terms | ✓ | ✗ |
| expense_category_items | ✓ | ✗ |
| description | ✓ | ✗ |
| document_path | ✓ | ✗ |
| area, rate | ✓ | ✗ |
| start_date, end_date | ✓ | ✗ |
| version, deleted_at | ✓ | ✗ |

---

## 4. Data Type Differences

| SQLite | PostgreSQL |
|--------|------------|
| INTEGER (0/1 for bool) | BOOLEAN |
| REAL | DECIMAL(15,2) |
| TEXT (ISO date) | DATE, TIMESTAMP |
| TEXT (JSON) | JSONB |
| No native FK enforcement | REFERENCES ... ON DELETE |
| datetime('now') | NOW() |

---

## 5. Sync Implications

1. **Extra columns in SQLite**: Sync writes server rows into local tables. Extra local columns stay unchanged (or get defaults). Generally safe.
2. **Extra columns in PostgreSQL**: Local pushes may omit columns the server expects; the API layer must allow nulls or defaults.
3. **Type coercion**: `snakeToCamel` and `rowToCamel` in state changes handle naming; types are coerced in the app/repositories.
4. **rental_agreements.org_id vs tenant_id**: PG may still use `org_id`; sync assumes `tenant_id`. Ensure API returns the correct field.
5. **installment_plans**: Migration `20260213` brings PG close to SQLite; ensure it is applied.

---

## 6. Migrations That Add PostgreSQL Columns

These migrations extend the base PostgreSQL schema toward SQLite:

| Migration | Tables Affected | Key Additions |
|-----------|-----------------|---------------|
| `20260213_fix_marketing_schema.sql` | installment_plans | duration_years, down_payment_*, frequency, list_price, discounts, approval_*, selected_amenities (JSONB), version |
| `20260216_add_missing_sync_metadata.sql` | many | deleted_at, version |
| `20260216_add_sync_audit_metadata.sql` | many | deleted_at, version |
| `20260211_add_previous_agreement_id.sql` | rental_agreements | previous_agreement_id |
| `20260211_add_expense_bearer_type_to_bills.sql` | bills | expense_bearer_type |
| `20260208_vendor_separation.sql` | bills, transactions, contracts, quotations | vendor_id |
| `postgresql-schema.sql` (inline) | transactions, bills, rental_agreements | user_id, bill_version, document_id, org_id |

*Ensure these migrations are applied on the target PostgreSQL instance before relying on schema parity.*

---

## 7. Recommendations

1. **Align schemas gradually** by adding the most important missing columns to PostgreSQL via migrations (e.g. `transactions.subtype`, `invoices.project_id`).
2. **Standardize rental_agreements**: Use `tenant_id` consistently in both databases.
3. **Document sync mapping**: The `ENTITY_KEY_MAP` in `appStateApi.ts` maps API keys to AppState; ensure PostgreSQL columns align with what the client expects.
4. **Test sync paths** for entities with schema differences (installment_plans, project_agreements, invoices, bills).
5. **Handle missing tables**: Sync skips entities not in `ENTITY_QUERIES`; confirm `inventory_items`, `warehouses` exist in PG if used.
