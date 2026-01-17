# Rental Tenant ID to Contact ID Migration Plan

## Overview

Safe migration plan to rename `rental_agreements.tenant_id` to `contact_id` to eliminate confusion with organization `tenant_id`. This only affects the rental agreements table and related code, making it a much safer change than renaming organization tenant_id across the entire codebase.

## Current State Analysis

### Current Situation

1. **Organization `tenant_id`**: Used for multi-tenancy/data isolation across all tables
   - **Status**: ✅ Keep as-is (no changes needed)
   - Present in: accounts, contacts, categories, projects, buildings, properties, units, transactions, invoices, bills, budgets, quotations, documents, project_agreements, contracts, recurring_invoice_templates, salary_components, staff, employees, payroll_cycles, payslips, legacy_payslips, bonus_records, payroll_adjustments, loan_advance_records, tax_configurations, statutory_configurations, pm_cycle_allocations, tasks, users, license_keys

2. **Rental Tenant `tenant_id`**: Used in `rental_agreements` table to refer to contact person
   - **PostgreSQL**: Already uses `contact_id` ✅
   - **SQLite**: Still uses `tenant_id` ❌ (needs migration)
   - **API**: Transforms `contact_id` → `tenantId` in responses
   - **TypeScript**: `RentalAgreement.tenantId` refers to contact

### Key Findings

- **PostgreSQL schema** (`server/migrations/postgresql-schema.sql`): Already uses `contact_id` ✅
- **SQLite schema** (`services/database/schema.ts`): Still uses `tenant_id` ❌
- **API route** (`server/api/routes/rentalAgreements.ts`): Has transformation function mapping `contact_id` → `tenantId`
- **TypeScript interface** (`types.ts`): `RentalAgreement.tenantId` should become `contactId`

## Migration Strategy

### Phase 1: Database Schema Updates

#### 1.1 SQLite Migration
- Update `services/database/schema.ts`:
  - Change `rental_agreements.tenant_id` → `contact_id`
  - Update foreign key: `FOREIGN KEY (tenant_id) REFERENCES contacts(id)` → `FOREIGN KEY (contact_id) REFERENCES contacts(id)`
  - Remove `org_id` column if it doesn't exist (or ensure it exists for organization isolation)

#### 1.2 PostgreSQL Schema Verification
- Verify `server/migrations/postgresql-schema.sql` already uses `contact_id` ✅
- Ensure `org_id` exists for organization isolation ✅

#### 1.3 Create Migration Scripts
- **SQLite**: Create migration utility to rename column in existing databases
- **PostgreSQL**: Verify no migration needed (already correct)

### Phase 2: Backend API Updates

#### 2.1 Remove Transformation Function
- Update `server/api/routes/rentalAgreements.ts`:
  - Remove `transformRentalAgreement` function (no longer needed)
  - API responses will directly use `contactId` instead of transforming

#### 2.2 Update API Route Queries
- Verify all queries in `rentalAgreements.ts` use `contact_id` (already correct in PostgreSQL)
- Update any SQLite-specific queries if needed

### Phase 3: TypeScript Type Updates

#### 3.1 Update RentalAgreement Interface
- Update `types.ts`:
  - Change `RentalAgreement.tenantId` → `RentalAgreement.contactId`
  - Update comment to clarify it's the contact person, not organization

### Phase 4: Frontend Updates

#### 4.1 Update Components Using RentalAgreement
- Search for all components using `rentalAgreement.tenantId`
- Update to use `rentalAgreement.contactId`

**Files to check:**
- `components/rentalAgreements/RentalAgreementForm.tsx`
- `components/rentalAgreements/RentalAgreementsPage.tsx`
- `components/invoices/InvoiceBillForm.tsx`
- `components/reports/TenantLedgerReport.tsx`
- Any other components referencing rental agreements

#### 4.2 Update Import/Export Services
- `services/importService.ts` - Update rental agreement import logic
- `services/exportService.ts` - Update rental agreement export logic
- `services/backupMigration.ts` - Update normalization function

### Phase 5: Repository Updates

#### 5.1 Update Base Repository
- `services/database/repositories/baseRepository.ts`:
  - Remove special handling for `rental_agreements.tenant_id` (if any)
  - Verify queries use `contact_id` correctly

### Phase 6: Testing & Validation

#### 6.1 Database Migration Testing
- Test SQLite migration on local database
- Verify data integrity
- Verify foreign key constraints work

#### 6.2 API Testing
- Test rental agreements CRUD operations
- Verify API responses use `contactId` instead of `tenantId`
- Test filtering by contact

#### 6.3 Frontend Testing
- Test rental agreement forms
- Test rental agreement lists
- Test invoice generation from rental agreements
- Test reports using rental agreements

## Implementation Details

### SQLite Schema Change

**Current:**
```sql
CREATE TABLE IF NOT EXISTS rental_agreements (
    id TEXT PRIMARY KEY,
    agreement_number TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL,  -- ❌ Should be contact_id
    property_id TEXT NOT NULL,
    ...
    org_id TEXT,  -- ✅ Already correct for organization
    FOREIGN KEY (tenant_id) REFERENCES contacts(id) ON DELETE RESTRICT
);
```

**After Migration:**
```sql
CREATE TABLE IF NOT EXISTS rental_agreements (
    id TEXT PRIMARY KEY,
    agreement_number TEXT NOT NULL UNIQUE,
    contact_id TEXT NOT NULL,  -- ✅ Renamed
    property_id TEXT NOT NULL,
    ...
    org_id TEXT,  -- ✅ Organization isolation
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT
);
```

### API Response Change

**Current:**
```typescript
// API transforms contact_id → tenantId
{
  id: "...",
  contactId: "...",  // From DB
  tenantId: "...",   // Transformed (confusing!)
  ...
}
```

**After Migration:**
```typescript
// Direct mapping, no transformation
{
  id: "...",
  contactId: "...",  // Clear and consistent
  ...
}
```

### TypeScript Interface Change

**Current:**
```typescript
export interface RentalAgreement {
  id: string;
  agreementNumber: string;
  tenantId: string; // ❌ Confusing name
  propertyId: string;
  ...
}
```

**After Migration:**
```typescript
export interface RentalAgreement {
  id: string;
  agreementNumber: string;
  contactId: string; // ✅ Clear name
  propertyId: string;
  ...
}
```

## Risk Assessment

**Risk Level**: Low ✅

**Why it's safe:**
- Only affects one table (`rental_agreements`)
- PostgreSQL already uses `contact_id` (proven approach)
- No changes to core multi-tenancy logic
- Limited scope of changes
- Easy to test and verify

**Potential Issues:**
- Frontend components need updates (but straightforward)
- API response format changes (breaking change for API consumers)
- Need to handle backward compatibility if needed

## Backward Compatibility

**Options:**
1. **Clean break**: Remove `tenantId` from API responses (recommended)
2. **Temporary support**: Keep both `contactId` and `tenantId` during transition, then remove `tenantId` in next version

**Recommendation**: Clean break with clear migration notes for API consumers.

## Success Criteria

1. ✅ SQLite schema uses `contact_id` instead of `tenant_id`
2. ✅ PostgreSQL schema verified (already correct)
3. ✅ API responses use `contactId` instead of `tenantId`
4. ✅ TypeScript interface updated
5. ✅ All frontend components updated
6. ✅ All tests passing
7. ✅ No data loss
8. ✅ Clear distinction between organization `tenant_id` and rental `contact_id`

## Estimated Impact

- **Database Tables**: 1 table (`rental_agreements`)
- **API Routes**: 1 route file (`rentalAgreements.ts`)
- **Frontend Files**: ~5-10 component files
- **Type Files**: 1 file (`types.ts`)
- **Migration Time**: 2-4 hours (including testing)
- **Risk Level**: Low ✅

## Implementation Todos

### Phase 1: Database Schema
- [ ] Update `services/database/schema.ts` - Change `tenant_id` to `contact_id` in rental_agreements table
- [ ] Update foreign key constraint in SQLite schema
- [ ] Create SQLite migration script to rename column in existing databases
- [ ] Verify PostgreSQL schema already uses `contact_id` (no changes needed)
- [ ] Test SQLite migration on local database

### Phase 2: Backend API
- [ ] Update `server/api/routes/rentalAgreements.ts`:
  - Remove `transformRentalAgreement` function
  - Update API responses to use `contactId` directly
  - Verify all queries use `contact_id`
- [ ] Test all rental agreement API endpoints

### Phase 3: TypeScript Types
- [ ] Update `types.ts`:
  - Change `RentalAgreement.tenantId` → `RentalAgreement.contactId`
  - Update interface comment/documentation

### Phase 4: Frontend Components
- [ ] Update `components/rentalAgreements/RentalAgreementForm.tsx`
- [ ] Update `components/rentalAgreements/RentalAgreementsPage.tsx`
- [ ] Update `components/invoices/InvoiceBillForm.tsx`
- [ ] Update `components/reports/TenantLedgerReport.tsx`
- [ ] Search and update any other components using `rentalAgreement.tenantId`

### Phase 5: Services
- [ ] Update `services/importService.ts` - Rental agreement import logic
- [ ] Update `services/exportService.ts` - Rental agreement export logic
- [ ] Update `services/backupMigration.ts` - Normalization function
- [ ] Update `services/database/repositories/baseRepository.ts` (if needed)

### Phase 6: Testing
- [ ] Test SQLite database migration
- [ ] Test PostgreSQL (verify no changes needed)
- [ ] Test API endpoints (GET, POST, PUT, DELETE)
- [ ] Test rental agreement forms
- [ ] Test rental agreement lists
- [ ] Test invoice generation
- [ ] Test reports
- [ ] Verify no breaking changes in other features

### Phase 7: Documentation
- [ ] Update API documentation
- [ ] Add migration notes for API consumers
- [ ] Update code comments explaining the distinction
