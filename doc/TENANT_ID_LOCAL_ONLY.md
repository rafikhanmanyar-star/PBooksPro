# `tenant_id` in local-only / single-company SQLite

## Current model

- The app uses **one SQLite file per company** (company registry + `companyBridge` in Electron). That is the real isolation boundary — not SaaS multi-tenancy.
- Table column **`tenant_id`** is **legacy** from the cloud PostgreSQL schema. In local-only mode, the DB layer **normalizes** values to the sentinel `'local'` (see `services/database/databaseService.ts` and init/repair paths).
- **`tenantUtils.ts`**: `getCurrentTenantId()` returns `'local'`; `shouldFilterByTenant()` returns `false`. Application code should not rely on per-row tenant filtering for security — the **file** is the boundary.

## Naming confusion

- **Rental “tenant”** (occupant) is a **domain** concept (`contact_id`, agreements, etc.), unrelated to the `tenant_id` column.

## Future migration (optional)

1. **Short term**: Keep columns and indexes; treat `tenant_id` as a fixed org key (`'local'`) in every row.
2. **Long term**: A dedicated migration could rename to `org_scope` or drop the column and adjust `UNIQUE(tenant_id, …)` constraints — requires a one-time SQLite migration and full query audit. Do **not** drop columns without updating indexes and constraints.

## Multi-company vs multi-tenant

- **Multi-company** = multiple registered companies, each with its own DB path — **supported**.
- **Multi-tenant SaaS** = one shared DB with `tenant_id` isolation — **not** the target architecture for this build.
