/**
 * Server-side journal posting (LAN / PostgreSQL). Uses ApiClient unwrap for { success, data }.
 */

import { apiClient } from './client';
import type { CreateJournalEntryInput } from '../financialEngine/types';

export const journalApi = {
  async createJournalEntry(input: CreateJournalEntryInput): Promise<{ journalEntryId: string }> {
    const body = {
      entryDate: input.entryDate,
      reference: input.reference,
      description: input.description ?? null,
      sourceModule: input.sourceModule ?? null,
      sourceId: input.sourceId ?? null,
      createdBy: input.createdBy ?? null,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
      })),
    };
    return apiClient.post<{ journalEntryId: string }>('/transactions/journal', body);
  },

  async reverseJournalEntry(
    originalJournalEntryId: string,
    reason: string
  ): Promise<{ reversalJournalEntryId: string }> {
    return apiClient.post<{ reversalJournalEntryId: string }>(
      `/transactions/journal/${encodeURIComponent(originalJournalEntryId)}/reverse`,
      { reason }
    );
  },

  async getJournalEntryWithLines(journalEntryId: string): Promise<{
    entry: Record<string, unknown>;
    lines: Record<string, unknown>[];
    reversed?: boolean;
  } | null> {
    try {
      return await apiClient.get<{
        entry: Record<string, unknown>;
        lines: Record<string, unknown>[];
        reversed?: boolean;
      }>(`/transactions/journal/${encodeURIComponent(journalEntryId)}`);
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err?.status === 404) return null;
      throw e;
    }
  },

  async isJournalReversed(originalJournalEntryId: string): Promise<boolean> {
    const row = await this.getJournalEntryWithLines(originalJournalEntryId);
    return !!row?.reversed;
  },

  /** PostgreSQL-backed trial balance (LAN/API). Tenant comes from auth headers. */
  async getTrialBalanceReport(options?: { fromDate?: string; toDate?: string }): Promise<
    Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      total_debit: number;
      total_credit: number;
    }>
  > {
    const q = new URLSearchParams();
    if (options?.fromDate) q.set('fromDate', options.fromDate);
    if (options?.toDate) q.set('toDate', options.toDate);
    const qs = q.toString();
    return apiClient.get(
      `/transactions/journal/reports/trial-balance${qs ? `?${qs}` : ''}`
    );
  },

  /** PostgreSQL-backed account ledger (LAN/API). */
  async getGeneralLedgerReport(
    accountId: string,
    options?: { fromDate?: string; toDate?: string }
  ): Promise<{
    accountType: string;
    accountName: string;
    rows: Array<{
      entry_date: string;
      journal_entry_id: string;
      reference: string;
      description: string | null;
      line_number: number;
      debit_amount: number;
      credit_amount: number;
      running_balance: number;
    }>;
  }> {
    const q = new URLSearchParams();
    if (options?.fromDate) q.set('fromDate', options.fromDate);
    if (options?.toDate) q.set('toDate', options.toDate);
    const qs = q.toString();
    return apiClient.get(
      `/transactions/journal/reports/account/${encodeURIComponent(accountId)}/ledger${qs ? `?${qs}` : ''}`
    );
  },
};
