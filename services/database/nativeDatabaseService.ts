/**
 * Native Database Service
 * 
 * Wraps IPC calls to the better-sqlite3 backend for high-performance queries.
 * This service provides paginated access to transactions and other data.
 */

import { NativeDbApi, NativeListTransactionsParams, NativeTransaction, NativeTotalsResult } from '../../types/ipc';
import { Transaction } from '../../types';

// Check if we're in Electron and native APIs are available
function isNativeAvailable(): boolean {
  if (typeof window === 'undefined') {
    console.log('🔍 Native DB Check: Not in browser environment');
    return false;
  }

  const electronAPI = (window as any).electronAPI;
  if (!electronAPI) {
    console.log('🔍 Native DB Check: electronAPI not found on window');
    return false;
  }

  if (typeof electronAPI.listNativeTransactions !== 'function') {
    console.log('🔍 Native DB Check: listNativeTransactions function not found');
    console.log('🔍 Available methods:', Object.keys(electronAPI));
    return false;
  }

  console.log('✅ Native DB Check: All checks passed');
  return true;
}

// Get the native API from window
function getNativeApi(): NativeDbApi | null {
  if (!isNativeAvailable()) return null;
  const api = (window as any).electronAPI;
  return {
    listNativeTransactions: (args?: NativeListTransactionsParams) =>
      api.listNativeTransactions(args),
    countNativeTransactions: (args?: { projectId?: string | null }) =>
      api.countNativeTransactions(args),
    getNativeTotals: (args?: { projectId?: string | null }) =>
      api.getNativeTotals(args),
    upsertNativeTransaction: (tx: NativeTransaction) =>
      api.upsertNativeTransaction(tx),
    bulkUpsertNativeTransactions: (transactions: NativeTransaction[]) =>
      api.bulkUpsertNativeTransactions(transactions),
  };
}

/**
 * Convert native transaction format to app Transaction format
 */
function nativeToTransaction(native: NativeTransaction): Transaction {
  return {
    id: native.id,
    type: native.type as any,
    subtype: native.subtype as any,
    amount: native.amount,
    date: native.date,
    description: native.description || '',
    accountId: native.account_id,
    fromAccountId: native.from_account_id || undefined,
    toAccountId: native.to_account_id || undefined,
    categoryId: native.category_id || undefined,
    contactId: native.contact_id || undefined,
    projectId: native.project_id || undefined,
    buildingId: native.building_id || undefined,
    propertyId: native.property_id || undefined,
    unitId: native.unit_id || undefined,
    invoiceId: native.invoice_id || undefined,
    billId: native.bill_id || undefined,
    payslipId: native.payslip_id || undefined,
    contractId: native.contract_id || undefined,
    agreementId: native.agreement_id || undefined,
    batchId: native.batch_id || undefined,
    isSystem: native.is_system === 1,
  };
}

/**
 * Convert app Transaction format to native format
 */
function transactionToNative(tx: Transaction): NativeTransaction {
  return {
    id: tx.id,
    type: tx.type,
    subtype: tx.subtype || null,
    amount: tx.amount,
    date: tx.date,
    description: tx.description || null,
    account_id: tx.accountId || '',
    from_account_id: tx.fromAccountId || null,
    to_account_id: tx.toAccountId || null,
    category_id: tx.categoryId || null,
    contact_id: tx.contactId || null,
    project_id: tx.projectId || null,
    building_id: tx.buildingId || null,
    property_id: tx.propertyId || null,
    unit_id: tx.unitId || null,
    invoice_id: tx.invoiceId || null,
    bill_id: tx.billId || null,
    payslip_id: tx.payslipId || null,
    contract_id: tx.contractId || null,
    agreement_id: tx.agreementId || null,
    batch_id: tx.batchId || null,
    is_system: tx.isSystem ? 1 : 0,
  };
}

export class NativeDatabaseService {
  private api: NativeDbApi | null = null;
  private isAvailable: boolean = false;

  constructor() {
    this.api = getNativeApi();
    this.isAvailable = this.api !== null;

    if (this.isAvailable) {
      console.log('✅ Native database service available and ready');
    } else {
      console.warn('⚠️ Native database service not available (falling back to sql.js)');
      console.warn('   This is normal if running in browser or if native backend failed to initialize');
    }
  }

  /**
   * Check if native backend is available
   */
  isNativeAvailable(): boolean {
    return this.isAvailable && this.api !== null;
  }

  /**
   * List transactions with pagination
   */
  async listTransactions(params: NativeListTransactionsParams = {}): Promise<Transaction[]> {
    if (!this.api) {
      throw new Error('Native database API not available');
    }

    const nativeTxs = await this.api.listNativeTransactions(params);
    return nativeTxs.map(nativeToTransaction);
  }

  /**
   * Get transaction totals (income/expense)
   */
  async getTotals(params: { projectId?: string | null } = {}): Promise<NativeTotalsResult> {
    if (!this.api) {
      throw new Error('Native database API not available');
    }

    return await this.api.getNativeTotals(params);
  }

  /**
   * Upsert a transaction
   */
  async upsertTransaction(tx: Transaction): Promise<void> {
    if (!this.api) {
      throw new Error('Native database API not available');
    }

    const nativeTx = transactionToNative(tx);
    await this.api.upsertNativeTransaction(nativeTx);
  }

  /**
   * Bulk upsert transactions
   */
  async upsertTransactions(transactions: Transaction[]): Promise<void> {
    if (!this.api) {
      throw new Error('Native database API not available');
    }

    const nativeTxs = transactions.map(transactionToNative);
    await this.api.bulkUpsertNativeTransactions(nativeTxs);
  }

  /**
   * Get total count of transactions (for pagination)
   */
  async getTransactionCount(projectId?: string | null): Promise<number> {
    if (!this.api) return 0;
    try {
      const result = await this.api.countNativeTransactions({ projectId });
      return result.count;
    } catch (error) {
      console.error('Failed to get transaction count:', error);
      return -1;
    }
  }
}

// Singleton instance
let nativeDbServiceInstance: NativeDatabaseService | null = null;

export function getNativeDatabaseService(): NativeDatabaseService {
  if (!nativeDbServiceInstance) {
    nativeDbServiceInstance = new NativeDatabaseService();
  }
  return nativeDbServiceInstance;
}

