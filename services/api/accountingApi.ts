
import { apiClient } from './client';
import { ChartAccount, JournalEntry, LedgerTransaction } from '../../types/accounting';

export const accountingApi = {
    // Accounts
    getAccounts: () => apiClient.get<ChartAccount[]>('/accounts'),
    createAccount: (account: Partial<ChartAccount>) => apiClient.post<ChartAccount>('/accounts', account),
    updateAccount: (id: string, account: Partial<ChartAccount>) => apiClient.put<ChartAccount>(`/accounts/${id}`, account),
    deleteAccount: (id: string) => apiClient.delete(`/accounts/${id}`),

    // Transactions / Journal
    postJournalEntry: (entry: Partial<JournalEntry>) => apiClient.post<JournalEntry>('/transactions/journal', entry),

    // Ledger
    getLedger: (accountId: string) => apiClient.get<LedgerTransaction[]>(`/transactions?accountId=${accountId}`),

    // Metrics (if needed, otherwise calculated on frontend)
    getMetrics: () => apiClient.get<any>('/transactions/metrics')
};
