/**
 * Repository Index
 * 
 * Exports all repository classes for easy importing.
 */

import { BaseRepository } from './baseRepository';
export { BaseRepository } from './baseRepository';
export { AppStateRepository } from './appStateRepository';

// Entity repositories will be created below
// For now, we'll create them as needed

// Placeholder exports - these will be implemented
export class UsersRepository extends BaseRepository<any> {
    constructor() { super('users'); }
}

export class AccountsRepository extends BaseRepository<any> {
    constructor() { super('accounts'); }
}

export class ContactsRepository extends BaseRepository<any> {
    constructor() { super('contacts'); }
}

export class CategoriesRepository extends BaseRepository<any> {
    constructor() { super('categories'); }
}

export class ProjectsRepository extends BaseRepository<any> {
    constructor() { super('projects'); }
}

export class BuildingsRepository extends BaseRepository<any> {
    constructor() { super('buildings'); }
}

export class PropertiesRepository extends BaseRepository<any> {
    constructor() { super('properties'); }
}

export class UnitsRepository extends BaseRepository<any> {
    constructor() { super('units'); }
}

export class TransactionsRepository extends BaseRepository<any> {
    constructor() { super('transactions'); }
}

export class InvoicesRepository extends BaseRepository<any> {
    constructor() { super('invoices'); }
}

export class BillsRepository extends BaseRepository<any> {
    constructor() { super('bills'); }
}

export class BudgetsRepository extends BaseRepository<any> {
    constructor() { super('budgets'); }
}

export class RentalAgreementsRepository extends BaseRepository<any> {
    constructor() { super('rental_agreements'); }
}

export class ProjectAgreementsRepository extends BaseRepository<any> {
    constructor() { super('project_agreements'); }
}

export class ContractsRepository extends BaseRepository<any> {
    constructor() { super('contracts'); }
}

export class RecurringTemplatesRepository extends BaseRepository<any> {
    constructor() { super('recurring_invoice_templates'); }
}

export class SalaryComponentsRepository extends BaseRepository<any> {
    constructor() { super('salary_components'); }
}

export class StaffRepository extends BaseRepository<any> {
    constructor() { super('staff'); }
}

export class EmployeesRepository extends BaseRepository<any> {
    constructor() { super('employees'); }
}

export class PayrollCyclesRepository extends BaseRepository<any> {
    constructor() { super('payroll_cycles'); }
}

export class PayslipsRepository extends BaseRepository<any> {
    constructor() { super('payslips'); }
}

export class LegacyPayslipsRepository extends BaseRepository<any> {
    constructor() { super('legacy_payslips'); }
}

export class BonusRecordsRepository extends BaseRepository<any> {
    constructor() { super('bonus_records'); }
}

export class PayrollAdjustmentsRepository extends BaseRepository<any> {
    constructor() { super('payroll_adjustments'); }
}

export class LoanAdvanceRecordsRepository extends BaseRepository<any> {
    constructor() { super('loan_advance_records'); }
}

export class AttendanceRecordsRepository extends BaseRepository<any> {
    constructor() { super('attendance_records'); }
}

export class TaxConfigurationsRepository extends BaseRepository<any> {
    constructor() { super('tax_configurations'); }
}

export class StatutoryConfigurationsRepository extends BaseRepository<any> {
    constructor() { super('statutory_configurations'); }
}

export class TransactionLogRepository extends BaseRepository<any> {
    constructor() { super('transaction_log'); }
}

export class ErrorLogRepository extends BaseRepository<any> {
    constructor() { super('error_log'); }
}

export class TasksRepository extends BaseRepository<any> {
    constructor() { super('tasks'); }
}

export class QuotationsRepository extends BaseRepository<any> {
    constructor() { super('quotations'); }
}

export class DocumentsRepository extends BaseRepository<any> {
    constructor() { super('documents'); }
}

export class AppSettingsRepository {
    private db = getDatabaseService();
    
    getSetting(key: string): any {
        const result = this.db.query<{ value: string }>(
            'SELECT value FROM app_settings WHERE key = ?',
            [key]
        );
        if (result.length === 0) return null;
        try {
            return JSON.parse(result[0].value);
        } catch {
            return result[0].value;
        }
    }

    setSetting(key: string, value: any): void {
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
        this.db.execute(
            'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
            [key, jsonValue]
        );
        // Don't call save() here if we're in a transaction - it will be saved after transaction commits
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    loadAllSettings(): any {
        const results = this.db.query<{ key: string; value: string }>(
            'SELECT key, value FROM app_settings'
        );
        const settings: any = {};
        results.forEach(row => {
            try {
                settings[row.key] = JSON.parse(row.value);
            } catch {
                settings[row.key] = row.value;
            }
        });
        return settings;
    }

    saveAllSettings(settings: any): void {
        Object.entries(settings).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                this.setSetting(key, value);
            }
        });
    }
}

// Helper function to get database service
import { getDatabaseService } from '../databaseService';
