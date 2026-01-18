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

  // Expense
  { id: 'sys-cat-sal-adv', name: 'Salary Advance', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-proj-sal', name: 'Project Staff Salary', type: 'Expense', isPermanent: true },
  { id: 'sys-cat-rent-sal', name: 'Rental Staff Salary', type: 'Expense', isPermanent: true },
  
  // Payroll System Categories (Enterprise Payroll)
  { id: 'sys-cat-emp-sal', name: 'Employee Salary', type: 'Expense', isPermanent: true, description: 'System category for enterprise employee salaries' },
  { id: 'sys-cat-payroll-tax', name: 'Payroll Tax Expense', type: 'Expense', isPermanent: true, description: 'System category for payroll tax expenses' },
  { id: 'sys-cat-emp-benefits', name: 'Employee Benefits', type: 'Expense', isPermanent: true, description: 'System category for employee benefits expenses' },
  { id: 'sys-cat-emp-allow', name: 'Employee Allowances', type: 'Expense', isPermanent: true, description: 'System category for employee allowances (transport, meal, etc.)' },
  { id: 'sys-cat-emp-deduct', name: 'Employee Deductions', type: 'Expense', isPermanent: true, description: 'System category for employee deductions' },
  { id: 'sys-cat-pf-expense', name: 'Provident Fund (PF)', type: 'Expense', isPermanent: true, description: 'System category for Provident Fund contributions' },
  { id: 'sys-cat-esi-expense', name: 'Employee State Insurance (ESI)', type: 'Expense', isPermanent: true, description: 'System category for ESI contributions' },
  { id: 'sys-cat-emp-insurance', name: 'Employee Insurance', type: 'Expense', isPermanent: true, description: 'System category for employee insurance expenses' },
  { id: 'sys-cat-bonus-inc', name: 'Bonuses & Incentives', type: 'Expense', isPermanent: true, description: 'System category for employee bonuses and incentives' },
  { id: 'sys-cat-overtime', name: 'Overtime Pay', type: 'Expense', isPermanent: true, description: 'System category for overtime pay expenses' },
  { id: 'sys-cat-commission', name: 'Commission Expense', type: 'Expense', isPermanent: true, description: 'System category for employee commission expenses' },
  { id: 'sys-cat-gratuity', name: 'Gratuity Expense', type: 'Expense', isPermanent: true, description: 'System category for gratuity payments' },
  { id: 'sys-cat-leave-encash', name: 'Leave Encashment', type: 'Expense', isPermanent: true, description: 'System category for leave encashment expenses' },
  { id: 'sys-cat-termination-settle', name: 'Employee Termination Settlement', type: 'Expense', isPermanent: true, description: 'System category for employee termination settlements' },
  { id: 'sys-cat-payroll-processing', name: 'Payroll Processing Fee', type: 'Expense', isPermanent: true, description: 'System category for payroll processing fees' },
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
];

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
      // Initialize system accounts
      for (const account of SYSTEM_ACCOUNTS) {
        const existing = await this.db.query(
          'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
          [account.id, tenantId]
        );

        if (existing.length === 0) {
          await this.db.query(
            `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [account.id, tenantId, account.name, account.type, account.balance, account.isPermanent, account.description]
          );
          accountsCreated++;
          console.log(`✅ Created system account: ${account.name} (${account.id}) for tenant ${tenantId}`);
        }
      }

      // Initialize system categories
      for (const category of SYSTEM_CATEGORIES) {
        const existing = await this.db.query(
          'SELECT id FROM categories WHERE id = $1 AND tenant_id = $2',
          [category.id, tenantId]
        );

        if (existing.length === 0) {
          await this.db.query(
            `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [category.id, tenantId, category.name, category.type, category.isPermanent, category.isRental || false]
          );
          categoriesCreated++;
          console.log(`✅ Created system category: ${category.name} (${category.id}) for tenant ${tenantId}`);
        }
      }

      if (accountsCreated > 0 || categoriesCreated > 0) {
        console.log(`✅ Initialized system data for tenant ${tenantId}: ${accountsCreated} accounts, ${categoriesCreated} categories`);
      }

      return { accountsCreated, categoriesCreated };
    } catch (error: any) {
      console.error(`❌ Error initializing system data for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Ensure system accounts exist (used when fetching accounts)
   */
  async ensureSystemAccounts(tenantId: string): Promise<void> {
    for (const account of SYSTEM_ACCOUNTS) {
      const existing = await this.db.query(
        'SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2',
        [account.id, tenantId]
      );

      if (existing.length === 0) {
        await this.db.query(
          `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [account.id, tenantId, account.name, account.type, account.balance, account.isPermanent, account.description]
        );
        console.log(`✅ Auto-created missing system account: ${account.name} (${account.id}) for tenant ${tenantId}`);
      }
    }
  }

  /**
   * Ensure system categories exist (used when fetching categories)
   */
  async ensureSystemCategories(tenantId: string): Promise<void> {
    for (const category of SYSTEM_CATEGORIES) {
      const existing = await this.db.query(
        'SELECT id FROM categories WHERE id = $1 AND tenant_id = $2',
        [category.id, tenantId]
      );

      if (existing.length === 0) {
        await this.db.query(
          `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            category.id, 
            tenantId, 
            category.name, 
            category.type, 
            category.isPermanent, 
            category.isRental || false,
            (category as any).description || null
          ]
        );
        console.log(`✅ Auto-created missing system category: ${category.name} (${category.id}) for tenant ${tenantId}`);
      }
    }
  }
}

