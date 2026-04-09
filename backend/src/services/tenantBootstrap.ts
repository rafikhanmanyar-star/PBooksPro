import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';

/** Logical ids (canonical PKs shared by all tenants via tenant_id = GLOBAL_SYSTEM_TENANT_ID). */
export const SYSTEM_ACCOUNT_DEFS: { logicalId: string; name: string; type: string }[] = [
  { logicalId: 'sys-acc-cash', name: 'Cash', type: 'BANK' },
  { logicalId: 'sys-acc-ar', name: 'Accounts Receivable', type: 'ASSET' },
  { logicalId: 'sys-acc-ap', name: 'Accounts Payable', type: 'LIABILITY' },
  { logicalId: 'sys-acc-equity', name: 'Owner Equity', type: 'EQUITY' },
  { logicalId: 'sys-acc-clearing', name: 'Internal Clearing', type: 'BANK' },
  { logicalId: 'sys-acc-sec-liability', name: 'Security Liability', type: 'LIABILITY' },
  { logicalId: 'sys-acc-received-assets', name: 'Project Received Assets', type: 'ASSET' },
];

/** Matches context/AppContext SYSTEM_CATEGORIES / seed. */
export const SYSTEM_CATEGORY_DEFS: { logicalId: string; name: string; type: string; is_rental: boolean }[] = [
  { logicalId: 'sys-cat-rent-inc', name: 'Rental Income', type: 'Income', is_rental: true },
  { logicalId: 'sys-cat-svc-inc', name: 'Service Charge Income', type: 'Income', is_rental: true },
  { logicalId: 'sys-cat-sec-dep', name: 'Security Deposit', type: 'Income', is_rental: true },
  { logicalId: 'sys-cat-proj-list', name: 'Project Listed Income', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-unit-sell', name: 'Unit Selling Income', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-penalty-inc', name: 'Penalty Income', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-own-eq', name: 'Owner Equity', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-own-svc-pay', name: 'Owner Service Charge Payment', type: 'Income', is_rental: true },
  { logicalId: 'sys-cat-sal-adv', name: 'Salary Advance', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-proj-sal', name: 'Project Staff Salary', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-rent-sal', name: 'Rental Staff Salary', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-bld-maint', name: 'Building Maintenance', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-bld-util', name: 'Building Utilities', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-own-pay', name: 'Owner Payout', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-own-sec-pay', name: 'Owner Security Payout', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-sec-ref', name: 'Security Deposit Refund', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-prop-rep-own', name: 'Property Repair (Owner)', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-prop-rep-ten', name: 'Property Repair (Tenant)', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-brok-fee', name: 'Broker Fee', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-rebate', name: 'Rebate Amount', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-pm-cost', name: 'Project Management Cost', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-own-with', name: 'Owner Withdrawn', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-profit-share', name: 'Profit Share', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-disc-cust', name: 'Customer Discount', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-disc-flr', name: 'Floor Discount', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-disc-lump', name: 'Lump Sum Discount', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-disc-misc', name: 'Misc Discount', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-svc-deduct', name: 'Service Charge Deduction', type: 'Expense', is_rental: true },
  { logicalId: 'sys-cat-sal-exp', name: 'Salary Expenses', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-rev-asset-in-kind', name: 'Revenue - Asset received in kind', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-asset-bs-only', name: 'Asset received (balance sheet only)', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-sales-fixed-asset', name: 'Sales of fixed asset', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-asset-sale-proceeds', name: 'Asset Sale Proceeds', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-cost-asset-sold', name: 'Cost of Asset Sold', type: 'Expense', is_rental: false },
  { logicalId: 'sys-cat-sales-return-refund', name: 'Sales Return Refund (revenue reduction)', type: 'Income', is_rental: false },
  { logicalId: 'sys-cat-sales-return-penalty', name: 'Sales Return Penalty', type: 'Income', is_rental: false },
];

/**
 * Legacy helper for migrations / import scripts that still remap old `tenantId__logicalId` PKs.
 * New installs use canonical `logicalId` only with `tenant_id = GLOBAL_SYSTEM_TENANT_ID`.
 */
export function storageIdForTenant(tenantId: string, logicalId: string, legacyIds: boolean): string {
  if (legacyIds) return logicalId;
  return `${tenantId}__${logicalId}`;
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<unknown> };

/**
 * Idempotent inserts for shared system accounts and categories (one row per logical id for all tenants).
 * `tenantId` / `legacyIds` are kept for API compatibility; chart rows always use GLOBAL_SYSTEM_TENANT_ID.
 */
export async function bootstrapTenantChart(
  client: Queryable,
  _tenantId: string,
  _options: { legacyIds: boolean }
): Promise<void> {
  for (const a of SYSTEM_ACCOUNT_DEFS) {
    await client.query(
      `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, version)
       VALUES ($1, $2, $3, $4, 0, TRUE, 1)
       ON CONFLICT (id) DO NOTHING`,
      [a.logicalId, GLOBAL_SYSTEM_TENANT_ID, a.name, a.type]
    );
  }

  for (const c of SYSTEM_CATEGORY_DEFS) {
    await client.query(
      `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
       VALUES ($1, $2, $3, $4, TRUE, $5, FALSE, 1)
       ON CONFLICT (id) DO NOTHING`,
      [c.logicalId, GLOBAL_SYSTEM_TENANT_ID, c.name, c.type, c.is_rental]
    );
  }
}
