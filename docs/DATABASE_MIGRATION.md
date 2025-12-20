# Database Migration Documentation

## Overview

The Finance Tracker Pro application has been migrated from a localStorage-based data persistence system to a SQL-based database architecture using SQLite (via sql.js). This migration provides better data integrity, query capabilities, and scalability.

## Architecture

### Database Technology

- **SQL Engine**: SQLite (via sql.js - SQLite compiled to WebAssembly)
- **Storage**: Browser localStorage (database binary stored as JSON array)
- **Schema Version**: 1

### Database Structure

The database consists of the following main tables:

#### Core Entities
- `users` - Application users
- `accounts` - Financial accounts
- `contacts` - Contacts (vendors, tenants, staff, etc.)
- `categories` - Transaction categories
- `projects` - Projects
- `buildings` - Buildings
- `properties` - Properties
- `units` - Units

#### Financial Transactions
- `transactions` - All financial transactions
- `invoices` - Invoices
- `bills` - Bills
- `budgets` - Budgets

#### Agreements & Contracts
- `rental_agreements` - Rental agreements
- `project_agreements` - Project agreements
- `contracts` - Vendor contracts
- `project_agreement_units` - Junction table for project agreements and units
- `contract_categories` - Junction table for contracts and categories

#### Payroll
- `salary_components` - Salary component definitions
- `staff` - Legacy staff records
- `employees` - Enterprise payroll employees
- `payroll_cycles` - Payroll cycles
- `payslips` - Enterprise payslips
- `legacy_payslips` - Legacy payslips
- `bonus_records` - Bonus records
- `payroll_adjustments` - Payroll adjustments
- `loan_advance_records` - Loan and advance records
- `attendance_records` - Attendance records
- `tax_configurations` - Tax configurations
- `statutory_configurations` - Statutory configurations

#### Other
- `recurring_invoice_templates` - Recurring invoice templates
- `tasks` - Todo list tasks
- `transaction_log` - Transaction audit log
- `error_log` - Error log
- `app_settings` - Application settings
- `license_settings` - License settings
- `metadata` - Database metadata

### Key Features

1. **Referential Integrity**: Foreign key constraints ensure data consistency
2. **Indexes**: Optimized indexes on frequently queried columns
3. **Transactions**: Support for atomic operations
4. **Auto-save**: Automatic database persistence every 5 seconds
5. **Backup/Restore**: Native SQL backup and restore functionality

## Migration Process

### Automatic Migration

The migration from localStorage to SQL database happens automatically on first load after the update:

1. **Detection**: The app checks if migration is needed by looking for:
   - Existing SQL database in localStorage
   - Migration flag (`migrated_to_sql`)
   - Old localStorage data (`finance_app_state_v4`)

2. **Migration Steps**:
   - Initialize SQL database
   - Load old state from localStorage
   - Convert and save all data to SQL tables
   - Set migration flag
   - Create backup of old localStorage data

3. **Data Migrated**:
   - Main application state (all entities)
   - Tasks (from `tasks` localStorage key)
   - License settings (install date, license key, device ID)

### Manual Migration

If automatic migration fails, you can manually trigger it:

```typescript
import { runAllMigrations } from './services/database/migration';

const result = await runAllMigrations();
if (result.success) {
    console.log('Migration completed:', result.recordCounts);
} else {
    console.error('Migration failed:', result.error);
}
```

## Database Service API

### Initialization

```typescript
import { getDatabaseService } from './services/database/databaseService';

const dbService = getDatabaseService();
await dbService.initialize();
```

### Basic Operations

```typescript
// Query data
const results = dbService.query('SELECT * FROM accounts WHERE type = ?', ['Bank']);

// Execute statement
dbService.execute('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)', 
    ['acc-1', 'Main Account', 'Bank']);

// Transaction
dbService.transaction([
    () => dbService.execute('INSERT INTO ...'),
    () => dbService.execute('UPDATE ...'),
]);

// Save database
dbService.save();
```

### Backup and Restore

```typescript
// Create backup
const backup = dbService.createBackup(); // Returns Uint8Array

// Restore from backup
dbService.restoreBackup(backupData);
```

## Repository Pattern

The application uses a repository pattern for data access:

```typescript
import { AppStateRepository } from './services/database/repositories/appStateRepository';

const appStateRepo = new AppStateRepository();

// Load complete state
const state = await appStateRepo.loadState();

// Save complete state
await appStateRepo.saveState(state);
```

## Backup and Restore

### Creating Backups

Backups can be created in two formats:

1. **SQL Backup** (`.db` file) - Binary SQLite database file
   - Faster restore
   - Smaller file size
   - Recommended format

2. **JSON Backup** (`.json` file) - Human-readable JSON format
   - Backward compatible
   - Can be edited manually
   - Larger file size

Both formats are created when using the backup feature in the application.

### Restoring Backups

The restore process supports both formats:

1. **SQL Backup**: Directly imports the database
2. **JSON Backup**: Parses JSON and saves to database

## Import and Export

### Excel Export

The export service now reads directly from the database:

```typescript
import { exportToExcel } from './services/exportService';

await exportToExcel(state, 'export.xlsx', progress, dispatch);
```

### Excel Import

The import service saves directly to the database:

```typescript
import { runImportProcess } from './services/importService';

const result = await runImportProcess(sheets, state, dispatch, progress, onLog);
```

## Performance Considerations

### Database Size

- SQLite databases are stored in memory and serialized to localStorage
- Typical database size: 1-10 MB depending on data volume
- localStorage limit: ~5-10 MB (varies by browser)

### Optimization Tips

1. **Indexes**: Already created on frequently queried columns
2. **Batch Operations**: Use transactions for multiple operations
3. **Auto-save**: Configured to save every 5 seconds (adjustable)
4. **Cleanup**: Old localStorage data can be manually removed after migration

## Troubleshooting

### Migration Issues

**Problem**: Migration fails with "Database not initialized"

**Solution**: Ensure database service is initialized before migration:
```typescript
const dbService = getDatabaseService();
await dbService.initialize();
```

**Problem**: Data not appearing after migration

**Solution**: 
1. Check browser console for errors
2. Verify migration flag is set: `localStorage.getItem('migrated_to_sql')`
3. Check for backup: Look for `finance_app_state_v4_backup_*` keys

### Database Errors

**Problem**: "Database locked" error

**Solution**: Ensure only one database instance is active. The service uses a singleton pattern.

**Problem**: localStorage quota exceeded

**Solution**:
1. Clear old localStorage data
2. Export and remove old backups
3. Consider data archiving for old records

## Rollback Procedure

If you need to rollback to localStorage:

1. **Restore from Backup**: Use the JSON backup created during migration
2. **Manual Restore**: 
   ```javascript
   const backup = localStorage.getItem('finance_app_state_v4_backup_*');
   localStorage.setItem('finance_app_state_v4', backup);
   localStorage.removeItem('finance_db');
   localStorage.removeItem('migrated_to_sql');
   ```
3. **Reload Application**: The app will use localStorage again

## Future Enhancements

Potential improvements for future versions:

1. **IndexedDB Storage**: Move from localStorage to IndexedDB for larger capacity
2. **Data Compression**: Compress database before storing
3. **Incremental Backups**: Only backup changed data
4. **Cloud Sync**: Sync database to cloud storage
5. **Query Builder**: Type-safe query builder for complex queries
6. **Database Migrations**: Versioned schema migrations

## API Reference

### DatabaseService

- `initialize()`: Initialize database
- `query<T>(sql, params)`: Execute SELECT query
- `execute(sql, params)`: Execute INSERT/UPDATE/DELETE
- `transaction(operations)`: Execute operations in transaction
- `save()`: Save database to localStorage
- `export()`: Export database as Uint8Array
- `import(data)`: Import database from Uint8Array
- `createBackup()`: Create backup
- `restoreBackup(data)`: Restore from backup
- `clearAllData()`: Clear all data (keeps schema)

### AppStateRepository

- `loadState()`: Load complete application state
- `saveState(state)`: Save complete application state

## Support

For issues or questions:
1. Check browser console for errors
2. Review migration logs
3. Verify database initialization
4. Check localStorage for backup data

## Version History

- **v1.0** (Current): Initial SQL database migration
  - SQLite via sql.js
  - Complete schema migration
  - Backup/restore functionality
  - Import/export compatibility
