/**
 * Fiscal accounting periods API (LAN / PostgreSQL).
 */

import { apiClient } from './client';

export type AccountingPeriodStatus = 'open' | 'closed';

export type AccountingPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  closedBy: string | null;
  closedAt: string | null;
  closingJournalEntryId: string | null;
  yearEndTransferJournalEntryId: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
};

export type ClosePeriodResult = {
  period: AccountingPeriod;
  closingJournalEntryId: string | null;
  yearEndTransferJournalEntryId: string | null;
  totals: { totalIncome: number; totalExpenses: number; netIncome: number };
};

export const accountingPeriodsApi = {
  async list(): Promise<AccountingPeriod[]> {
    return apiClient.get<AccountingPeriod[]>('/accounting-periods');
  },

  async get(id: string): Promise<AccountingPeriod> {
    return apiClient.get<AccountingPeriod>(`/accounting-periods/${encodeURIComponent(id)}`);
  },

  async openPeriod(startDate: string, endDate: string): Promise<AccountingPeriod> {
    return apiClient.post<AccountingPeriod>('/accounting-periods/open', { startDate, endDate });
  },

  async closePeriod(
    id: string,
    options?: { selectedProjectId?: string; performYearEndTransfer?: boolean }
  ): Promise<ClosePeriodResult> {
    return apiClient.post<ClosePeriodResult>(`/accounting-periods/${encodeURIComponent(id)}/close`, options ?? {});
  },

  async reopenPeriod(id: string): Promise<AccountingPeriod> {
    return apiClient.post<AccountingPeriod>(`/accounting-periods/${encodeURIComponent(id)}/reopen`, {});
  },
};
