---
name: Database Operations Analysis
overview: Analyze all database save/delete/update operations to identify which ones are performed only in the local SQLite database and are not synchronized to cloud PostgreSQL. Document findings with specific file locations and operation types.
todos: []
---

# Database Oper

ations Analysis Plan

## Overview

This plan will identify all database operations (INSERT, UPDATE, DELETE) and determine which operations are performed only in the local SQLite database and are NOT synchronized to the cloud PostgreSQL database.

## Architecture

The application uses two separate database systems:

1. **Local Database (SQLite)**: Browser-based SQLite using sql.js

- Location: `services/database/databaseService.ts`
- Repositories: `services/database/repositories/`
- Storage: OPFS or localStorage

2. **Cloud Database (PostgreSQL)**: Server-side PostgreSQL

- Location: `server/services/databaseService.ts`
- API Routes: `server/api/routes/`
- Connection: PostgreSQL pool with connection string from `DATABASE_URL`

## Analysis Steps

### Step 1: Catalog Local Database Operations

Examine all repositories in `services/database/repositories/` and document:

- All INSERT operations (via `BaseRepository.insert()`)
- All UPDATE operations (via `BaseRepository.update()`)
- All DELETE operations (via `BaseRepository.delete()`, `deleteAll()`, `deleteAllUnfiltered()`)
- Custom operations in specialized repositories

**Files to analyze:**

- `services/database/repositories/baseRepository.ts` - Core CRUD operations
- `services/database/repositories/index.ts` - All repository definitions
- `services/database/repositories/appStateRepository.ts` - State management operations

### Step 2: Catalog Cloud PostgreSQL Operations

Examine all API routes in `server/api/routes/` and document:

- POST routes (INSERT operations)
- PUT/PATCH routes (UPDATE operations)
- DELETE routes (DELETE operations)

**Files to analyze:**

- `server/api/routes/*.ts` - All route files (21 files found)

### Step 3: Identify Local-Only Operations

Compare the two catalogs to find entities/tables that:

- Have local repositories with INSERT/UPDATE/DELETE operations
- Do NOT have corresponding API routes in `server/api/routes/`
- Are not synchronized to cloud PostgreSQL

### Step 4: Document Findings

Create a comprehensive report listing:

1. **Entities with BOTH local and cloud operations** (synchronized)
2. **Entities with ONLY local operations** (not synchronized)
3. **Operation types per entity** (INSERT/UPDATE/DELETE)
4. **File locations** where operations are performed

## Expected Findings

Based on initial analysis, entities likely to be **local-only** (not in cloud PostgreSQL):

1. **Quotations** - Has `QuotationsRepository`, no API route
2. **Documents** - Has `DocumentsRepository`, no API route
3. **Chat Messages** - Has `ChatMessagesRepository` with custom operations, explicitly local-only
4. **Tasks** - Has `TasksRepository`, no API route
5. **App Settings** - Has `AppSettingsRepository` with custom operations, no API route
6. **License Settings** - Part of local schema, no API route
7. **Error Log** - Has `ErrorLogRepository`, no API route
8. **Transaction Log** - Has `TransactionLogRepository`, no API route
9. **Recurring Invoice Templates** - Has `RecurringTemplatesRepository`, no API route
10. **Salary Components** - Has `SalaryComponentsRepository`, no API route
11. **Employees** - Has `EmployeesRepository`, no API route
12. **Payroll Cycles** - Has `PayrollCyclesRepository`, no API route
13. **Payslips** - Has `PayslipsRepository`, no API route
14. **Legacy Payslips** - Has `LegacyPayslipsRepository`, no API route
15. **Bonus Records** - Has `BonusRecordsRepository`, no API route
16. **Payroll Adjustments** - Has `PayrollAdjustmentsRepository`, no API route
17. **Loan Advance Records** - Has `LoanAdvanceRecordsRepository`, no API route
18. **Attendance Records** - Has `AttendanceRecordsRepository`, no API route
19. **Tax Configurations** - Has `TaxConfigurationsRepository`, no API route
20. **Statutory Configurations** - Has `StatutoryConfigurationsRepository`, no API route

**Entities with BOTH local and cloud operations:**

- Users, Accounts, Contacts, Categories, Projects, Buildings, Properties, Units, Transactions, Invoices, Bills, Budgets, Rental Agreements, Project Agreements, Contracts, Sales Returns

## Implementation Plan: Add Missing Entities to Cloud PostgreSQL

### Overview

Add all 20 local-only entities to cloud PostgreSQL with proper tenant_id and user_id support, following the existing patterns in the codebase.

### Implementation Steps

#### Phase 1: Database Schema Migration

**File:** `server/migrations/postgresql-schema.sql`

1. **Add table definitions** for all missing entities with:

- `tenant_id TEXT NOT NULL` (with foreign key to tenants)
- `user_id TEXT` (nullable, with foreign key to users)
- Proper indexes on `tenant_id` and `user_id`
- RLS policies for tenant isolation
- UNIQUE constraints where applicable (with tenant_id scope)

**Tables to add:**

- `quotations` - Vendor quotations with items
- `documents` - File attachments for various entities
- `tasks` - Todo list items (may be tenant-specific or global)
- `recurring_invoice_templates` - Templates for recurring invoices
- `salary_components` - Salary component definitions
- `employees` - Enterprise payroll employees
- `payroll_cycles` - Payroll processing cycles
- `payslips` - Employee payslips
- `legacy_payslips` - Legacy payslip records
- `bonus_records` - Employee bonus records
- `payroll_adjustments` - Payroll adjustment records
- `loan_advance_records` - Loan and advance records
- `attendance_records` - Employee attendance
- `tax_configurations` - Tax configuration settings
- `statutory_configurations` - Statutory configuration settings
- `transaction_log` - Audit log for transactions (already exists, but may need user_id)
- `error_log` - Error logging (may be global or tenant-specific)
- `app_settings` - Application settings (tenant-specific key-value store)
- `license_settings` - License settings (may be tenant-specific or global)
- `chat_messages` - Chat messages (may remain local-only based on design decision)

**Note:** Some tables may be tenant-global (like `tax_configurations`, `salary_components`) that are shared across tenants but configured per tenant.

#### Phase 2: Create API Routes

**Directory:** `server/api/routes/`Create new route files for each entity following the existing pattern:

- `server/api/routes/quotations.ts`
- `server/api/routes/documents.ts`
- `server/api/routes/tasks.ts`
- `server/api/routes/recurring-invoice-templates.ts`
- `server/api/routes/salary-components.ts`
- `server/api/routes/employees.ts`
- `server/api/routes/payroll-cycles.ts`
- `server/api/routes/payslips.ts`
- `server/api/routes/legacy-payslips.ts`
- `server/api/routes/bonus-records.ts`
- `server/api/routes/payroll-adjustments.ts`
- `server/api/routes/loan-advance-records.ts`
- `server/api/routes/attendance-records.ts`
- `server/api/routes/tax-configurations.ts`
- `server/api/routes/statutory-configurations.ts`
- `server/api/routes/transaction-log.ts`
- `server/api/routes/error-log.ts`
- `server/api/routes/app-settings.ts`

Each route file should implement:

- `GET /` - List all (filtered by tenant_id)
- `GET /:id` - Get by ID (with tenant_id check)
- `POST /` - Create new (with tenant_id and user_id)
- `PUT /:id` or `PATCH /:id` - Update (with tenant_id check, set user_id)
- `DELETE /:id` - Delete (with tenant_id check)

**Pattern to follow:** `server/api/routes/accounts.ts` or `server/api/routes/bills.ts`

#### Phase 3: Update API Router

**File:** `server/api/index.ts`Add all new routes to the Express router:

```typescript
import quotationsRouter from './routes/quotations';
import documentsRouter from './routes/documents';
// ... etc

app.use('/api/quotations', tenantMiddleware, quotationsRouter);
app.use('/api/documents', tenantMiddleware, documentsRouter);
// ... etc
```



#### Phase 4: Create API Repository Services (Frontend)

**Directory:** `services/api/repositories/`Create API repository classes that mirror the local repositories:

- `services/api/repositories/quotationsApi.ts`
- `services/api/repositories/documentsApi.ts`
- `services/api/repositories/tasksApi.ts`
- ... (etc for all entities)

**Pattern to follow:** `services/api/repositories/accountsApi.ts`

#### Phase 5: Update AppStateApi Service

**File:** `services/api/appStateApi.ts`Add methods to load/save all new entities:

- `loadQuotations()`, `saveQuotation()`, `deleteQuotation()`
- `loadDocuments()`, `saveDocument()`, `deleteDocument()`
- ... (etc for all entities)

#### Phase 6: Ensure User ID Tracking

**Pattern:** Follow existing user_id tracking patternAll INSERT/UPDATE operations should:

1. Get `user_id` from `req.user?.userId` (via auth middleware)
2. Include `user_id` in INSERT/UPDATE queries
3. Log to `transaction_audit_log` with user information

**Example pattern:**

```typescript
const userId = req.user?.userId || null;
await db.query(
  `INSERT INTO entity (id, tenant_id, user_id, ...) 
   VALUES ($1, $2, $3, ...)`,
  [entityId, req.tenantId, userId, ...]
);
```



### Key Implementation Details

1. **Tenant Isolation**: All tables must have `tenant_id` and use RLS policies
2. **User Tracking**: All mutable operations (INSERT/UPDATE) must track `user_id`
3. **Audit Trail**: Consider adding audit logs for sensitive operations
4. **Data Migration**: Plan for migrating existing local data to cloud (if needed)
5. **Backward Compatibility**: Ensure local database still works for offline mode

### Schema Conversion Notes

**SQLite to PostgreSQL conversions:**

- `TEXT` → `TEXT`
- `REAL` → `DECIMAL(15, 2)` for money, `DECIMAL` for other decimals
- `INTEGER` → `INTEGER` or `BOOLEAN` (for 0/1 flags)
- `datetime('now')` → `NOW()` or `DEFAULT NOW()`
- JSON strings → `JSONB` type
- UNIQUE constraints → `UNIQUE(tenant_id, column)` for tenant-scoped uniqueness

### Testing Checklist

- [ ] All tables created in PostgreSQL
- [ ] All routes respond correctly
- [ ] Tenant isolation working (users can't see other tenant data)
- [ ] User ID tracking working for all operations
- [ ] RLS policies enforcing tenant isolation
- [ ] Indexes created for performance
- [ ] Foreign key constraints working
- [ ] Frontend API repositories working
- [ ] Sync working between local and cloud

## Deliverables

1. **Database schema migration** - Updated `postgresql-schema.sql`
2. **API routes** - 18+ new route files in `server/api/routes/`
3. **Frontend API repositories** - 18+ new repository files in `services/api/repositories/`