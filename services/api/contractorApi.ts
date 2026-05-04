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
};
