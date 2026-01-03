// IPC type definitions for native SQLite (better-sqlite3) backend

export interface NativeListTransactionsParams {
  projectId?: string | null;
  limit?: number;
  offset?: number;
}

export interface NativeTransaction {
  id: string;
  type: string;
  subtype?: string | null;
  amount: number;
  date: string;
  description?: string | null;
  account_id: string;
  from_account_id?: string | null;
  to_account_id?: string | null;
  category_id?: string | null;
  contact_id?: string | null;
  project_id?: string | null;
  building_id?: string | null;
  property_id?: string | null;
  unit_id?: string | null;
  invoice_id?: string | null;
  bill_id?: string | null;
  payslip_id?: string | null;
  contract_id?: string | null;
  agreement_id?: string | null;
  batch_id?: string | null;
  is_system?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface NativeTotalsResult {
  totalIncome: number | null;
  totalExpense: number | null;
}

export interface NativeDbApi {
  listNativeTransactions(args?: NativeListTransactionsParams): Promise<NativeTransaction[]>;
  countNativeTransactions(args?: { projectId?: string | null }): Promise<{ count: number }>;
  getNativeTotals(args?: { projectId?: string | null }): Promise<NativeTotalsResult>;
  upsertNativeTransaction(tx: NativeTransaction): Promise<void>;
  bulkUpsertNativeTransactions(transactions: NativeTransaction[]): Promise<void>;
}

