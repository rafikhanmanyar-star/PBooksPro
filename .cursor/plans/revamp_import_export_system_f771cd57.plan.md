---
name: Revamp Import Export System
overview: Create a user-friendly import/export system with Excel templates (multi-sheet format) for Contacts, Projects, Properties, Buildings, Units, Categories, and Accounts. Export includes current data with sample entries. Import automatically adds tenant_id and user_id, and skips duplicates with user alerts.
todos:
  - id: create-api-endpoints
    content: Create new API endpoints in server/api/routes/data-import-export.ts for template download, export, and import
    status: completed
  - id: create-template-service
    content: Create server/services/templateService.ts to generate Excel templates with proper column headers and sample data
    status: completed
  - id: create-import-service
    content: Create server/services/dataImportService.ts with all-or-nothing validation (no DB changes if errors exist), duplicate detection, foreign key resolution, and auto-assignment of tenant_id/user_id
    status: completed
    dependencies:
      - create-api-endpoints
  - id: create-export-service
    content: Create server/services/dataExportService.ts to export current data with foreign key names resolved to friendly names
    status: completed
    dependencies:
      - create-api-endpoints
  - id: create-wizard-ui
    content: Create new wizard-style UI component components/settings/ImportExportWizard.tsx with step-by-step flow
    status: completed
    dependencies:
      - create-api-endpoints
  - id: update-import-page
    content: Mark old ImportPage.tsx as deprecated (keep for reference, redirect to new wizard)
    status: completed
    dependencies:
      - create-wizard-ui
  - id: update-export-ui
    content: Add export functionality to settings page using new export endpoint
    status: completed
    dependencies:
      - create-export-service
  - id: register-api-routes
    content: Register new data-import-export router in server/api/index.ts
    status: completed
    dependencies:
      - create-api-endpoints
  - id: deprecate-old-code
    content: Mark old import/export services as deprecated (keep for reference but disable in UI)
    status: completed
    dependencies:
      - update-import-page
      - update-export-ui
---

# Revamp Import/Export System

## Overview

Revamp the import/export process to be user-friendly with Excel templates containing multiple sheets (one per entity type). The system will automatically handle tenant_id and user_id assignment during import, and alert users when duplicate entries are skipped.

**Critical Requirements:**

- **All-or-Nothing Import**: If ANY validation errors exist, NO database changes will be made. User must correct errors in Excel and re-upload.
- **No System Changes**: Changes are limited ONLY to import/export functionality. No modifications to other parts of the system.
- **No Database Schema Changes**: Excel templates must align with the CURRENT database schema only.
- **Wizard-Style UI**: Redesign the import/export page as a step-by-step wizard for better user experience.

## Database Schema Reference

Based on `server/migrations/postgresql-schema.sql`:

- **Contacts**: id, tenant_id, name, type, description, contact_no, company_name, address
- **Projects**: id, tenant_id, name, description, color, status, pm_config, installment_config
- **Properties**: id, tenant_id, name, owner_id (FK to contacts), building_id (FK to buildings), description, monthly_service_charge
- **Buildings**: id, tenant_id, name, description, color
- **Units**: id, tenant_id, name, project_id (FK to projects), contact_id (FK to contacts), sale_price, description
- **Categories**: id, tenant_id, name, type, description, is_permanent, is_rental, parent_category_id
- **Accounts**: id, tenant_id, name, type, balance, is_permanent, description, parent_account_id

## Implementation Plan

### 1. Create New Import/Export API Endpoints

**File**: `server/api/routes/data-import-export.ts` (new file)

- `GET /api/data-import-export/template` - Download Excel template with all entity sheets
- `GET /api/data-import-export/export` - Export current data as Excel with sample entries
- `POST /api/data-import-export/import` - Import Excel file with validation and duplicate checking

**Key Features**:

- Extract `tenant_id` and `user_id` from `TenantRequest` (via `tenantMiddleware`)
- Validate Excel structure (required sheets and columns)
- Check for duplicates before inserting
- Return detailed import results with skipped entries

### 2. Create Template Generation Service

**File**: `server/services/templateService.ts` (new file)

Generate Excel workbook with sheets:

- **Contacts**: name (required), type (required), description, contact_no, company_name, address
- **Projects**: name (required), description, color, status
- **Properties**: name (required), owner_name (lookup), building_name (lookup), description, monthly_service_charge
- **Buildings**: name (required), description, color
- **Units**: name (required), project_name (lookup), contact_name (optional lookup), sale_price, description
- **Categories**: name (required), type (required), description, is_permanent, is_rental, parent_category_name (lookup)
- **Accounts**: name (required), type (required), balance, is_permanent, description, parent_account_name (lookup)

Each sheet includes:

- Header row with column names
- One sample data row (for export) or empty row (for template)
- Data validation hints in second row (optional)

### 3. Create Import Processing Service

**File**: `server/services/dataImportService.ts` (new file)

**Import Logic (All-or-Nothing Approach)**:

1. **Validation Phase** (No database writes):

   - Parse Excel file using `xlsx` library
   - Validate sheet names and required columns exist
   - For each row in each sheet:
     - Validate required fields are present and non-empty
     - Resolve foreign key lookups (e.g., owner_name → owner_id, building_name → building_id)
     - Check for duplicates in database (by name for most entities, with tenant_id scope)
     - Collect ALL validation errors and duplicate warnings

2. **Decision Point**:

   - If ANY validation errors exist (missing required fields, invalid foreign keys, etc.):
     - **STOP** - Do not proceed with any database writes
     - Return comprehensive error report with row numbers and specific issues
     - User must correct Excel file and re-upload

3. **Import Phase** (Only if validation passes completely):

   - For each valid row:
     - Skip duplicates (log as warning, not error)
     - Insert new records with auto-generated IDs
     - Auto-assign `tenant_id` and `user_id` from request context
   - Use database transaction to ensure atomicity (all-or-nothing)

4. **Return Import Summary**:

   - Successfully imported count per entity
   - Skipped duplicates count per entity (with details)
   - List of skipped entries with reasons
   - If validation failed: detailed list of ALL errors with row numbers

**Duplicate Detection**:

- **Contacts**: By `name` (case-insensitive, trimmed) within tenant
- **Projects**: By `name` within tenant
- **Properties**: By `name` within tenant
- **Buildings**: By `name` within tenant
- **Units**: By `name` within tenant
- **Categories**: By `name` and `type` within tenant
- **Accounts**: By `name` and `type` within tenant

### 4. Create Export Service

**File**: `server/services/dataExportService.ts` (new file)

**Export Logic**:

1. Fetch all current data for each entity type (filtered by tenant_id)
2. Transform data for Excel:

   - Convert foreign keys to friendly names (e.g., owner_id → owner_name)
   - Format dates, decimals appropriately
   - Include one sample row if data exists

3. Generate Excel workbook with multiple sheets
4. Return file for download

### 5. Create Wizard-Style Import/Export UI

**File**: `components/settings/ImportExportWizard.tsx` (new component)

**Wizard Steps**:

**Step 1: Choose Action**

- Option 1: "Download Template" - Get empty template with column headers
- Option 2: "Export Current Data" - Download existing data with sample entries for editing
- Option 3: "Import Data" - Upload filled Excel file

**Step 2a (Template/Export):**

- Show download button
- Display instructions on how to use the template
- Show sample column structure

**Step 2b (Import):**

- File upload area with drag & drop
- Show file name once selected
- "Validate & Import" button

**Step 3 (Import Results):**

- **If Validation Errors Exist:**
  - Display error summary with counts
  - Show detailed error list with:
    - Sheet name
    - Row number
    - Field name
    - Error message
  - Highlight that NO changes were made to database
  - Provide "Download Error Report" button (Excel with errors highlighted)
  - Show "Upload Corrected File" button to retry

- **If Validation Passed:**
  - Show success summary
  - Display imported counts per entity type
  - Show skipped duplicates (with details)
  - Option to export updated data

**UI Design Features:**

- Progress indicator showing current step
- Back/Next navigation buttons
- Clear visual feedback (success/error states)
- Responsive design for mobile/desktop
- Help tooltips explaining each step

**Remove from Old ImportPage.tsx**:

- All `ImportType` enum usage
- Complex import type selection dropdown
- Old import validation logic
- Keep file for backward compatibility but mark as deprecated

### 6. Update Frontend Export Functionality

**File**: `components/settings/SettingsPage.tsx` or create new component

**Changes**:

- Add "Export Data" button that calls new export endpoint
- Remove old export functionality tied to `exportService.ts`

### 7. Remove Old Import/Export Code

**Files to modify**:

- `services/importService.ts` - Comment out or remove unused import functions
- `services/exportService.ts` - Comment out or remove unused export functions
- `services/importSchemas.ts` - Can be kept for reference but not used
- `services/exportSchemas.ts` - Can be kept for reference but not used

**Note**: Keep files for now but mark as deprecated. Remove completely after testing.

### 8. Add API Route Registration

**File**: `server/api/index.ts`

Add new route:

```typescript
import dataImportExportRouter from './routes/data-import-export.js';
// ...
app.use('/api/data-import-export', dataImportExportRouter);
```

## Technical Details

### Excel Library

Use `xlsx` (SheetJS) library which is already in the project.

### Foreign Key Resolution

For entities with foreign keys:

- **Properties**: Lookup `owner_name` in contacts table, `building_name` in buildings table
- **Units**: Lookup `project_name` in projects table, `contact_name` in contacts table
- **Categories**: Lookup `parent_category_name` in categories table
- **Accounts**: Lookup `parent_account_name` in accounts table

If lookup fails, mark row as error and skip.

### Error Handling (All-or-Nothing)

**Critical**: The import process uses a strict validation-first approach:

1. **Pre-Import Validation**:

   - Validate ALL rows before making ANY database changes
   - Collect complete list of errors:
     - Missing required fields
     - Invalid foreign key references (e.g., owner_name not found)
     - Invalid data types (e.g., non-numeric where number expected)
     - Invalid enum values (e.g., invalid contact type)

2. **Error Response Format**:
   ```typescript
   {
     success: false,  // false if ANY errors exist
     canProceed: false,  // false means no DB changes made
     validationErrors: [
       {
         sheet: 'Properties',
         row: 3,  // Excel row number (1-indexed, including header)
         field: 'owner_name',
         value: 'John Doe',
         message: 'Owner "John Doe" not found in Contacts'
       },
       // ... more errors
     ],
     duplicates: [
       {
         sheet: 'Contacts',
         row: 5,
         name: 'Jane Smith',
         reason: 'Contact with this name already exists'
       }
     ],
     summary: {
       totalRows: 50,
       validRows: 45,
       errorRows: 3,
       duplicateRows: 2
     }
   }
   ```

3. **Success Response Format**:
   ```typescript
   {
     success: true,
     canProceed: true,
     imported: {
       contacts: { count: 10, skipped: 2 },
       projects: { count: 5, skipped: 0 },
       // ... for each entity
     },
     duplicates: [ /* list of skipped duplicates */ ],
     summary: {
       totalRows: 50,
       importedRows: 45,
       duplicateRows: 5
     }
   }
   ```

4. **Database Transaction**:

   - All inserts wrapped in a single database transaction
   - If ANY insert fails, rollback ALL changes
   - Ensures complete data integrity

### Security

- All operations scoped to `tenant_id` from authenticated request
- Validate file size limits
- Validate Excel structure before processing
- Sanitize all input data

## Testing Checklist

1. Template download generates correct Excel structure matching current DB schema
2. Export includes current data with proper formatting and sample entries
3. Import correctly identifies and skips duplicates (warnings, not errors)
4. Import correctly resolves foreign key lookups
5. Import auto-assigns tenant_id and user_id
6. **All-or-nothing validation**: Import fails completely if ANY validation errors exist
7. **No partial imports**: Database remains unchanged if validation fails
8. Error handling provides detailed row-level error information
9. Large files are handled efficiently
10. Wizard UI guides users through each step clearly
11. Error report download helps users correct issues in Excel
12. No changes to existing system functionality (only import/export affected)

## Migration Notes

- Old import/export functionality will be disabled but code kept for reference
- Users will need to use new templates going forward
- Existing data can be exported using new export endpoint
- **No database migrations required** - templates align with existing schema
- **No changes to other system components** - only import/export module affected

## Scope Limitations

**What This Plan Does NOT Include:**

- Changes to database schema
- Modifications to existing API routes (except new import/export endpoints)
- Changes to existing UI components (except import/export page)
- Modifications to business logic in other modules
- Changes to authentication/authorization system
- Updates to other settings pages

**What This Plan DOES Include:**

- New import/export API endpoints
- New import/export services
- New wizard-style UI component
- Template generation aligned with current DB schema
- All-or-nothing import validation