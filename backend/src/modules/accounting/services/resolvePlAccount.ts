/**
 * P0-C — central P&L account resolver.
 * Resolves the GL revenue/expense/COGS account a posting leg should hit, from its category
 * (reporting dimension) or invoice type. NEVER returns Income/Expense Summary.
 *
 * Resolution order:
 *   1. category_account_mapping (tenant override, then __system__)
 *   2. invoice-type default (invoices have no category)
 *   3. side default → Uncategorized Revenue / Uncategorized Expense
 */
import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import {
  UNCATEGORIZED_REVENUE_ACCOUNT_ID,
  UNCATEGORIZED_EXPENSE_ACCOUNT_ID,
} from '../../../constants/systemChartDefs.js';

export type PlSide = 'income' | 'expense';

export interface ResolvePlAccountInput {
  tenantId: string;
  categoryId?: string | null;
  invoiceType?: string | null;
  sourceModule?: string | null;
  side: PlSide;
}

/** invoice_type → default revenue account (security deposits are routed to the liability before calling). */
const INVOICE_TYPE_REVENUE: Record<string, string> = {
  Rental: 'sys-acc-rev-rental',
  'Service Charge': 'sys-acc-rev-service',
  Installment: 'sys-acc-rev-contract',
};

export async function resolvePlAccount(
  client: pg.PoolClient,
  input: ResolvePlAccountInput
): Promise<string> {
  // 1) Explicit category → account mapping (prefer tenant-specific over system).
  if (input.categoryId) {
    const r = await client.query<{ gl_account_id: string }>(
      `SELECT gl_account_id FROM category_account_mapping
       WHERE category_id = $1 AND tenant_id IN ($2, $3)
       ORDER BY (tenant_id = $2) DESC
       LIMIT 1`,
      [input.categoryId, input.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    if (r.rows[0]?.gl_account_id) return r.rows[0].gl_account_id;
  }

  // 2) Invoice-type default (invoice postings carry no category).
  if (input.invoiceType) {
    const acct = INVOICE_TYPE_REVENUE[String(input.invoiceType).trim()];
    if (acct) return acct;
  }

  // 3) Safe fallback — never a summary account.
  return input.side === 'income'
    ? UNCATEGORIZED_REVENUE_ACCOUNT_ID
    : UNCATEGORIZED_EXPENSE_ACCOUNT_ID;
}
