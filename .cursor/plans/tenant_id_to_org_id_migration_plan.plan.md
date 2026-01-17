# Tenant ID to Org ID Migration Plan

## Overview

Comprehensive migration plan to rename all organization `tenant_id` columns to `org_id` across PostgreSQL and SQLite databases, API routes, middleware, types, and all related code to eliminate confusion with rental tenant `tenant_id`.

## Current State Analysis

### Two Different `tenant_id` Concepts

1. **Organization `tenant_id`**: Used for multi-tenancy/data isolation (should become `org_id`)

- Present in: accounts, contacts, categories, projects, buildings, properties, units, transactions, invoices, bills, budgets, quotations, documents, project_agreements, contracts, recurring_invoice_templates, salary_components, staff, employees, payroll_cycles, payslips, legacy_payslips, bonus_records, payroll_adjustments, loan_advance_records, tax_configurations, statutory_configurations, pm_cycle_allocations, tasks, users, license_keys

2. **Rental Tenant `tenant_id`**: Used in `rental_agreements` table to refer to contact person (stays as `tenant_id` or becomes `contact_id`)

- Currently: `rental_agreements.tenant_id` refers to contact (rental tenant person)
- Already migrated: `rental_agreements.org_id` exists for organization isolation

### Key Files to Update

**Database Schemas:**

- `server/migrations/postgresql-schema.sql` - PostgreSQL schema
- `services/database/schema.ts` - SQLite schema

**API & Middleware:**

- `server/middleware/tenantMiddleware.ts` - `req.tenantId` → `req.orgId`
- `server/api/routes/*.ts` - All route files using `req.tenantId`
- All API queries filtering by `tenant_id`

**Types & Interfaces:**

- `server/middleware/tenantMiddleware.ts` - `TenantRequest` interface
- JWT token structure (auth routes)

**Repositories:**

- `services/database/repositories/baseRepository.ts` - Special handling for rental_agreements
- All repository queries

**Frontend:**

- `context/AuthContext.tsx` - Context that provides tenantId
- `context/AppContext.tsx` - Any tenant-related state
- Any components using tenantId from context

**Services:**

- `services/database/tenantUtils.ts` - Utility functions
- `services/database/tenantMigration.ts` - Migration utilities
- `services/api/client.ts` - API client
- Import/export services

## Migration Strategy

### Phase 1: Database Schema Updates

#### 1.1 PostgreSQL Migration Script

Create migration script: `server/migrations/migrate-tenant-id-to-org-id.sql`

**Tables to migrate (excluding rental_agreements which already uses org_id):**

- users
- license_keys
- accounts
- contacts
- categories
- transactions
- projects
- buildings
- properties
- units
- invoices
- bills
- budgets
- quotations
- documents
- project_agreements
- contracts
- recurring_invoice_templates
- salary_components
- staff
- employees
- payroll_cycles
- payslips
- legacy_payslips
- bonus_records
- payroll_adjustments
- loan_advance_records
- tax_configurations
- statutory_configurations
- pm_cycle_allocations
- tasks

**Migration steps:**

1. Add `org_id` column to all tables (nullable initially)
2. Copy data from `tenant_id` to `org_id`
3. Update foreign key constraints
4. Update indexes (drop old, create new)
5. Update unique constraints
6. Drop old `tenant_id` column
7. Make `org_id` NOT NULL

#### 1.2 SQLite Migration Script

Create migration utility: `services/database/migrations/migrate-tenant-id-to-org-id.ts`

Similar steps as PostgreSQL but using SQLite syntax.

#### 1.3 Update Schema Definitions

- Update `server/migrations/postgresql-schema.sql` - Replace all `tenant_id` with `org_id` (except rental_agreements)
- Update `services/database/schema.ts` - Replace all `tenant_id` with `org_id` (except rental_agreements)

### Phase 2: Backend API Updates

#### 2.1 Middleware Updates

- `server/middleware/tenantMiddleware.ts`:
- Change `TenantRequest.tenantId` → `TenantRequest.orgId`
- Update JWT decoding: `decoded.tenantId` → `decoded.orgId`
- Update all references to `req.tenantId` → `req.orgId`

#### 2.2 API Routes

Update all route files in `server/api/routes/`:

- Replace `req.tenantId` with `req.orgId`
- Update all SQL queries: `tenant_id = $1` → `org_id = $1`
- Update WHERE clauses in all queries
- Update INSERT statements
- Update UPDATE statements

**Files to update:**

- accounts.ts
- contacts.ts
- categories.ts
- transactions.ts
- projects.ts
- buildings.ts
- properties.ts
- units.ts
- invoices.ts
- bills.ts
- budgets.ts
- quotations.ts
- documents.ts
- projectAgreements.ts
- contracts.ts
- recurring-invoice-templates.ts
- salary-components.ts
- employees.ts
- payroll-cycles.ts
- payslips.ts
- legacy-payslips.ts
- bonus-records.ts
- payroll-adjustments.ts
- loan-advance-records.ts
- tax-configurations.ts
- statutory-configurations.ts
- pm-cycle-allocations.ts
- tasks.ts
- users.ts
- tenants.ts
- auth.ts (JWT token generation)
- data-import-export.ts
- payments.ts
- All other route files

#### 2.3 Repository Updates

- `services/database/repositories/baseRepository.ts`:
- Update special handling: Use `org_id` for all tables (rental_agreements already uses org_id)
- Remove special case for rental_agreements
- Update all queries

#### 2.4 Service Updates

- `services/database/tenantUtils.ts` - Update utility functions
- `services/database/tenantMigration.ts` - Update migration utilities
- `server/services/dataImportService.ts` - Update import queries
- `server/services/dataExportService.ts` - Update export queries
- `server/services/templateService.ts` - Update template queries
- All other services using tenant_id

### Phase 3: Frontend Updates

#### 3.1 Context Updates

- `context/AuthContext.tsx`:
- Update context to provide `orgId` instead of `tenantId`
- Update JWT token handling
- Update login/logout flows

- `context/AppContext.tsx`:
- Update any tenant-related state

#### 3.2 API Client Updates

- `services/api/client.ts`:
- Update to use `orgId` in headers/requests if needed

#### 3.3 Component Updates

- Search for all components using `tenantId` from context
- Update to use `orgId`

### Phase 4: Type Definitions

#### 4.1 Update TypeScript Interfaces

- Update `TenantRequest` interface in middleware
- Update any other types referencing `tenantId` for organization

### Phase 5: JWT Token Updates

#### 5.1 Auth Route Updates

- `server/api/routes/auth.ts`:
- Update JWT token generation: `tenantId` → `orgId` in payload
- Update token verification

### Phase 6: Testing & Validation

#### 6.1 Database Migration Testing

- Test PostgreSQL migration on staging
- Test SQLite migration locally
- Verify data integrity
- Verify foreign key constraints
- Verify indexes

#### 6.2 API Testing

- Test all API endpoints
- Verify tenant isolation still works
- Test authentication/authorization

#### 6.3 Integration Testing

- Test full user flows
- Test import/export
- Test sync functionality

## Implementation Phases

### Phase 1: Preparation

1. Create backup scripts for both databases
2. Document all current usages
3. Create rollback scripts

### Phase 2: Database Migration

1. Run PostgreSQL migration on staging
2. Run SQLite migration locally
3. Verify data integrity

### Phase 3: Backend Updates

1. Update middleware
2. Update all API routes
3. Update repositories
4. Update services

### Phase 4: Frontend Updates

1. Update contexts
2. Update components
3. Update API client

### Phase 5: Testing

1. Unit tests
2. Integration tests
3. End-to-end tests

### Phase 6: Deployment

1. Deploy to staging
2. Full testing on staging
3. Deploy to production
4. Monitor for issues

## Special Considerations

### Rental Agreements Table

- **Keep as-is**: `rental_agreements` already uses `org_id` for organization
- **Consider**: Rename `rental_agreements.tenant_id` to `contact_id` for clarity (separate task)

### Backward Compatibility

- Consider maintaining temporary support for `tenantId` in JWT tokens during transition
- Add logging to track any remaining `tenantId` usage

### Index Updates

- All indexes on `tenant_id` need to be recreated on `org_id`
- Update composite indexes that include `tenant_id`

### Foreign Key Constraints

- All foreign keys referencing `tenants(id)` via `tenant_id` need to be updated to `org_id`

### Unique Constraints

- Update unique constraints that include `tenant_id` (e.g., `UNIQUE(tenant_id, invoice_number)`)

## Risk Mitigation

1. **Data Loss Prevention:**

- Full database backups before migration
- Test migrations on copy of production data
- Verify row counts before/after

2. **Downtime Minimization:**

- Plan migration during low-traffic period
- Consider blue-green deployment strategy

3. **Rollback Plan:**

- Keep old columns temporarily
- Create reverse migration script
- Test rollback procedure

4. **Monitoring:**

- Add logging for any `tenantId` references
- Monitor error rates during migration
- Set up alerts for data integrity issues

## Success Criteria

1. All database columns renamed from `tenant_id` to `org_id` (except rental_agreements.tenant_id)
2. All API routes updated and tested
3. All frontend code updated
4. No data loss
5. All tests passing
6. Production deployment successful
7. No increase in error rates

## Estimated Impact

- **Database Tables**: ~30 tables
- **API Routes**: ~40+ route files
- **Frontend Files**: ~10-20 files
- **Migration Time**: 4-8 hours (including testing)
- **Risk Level**: High (touches core multi-tenancy logic)

## Implementation Todos

### Phase 1: Preparation & Database Migration

- [ ] Create PostgreSQL migration script (`server/migrations/migrate-tenant-id-to-org-id.sql`)
- Add `org_id` column to all tables (nullable)
- Copy data from `tenant_id` to `org_id`
- Update foreign key constraints
- Update indexes
- Update unique constraints
- Drop old `tenant_id` column
- Make `org_id` NOT NULL
- [ ] Create SQLite migration script (`services/database/migrations/migrate-tenant-id-to-org-id.ts`)
- [ ] Create database backup scripts for PostgreSQL and SQLite
- [ ] Create rollback scripts
- [ ] Test migrations on staging database copy
- [ ] Update `server/migrations/postgresql-schema.sql` - Replace `tenant_id` with `org_id` (except rental_agreements)
- [ ] Update `services/database/schema.ts` - Replace `tenant_id` with `org_id` (except rental_agreements)

### Phase 2: Backend Middleware & Types

- [ ] Update `server/middleware/tenantMiddleware.ts`:
- Change `TenantRequest.tenantId` → `TenantRequest.orgId`
- Update JWT decoding: `decoded.tenantId` → `decoded.orgId`
- Update all `req.tenantId` → `req.orgId` references
- [ ] Update JWT token generation in `server/api/routes/auth.ts`:
- Change token payload: `tenantId` → `orgId`
- Update token verification

### Phase 3: Backend API Routes

- [ ] Update `server/api/routes/accounts.ts`
- [ ] Update `server/api/routes/contacts.ts`
- [ ] Update `server/api/routes/categories.ts`
- [ ] Update `server/api/routes/transactions.ts`
- [ ] Update `server/api/routes/projects.ts`
- [ ] Update `server/api/routes/buildings.ts`
- [ ] Update `server/api/routes/properties.ts`
- [ ] Update `server/api/routes/units.ts`
- [ ] Update `server/api/routes/invoices.ts`
- [ ] Update `server/api/routes/bills.ts`
- [ ] Update `server/api/routes/budgets.ts`
- [ ] Update `server/api/routes/quotations.ts`
- [ ] Update `server/api/routes/documents.ts`
- [ ] Update `server/api/routes/projectAgreements.ts`
- [ ] Update `server/api/routes/contracts.ts`
- [ ] Update `server/api/routes/recurring-invoice-templates.ts`
- [ ] Update `server/api/routes/salary-components.ts`
- [ ] Update `server/api/routes/employees.ts`
- [ ] Update `server/api/routes/payroll-cycles.ts`
- [ ] Update `server/api/routes/payslips.ts`
- [ ] Update `server/api/routes/legacy-payslips.ts`
- [ ] Update `server/api/routes/bonus-records.ts`
- [ ] Update `server/api/routes/payroll-adjustments.ts`
- [ ] Update `server/api/routes/loan-advance-records.ts`
- [ ] Update `server/api/routes/tax-configurations.ts`
- [ ] Update `server/api/routes/statutory-configurations.ts`
- [ ] Update `server/api/routes/pm-cycle-allocations.ts`
- [ ] Update `server/api/routes/tasks.ts`
- [ ] Update `server/api/routes/users.ts`
- [ ] Update `server/api/routes/tenants.ts`
- [ ] Update `server/api/routes/data-import-export.ts`
- [ ] Update `server/api/routes/payments.ts`
- [ ] Update all other route files using `req.tenantId`

### Phase 4: Backend Repositories & Services

- [ ] Update `services/database/repositories/baseRepository.ts`:
- Remove special case for rental_agreements (now all tables use org_id)
- Update all queries to use `org_id`
- [ ] Update `services/database/tenantUtils.ts`
- [ ] Update `services/database/tenantMigration.ts`
- [ ] Update `server/services/dataImportService.ts`
- [ ] Update `server/services/dataExportService.ts`
- [ ] Update `server/services/templateService.ts`
- [ ] Update all other services using `tenant_id`

### Phase 5: Frontend Updates

- [ ] Update `context/AuthContext.tsx`:
- Change context to provide `orgId` instead of `tenantId`
- Update JWT token handling
- Update login/logout flows
- [ ] Update `context/AppContext.tsx` (if tenant-related state exists)
- [ ] Update `services/api/client.ts` (if needed)
- [ ] Search and update all components using `tenantId` from context
- [ ] Update any frontend types/interfaces

### Phase 6: Testing & Validation

- [ ] Test PostgreSQL migration on staging
- [ ] Test SQLite migration locally
- [ ] Verify data integrity (row counts, foreign keys)
- [ ] Test all API endpoints
- [ ] Verify tenant isolation still works
- [ ] Test authentication/authorization
- [ ] Test import/export functionality
- [ ] Test sync functionality
- [ ] Run full integration tests
- [ ] Test user flows end-to-end

### Phase 7: Deployment

- [ ] Deploy to staging environment
- [ ] Full testing on staging
- [ ] Create production deployment plan
- [ ] Execute production migration
- [ ] Monitor for issues post-deployment
- [ ] Verify no increase in error rates