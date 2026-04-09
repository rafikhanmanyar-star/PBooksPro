/**
 * Double-entry financial transaction types (journal_entries / journal_lines).
 * Legacy `transactions` rows remain for existing modules; new GL writes should use this engine.
 */

export type JournalLineInput = {
  accountId: string;
  /** One side only: debit > 0 XOR credit > 0 */
  debitAmount: number;
  creditAmount: number;
  /** Optional project scope (journal_lines.project_id). */
  projectId?: string | null;
};

export type InvestorTransactionType = 'investment' | 'profit_allocation' | 'withdrawal' | 'transfer';

export type CreateJournalEntryInput = {
  tenantId: string;
  entryDate: string;
  reference?: string;
  description?: string;
  sourceModule?: string;
  sourceId?: string;
  createdBy?: string | null;
  /** journal_entries.project_id */
  projectId?: string | null;
  /** journal_entries.investor_id (party or equity GL id) */
  investorId?: string | null;
  investorTransactionType?: InvestorTransactionType | null;
  lines: JournalLineInput[];
};

export type JournalEntryRow = {
  id: string;
  tenant_id: string;
  entry_date: string;
  reference: string;
  description: string | null;
  source_module: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type JournalLineRow = {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  line_number: number;
};

export type AccountingAuditRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id: string | null;
  timestamp: string;
  old_value: string | null;
  new_value: string | null;
};
