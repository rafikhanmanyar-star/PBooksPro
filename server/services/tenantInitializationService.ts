import { DatabaseService } from './databaseService.js';

/**
 * System accounts that should exist for every tenant
 */
const SYSTEM_ACCOUNTS = [
  { id: 'sys-acc-cash', name: 'Cash', type: 'Bank', balance: 0, isPermanent: true, description: 'Default cash account' },
  { id: 'sys-acc-ar', name: 'Accounts Receivable', type: 'Asset', balance: 0, isPermanent: true, description: 'System account for unpaid invoices' },
  { id: 'sys-acc-ap', name: 'Accounts Payable', type: 'Liability', balance: 0, isPermanent: true, description: 'System account for unpaid bills and salaries' },
  { id: 'sys-acc-equity', name: 'Owner Equity', type: 'Equity', balance: 0, isPermanent: true, description: 'System account for owner capital and equity' },
  { id: 'sys-acc-clearing', name: 'Internal Clearing', type: 'Bank', balance: 0, isPermanent: true, description: 'System account for internal transfers and equity clearing' }
];

/**
 * System categories that should exist for every tenant
 */
const SYSTEM_CATEGORIES = [
  // Income
  { id: 'sys-cat-rent-inc', name: 'Rental Income', type: 'Income', isPermanent: true, isRental: true },
  { id: 'sys-cat-svc-inc', name: 'Service Charge Income', type: 'Income', isPermanent: true, isRental: true },
  { id: 'sys-cat-sec-dep', name: 'Security Deposit', type: 'Income', isPermanent: true, isRental: true },
  { id: 'sys-cat-proj-list', name: 'Project Listed Income', type: 'Income', isPermanent: true },
  { id: 'sys-cat-unit-sell', name: 'Unit Selling Income', type: 'Income', isPermanent: true },
  { id: 'sys-cat-penalty-inc', name: 'Penalty Income', type: 'Income', isPermanent: true },
  { id: 'sys-cat-own-eq', name: 'Owner Equity', type: 'Income', isPermanent: true },
  { id: 'sys-cat-own-svc-pay', name: 'Owner Service Charge Payment', type: 'Income', isPermanent: true, isRental: true },

  // Expense
  { id: 'sys-cat-sal-adv', name: 'Salary Advance', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-proj-sal', name: 'Project Staff Salary', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-rent-sal', name: 'Rental Staff Salary', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-bld-maint', name: 'Building Maintenance', type: 'Expense', isPermanent: true, isRental: true },
  { id: 'sys-cat-bld-util', name: 'Building Utilities', type: 'Expense', isPermanent: true, isRental: true },
  { id: 'sys-cat-own-pay', name: 'Owner Payout', type: 'Expense', isPermanent: true, isRental: true },
  { id: 'sys-cat-own-sec-pay', name: 'Owner Security Payout', type: 'Expense', isPermanent: true, isRental: true },
  { id: 'sys-cat-sec-ref', name: 'Security Deposit Refund', type: 'Expense', isPermanent: true, isRental: true },
  { id: 'sys-cat-prop-rep-own', name: 'Property Repair (Owner)', type: 'Expense', isPermanent: true, isRental: true },
  { id: 'sys-cat-prop-rep-ten', name: 'Property Repair (Tenant)', type: 'Expense', isPermanent: true, isRental: true },
  { id: 'sys-cat-brok-fee', name: 'Broker Fee', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-rebate', name: 'Rebate Amount', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-pm-cost', name: 'Project Management Cost', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-own-with', name: 'Owner Withdrawn', type: 'Expense', isPermanent: true },

  // Discounts (Virtual Expenses)
  { id: 'sys-cat-disc-cust', name: 'Customer Discount', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-disc-flr', name: 'Floor Discount', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-disc-lump', name: 'Lump Sum Discount', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-disc-misc', name: 'Misc Discount', type: 'Expense', isPermanent: true },

  // Legacy
  { id: 'sys-cat-svc-deduct', name: 'Service Charge Deduction', type: 'Expense', isPermanent: true, isRental: true },

  // Payroll
  { id: 'sys-cat-sal-exp', name: 'Salary Expenses', type: 'Expense', isPermanent: true },
];

// PERFORMANCE: In-memory cache to avoid re-checking system accounts/categories on every GET.
// Previously, GET /accounts ran 5 SELECTs + up to 5 INSERTs, and GET /categories ran 27+
// SELECTs + up to 27 INSERTs, on EVERY single request. Now we check once per server process.
let systemAccountsInitialized = false;
let systemCategoriesInitialized = false;

export class TenantInitializationService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * Initialize system accounts and categories for a tenant
   * This is idempotent - safe to call multiple times
   */
  async initializeSystemData(tenantId: string): Promise<{ accountsCreated: number; categoriesCreated: number }> {
    let accountsCreated = 0;
    let categoriesCreated = 0;

    try {
      // Initialize system accounts globally (tenant_id = NULL)
      for (const account of SYSTEM_ACCOUNTS) {
        const existing = await this.db.query(
          'SELECT id FROM accounts WHERE id = $1 AND tenant_id IS NULL',
          [account.id]
        );

        if (existing.length === 0) {
          await this.db.query(
            `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
             VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [account.id, account.name, account.type, account.balance, account.isPermanent, account.description]
          );
          accountsCreated++;
          console.log(`✅ Created global system account: ${account.name} (${account.id})`);
        }
      }

      // Initialize system categories globally (tenant_id = NULL)
      for (const category of SYSTEM_CATEGORIES) {
        const existing = await this.db.query(
          'SELECT id FROM categories WHERE id = $1 AND tenant_id IS NULL',
          [category.id]
        );

        if (existing.length === 0) {
          await this.db.query(
            `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, created_at, updated_at)
             VALUES ($1, NULL, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [category.id, category.name, category.type, category.isPermanent, category.isRental || false]
          );
          categoriesCreated++;
          console.log(`✅ Created global system category: ${category.name} (${category.id})`);
        }
      }

      return { accountsCreated, categoriesCreated };
    } catch (error: any) {
      console.error(`❌ Error initializing system data:`, error);
      throw error;
    }
  }

  /**
   * Ensure system accounts exist (used when fetching accounts).
   * PERFORMANCE: Uses in-memory flag to skip after first successful check per server process.
   * Uses a single batch INSERT instead of N sequential SELECT+INSERT pairs.
   */
  async ensureSystemAccounts(tenantId: string): Promise<void> {
    if (systemAccountsInitialized) return;

    try {
      // Single batch upsert instead of N sequential queries
      const values = SYSTEM_ACCOUNTS.map((a, i) => {
        const base = i * 6;
        return `($${base+1}, NULL, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, NOW(), NOW())`;
      }).join(', ');

      const params = SYSTEM_ACCOUNTS.flatMap(a => [
        a.id, a.name, a.type, a.balance, a.isPermanent, a.description
      ]);

      await this.db.query(
        `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
         VALUES ${values}
         ON CONFLICT (id) DO NOTHING`,
        params
      );

      systemAccountsInitialized = true;
    } catch (error) {
      console.error('Failed to ensure system accounts:', error);
      // Don't set the flag so it retries next time
    }
  }

  /**
   * Ensure system categories exist (used when fetching categories).
   * PERFORMANCE: Uses in-memory flag to skip after first successful check per server process.
   * Uses a single batch INSERT instead of N sequential SELECT+INSERT pairs.
   */
  async ensureSystemCategories(tenantId: string): Promise<void> {
    if (systemCategoriesInitialized) return;

    try {
      // Single batch upsert instead of N sequential queries
      const values = SYSTEM_CATEGORIES.map((c, i) => {
        const base = i * 6;
        return `($${base+1}, NULL, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, NOW(), NOW())`;
      }).join(', ');

      const params = SYSTEM_CATEGORIES.flatMap(c => [
        c.id, c.name, c.type, c.isPermanent, c.isRental || false, (c as any).description || null
      ]);

      await this.db.query(
        `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, description, created_at, updated_at)
         VALUES ${values}
         ON CONFLICT (id) DO NOTHING`,
        params
      );

      systemCategoriesInitialized = true;
    } catch (error) {
      console.error('Failed to ensure system categories:', error);
      // Don't set the flag so it retries next time
    }
  }
}

