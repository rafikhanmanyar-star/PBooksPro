/**
 * Investor-specific journal postings (LAN / PostgreSQL).
 */

import { apiClient } from './client';

export type InvestorLedgerApiRow = {
  journalEntryId: string;
  entryDate: string;
  investorTransactionType: string | null;
  reference: string | null;
  description: string | null;
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  projectId: string | null;
};

export const investorJournalApi = {
  async postContribution(body: {
    entryDate: string;
    amount: number;
    cashAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    investorPartyId?: string | null;
    description?: string;
    reference?: string;
  }): Promise<{ journalEntryId: string }> {
    return apiClient.post('/investor/journal/contribution', body);
  },

  async postWithdrawal(body: {
    entryDate: string;
    amount: number;
    cashAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    investorPartyId?: string | null;
    description?: string;
    reference?: string;
    skipBalanceCheck?: boolean;
  }): Promise<{ journalEntryId: string }> {
    return apiClient.post('/investor/journal/withdrawal', body);
  },

  async postProfitAllocation(body: {
    entryDate: string;
    amount: number;
    retainedEarningsAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    investorPartyId?: string | null;
    description?: string;
    reference?: string;
  }): Promise<{ journalEntryId: string }> {
    return apiClient.post('/investor/journal/profit-allocation', body);
  },

  async postInterProjectTransfer(body: {
    entryDate: string;
    amount: number;
    investorEquityAccountId: string;
    investorPartyId?: string | null;
    sourceProjectId: string;
    destProjectId: string;
    cashAccountId: string;
    description?: string;
  }): Promise<{ outJournalEntryId: string; inJournalEntryId: string }> {
    return apiClient.post('/investor/journal/inter-project-transfer', body);
  },

  async getInvestorEquityLedger(options: {
    investorEquityAccountId: string;
    fromDate?: string;
    toDate?: string;
    projectId?: string | 'all';
  }): Promise<InvestorLedgerApiRow[]> {
    const q = new URLSearchParams();
    q.set('investorEquityAccountId', options.investorEquityAccountId);
    if (options.fromDate) q.set('fromDate', options.fromDate);
    if (options.toDate) q.set('toDate', options.toDate);
    if (options.projectId && options.projectId !== 'all') q.set('projectId', options.projectId);
    return apiClient.get<InvestorLedgerApiRow[]>(`/investor/journal/ledger?${q.toString()}`);
  },
};
