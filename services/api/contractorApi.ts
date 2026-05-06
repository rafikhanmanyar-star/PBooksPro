/**
 * Contractor advances / bills API (PostgreSQL-backed). No-op stubs in local-only mode.
 */

import { isLocalOnlyMode } from '../../config/apiUrl';
import { apiClient } from './client';
import type { Bill } from '../../types';

export type VendorBillSettleLinePayload = {
  billId: string;
  adjustments: { advanceId: string; amount: number }[];
  cashAmount: number;
  expenseAccountId: string;
};

export type VendorBillSettlementRow = {
  billId: string;
  journalEntryId: string;
  entryDate: string;
  totalAmount: number;
  cashAmount: number;
  supplierContactId: string;
  paymentAccountId: string;
  expenseAccountId: string;
  adjustments: { advanceId: string; amount: number }[];
};

export type VendorBillSettleRequestPayload = {
  supplierContactId: string;
  paymentAccountId: string;
  entryDate: string;
  bills: VendorBillSettleLinePayload[];
  reference?: string;
  description?: string;
  batchId?: string;
};

export type VendorBillSettleResponsePayload = {
  bills: Bill[];
  journalEntries: { billId: string; journalEntryId: string }[];
  /** Mirrored cash/bank expense rows for hybrid settlements; omitted on older servers. */
  transactions?: Record<string, unknown>[];
};

export type ContractorLedgerAdvance = {
  id: string;
  contractorContactId: string;
  advanceDate: string;
  originalAmount: number;
  remainingAmount: number;
  advanceJournalEntryId?: string;
  projectId?: string;
  description?: string;
};

export type ContractorLedgerAdjustmentRow = {
  id: string;
  contractorBillId: string;
  billNumber?: string;
  billDate: string;
  billAmount: number;
  advanceId: string;
  adjustmentAmount: number;
  adjustmentCreatedAt: string;
};

export type ContractorLedgerPayload = {
  advances: ContractorLedgerAdvance[];
  adjustments: ContractorLedgerAdjustmentRow[];
  summary: {
    totalOriginalAmount: number;
    totalRemainingAmount: number;
  };
};

export type CreateSupplierAdvancePayload = {
  contractorContactId: string;
  advanceDate: string;
  amount: number;
  cashAccountId: string;
  advanceAssetAccountId: string;
  projectId?: string | null;
  description?: string | null;
  reference?: string | null;
};

/** API row returned from POST /contractor/advance (see rowAdvanceToApi). */
export type SupplierAdvanceCreated = {
  id: string;
  contractorContactId: string;
  advanceDate: string;
  originalAmount: number;
  remainingAmount: number;
  cashAccountId: string;
  advanceAssetAccountId: string;
  advanceJournalEntryId?: string;
  projectId?: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const contractorApi = {
  async getContractorLedger(contactId: string): Promise<ContractorLedgerPayload | null> {
    if (isLocalOnlyMode()) return null;
    try {
      return await apiClient.get<ContractorLedgerPayload>(`/contractor/${encodeURIComponent(contactId)}/ledger`);
    } catch (e) {
      console.warn('contractorApi.getContractorLedger', e);
      return null;
    }
  },

  async getAdvances(contactId: string): Promise<ContractorLedgerAdvance[]> {
    if (isLocalOnlyMode()) return [];
    try {
      return await apiClient.get<ContractorLedgerAdvance[]>(
        `/contractor/${encodeURIComponent(contactId)}/advances`
      );
    } catch (e) {
      console.warn('contractorApi.getAdvances', e);
      return [];
    }
  },

  /**
   * Settle unpaid vendor/service bills via prepaid advances (journal) + remaining bank leg.
   */
  async settleBillsWithAdvances(body: VendorBillSettleRequestPayload): Promise<VendorBillSettleResponsePayload> {
    if (isLocalOnlyMode()) {
      throw new Error('Advance settlement is only available when using the PostgreSQL API.');
    }
    return apiClient.post<VendorBillSettleResponsePayload>('/bills/settle-with-advances', body);
  },

  async listVendorBillSettlements(billIds: string[]): Promise<VendorBillSettlementRow[]> {
    if (isLocalOnlyMode()) return [];
    const ids = billIds.filter(Boolean);
    if (ids.length === 0) return [];
    return apiClient.get<VendorBillSettlementRow[]>(
      `/bills/vendor-settlements?billIds=${encodeURIComponent(ids.join(','))}`
    );
  },

  async replaceVendorBillSettlement(body: {
    journalEntryId: string;
    supplierContactId: string;
    paymentAccountId: string;
    entryDate: string;
    bill: VendorBillSettleLinePayload;
    reference?: string;
    description?: string;
    batchId?: string;
  }): Promise<{
    bills: Bill[];
    reversalJournalEntryId: string;
    deletedTransactionIds: string[];
    journalEntries: { billId: string; journalEntryId: string }[];
    transactions?: Record<string, unknown>[];
  }> {
    if (isLocalOnlyMode()) {
      throw new Error('Settlement replace requires the PostgreSQL API.');
    }
    return apiClient.post('/bills/vendor-settlement/replace', body);
  },

  async reverseVendorBillSettlement(body: { journalEntryId: string; reason: string }): Promise<{
    reversalJournalEntryId: string;
    billIds: string[];
    touchedAdvanceIds: string[];
    deletedTransactionIds: string[];
  }> {
    if (isLocalOnlyMode()) {
      throw new Error('Settlement reversal requires the PostgreSQL API.');
    }
    return apiClient.post('/bills/vendor-settlement/reverse', body);
  },

  /** Record prepaid funds to a supplier (journal: Dr advance asset, Cr bank/cash). */
  async createSupplierAdvance(body: CreateSupplierAdvancePayload): Promise<SupplierAdvanceCreated> {
    if (isLocalOnlyMode()) {
      throw new Error('Supplier advances require the PostgreSQL API.');
    }
    return apiClient.post<SupplierAdvanceCreated>('/contractor/advance', body);
  },
};
