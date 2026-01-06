# Data Synchronization: User vs Organization Data

## Overview

The application distinguishes between **user-specific data** and **organization data** for synchronization purposes. Only **organization data** is synchronized across users in the same tenant via Socket.IO real-time sync.

## User-Specific Data (NOT Synced)

User-specific data includes UI preferences and user-specific settings that should remain local to each user:

### UI Preferences
- `enableColorCoding` - Project/building color coding preference
- `enableBeepOnSave` - Sound notification preference
- `enableDatePreservation` - Remember last entered date
- `lastPreservedDate` - Last date entered
- `showSystemTransactions` - Display system transactions preference

### User Settings
- `defaultProjectId` - User's default project selection
- `documentStoragePath` - User's local file path preference
- `dashboardConfig` - User's visible KPIs configuration

### UI State (Never Synced)
- `currentPage` - Current page in UI
- `editingEntity` - Currently editing entity
- `initialTransactionType` - Form state
- `initialTransactionFilter` - Filter state
- `initialTabs` - Tab state
- `initialImportType` - Import state

### User Data
- `currentUser` - Current logged-in user

## Organization Data (Synced)

Organization data includes all accounting and business data shared across the organization:

### Core Entities
- Accounts (Chart of Accounts)
- Contacts (Vendors, Tenants, Staff, etc.)
- Categories (Transaction Categories)
- Users (User list, but not currentUser)

### Projects & Properties
- Projects
- Buildings
- Properties
- Units

### Financial Data
- Transactions
- Invoices
- Bills
- Quotations
- Documents
- Budgets

### Agreements & Contracts
- Rental Agreements
- Project Agreements
- Sales Returns
- Contracts

### Payroll
- Employees
- Salary Components
- Payroll Cycles
- Payslips
- Bonus Records
- Payroll Adjustments
- Loan/Advance Records
- Attendance Records
- Tax Configurations
- Statutory Configurations

### Organization Settings (Synced)
- `agreementSettings` - Agreement numbering settings
- `projectAgreementSettings` - Project agreement numbering
- `rentalInvoiceSettings` - Rental invoice numbering
- `projectInvoiceSettings` - Project invoice numbering
- `printSettings` - Company print settings (name, address, logo)
- `whatsAppTemplates` - Organization-wide WhatsApp templates
- `invoiceHtmlTemplate` - Invoice HTML template
- `pmCostPercentage` - PM cost percentage setting

### Logs
- `transactionLog` - Transaction audit log
- `errorLog` - Error log

## Implementation

### Data Filter Utility

The `services/sync/dataFilter.ts` utility provides functions to:
- `shouldSyncAction(action)` - Check if an action should trigger sync
- `getOrganizationData(state)` - Extract only organization data from state
- `isUserSpecificField(field)` - Check if a field is user-specific
- `isUserSpecificAction(actionType)` - Check if an action is user-specific

### Sync Logic

In `context/AppContext.tsx`, the sync logic:
1. Checks if action should be synced using `shouldSyncAction()`
2. Only syncs organization data actions
3. User preference actions are automatically excluded

### Socket.IO Events

Socket.IO events are only emitted for organization data changes:
- `transaction:created`, `transaction:updated`, `transaction:deleted`
- `invoice:created`, `invoice:updated`, `invoice:deleted`
- `bill:created`, `bill:updated`, `bill:deleted`
- `contact:created`, `contact:updated`, `contact:deleted`
- `project:created`, `project:updated`, `project:deleted`
- `account:created`, `account:updated`, `account:deleted`
- `category:created`, `category:updated`, `category:deleted`
- `budget:created`, `budget:updated`, `budget:deleted`
- `rental_agreement:created`, `rental_agreement:updated`, `rental_agreement:deleted`
- `project_agreement:created`, `project_agreement:updated`, `project_agreement:deleted`
- `contract:created`, `contract:updated`, `contract:deleted`

## User Preferences Storage

**Important**: User preferences should be stored per-user in the database. Currently, they are stored in the `app_settings` table which is global. For proper multi-user support, these should be moved to a `user_preferences` table with `user_id` and `tenant_id` columns.

### Recommended Database Schema

```sql
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- UI Preferences
    enable_color_coding BOOLEAN DEFAULT true,
    enable_beep_on_save BOOLEAN DEFAULT false,
    enable_date_preservation BOOLEAN DEFAULT false,
    show_system_transactions BOOLEAN DEFAULT false,
    
    -- User Settings
    default_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    document_storage_path TEXT,
    dashboard_config JSONB DEFAULT '{"visibleKpis": []}'::jsonb,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_preferences_user_tenant ON user_preferences(user_id, tenant_id);
```

## Testing

When testing synchronization:
1. ✅ Verify organization data (transactions, invoices, etc.) syncs across users
2. ✅ Verify user preferences (beep on save, default project) do NOT sync
3. ✅ Verify each user maintains their own UI preferences
4. ✅ Verify organization settings (print settings, templates) sync correctly

## Migration Notes

If migrating from a single-user system:
1. User preferences stored in `app_settings` should be migrated to `user_preferences` table
2. Each user should get their own preferences record
3. Default values should be used for new users

