/**
 * Chart of accounts and GL journal types (API / manual journal).
 */

export interface ChartAccount {
  id: string;
  tenant_id?: string;
  name: string;
  type: string;
  balance?: number;
  description?: string | null;
  is_permanent?: boolean;
  parent_account_id?: string | null;
  version?: number;
}

export interface JournalLinePayload {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
}

export interface JournalEntry {
  tenantId?: string;
  entryDate: string;
  reference?: string;
  description?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  createdBy?: string | null;
  lines: JournalLinePayload[];
}

export interface LedgerTransaction {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  description?: string;
}
