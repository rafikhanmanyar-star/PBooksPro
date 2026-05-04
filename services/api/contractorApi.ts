/**
 * Contractor advances / bills API (PostgreSQL-backed). No-op stubs in local-only mode.
 */

import { isLocalOnlyMode } from '../../config/apiUrl';
import { apiClient } from './client';

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
};
