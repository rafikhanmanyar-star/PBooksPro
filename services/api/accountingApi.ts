import { apiClient } from './client';
import { ChartAccount, JournalEntry, LedgerTransaction } from '../../types/accounting';
import { journalApi } from './journalApi';
import type { CreateJournalEntryInput } from '../financialEngine/types';

function toJournalInput(entry: Partial<JournalEntry>): CreateJournalEntryInput {
    const tenantId =
        entry.tenantId ||
        (typeof window !== 'undefined' ? localStorage.getItem('tenant_id') || '' : '');
    if (!entry.entryDate || !entry.lines?.length) {
        throw new Error('Journal entry requires entryDate and at least one line');
    }
    return {
        tenantId,
        entryDate: entry.entryDate,
        reference: entry.reference,
        description: entry.description ?? undefined,
        sourceModule: entry.sourceModule ?? undefined,
        sourceId: entry.sourceId ?? undefined,
        createdBy: entry.createdBy ?? null,
        lines: entry.lines.map((l) => ({
            accountId: l.accountId,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
        })),
    };
}

export const accountingApi = {
    // Accounts
    getAccounts: () => apiClient.get<ChartAccount[]>('/accounts'),
    createAccount: (account: Partial<ChartAccount>) => apiClient.post<ChartAccount>('/accounts', account),
    updateAccount: (id: string, account: Partial<ChartAccount>) => apiClient.put<ChartAccount>(`/accounts/${id}`, account),
    deleteAccount: (id: string) => apiClient.delete(`/accounts/${id}`),

    // Transactions / Journal — server validates balance; returns { journalEntryId }
    postJournalEntry: (entry: Partial<JournalEntry>) => journalApi.createJournalEntry(toJournalInput(entry)),

    // Ledger
    getLedger: (accountId: string) => apiClient.get<LedgerTransaction[]>(`/transactions?accountId=${accountId}`),

    // Metrics (if needed, otherwise calculated on frontend)
    getMetrics: () => apiClient.get<any>('/transactions/metrics')
};
