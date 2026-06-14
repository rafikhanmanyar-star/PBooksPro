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
      projectId: input.projectId ?? null,
      investorId: input.investorId ?? null,
      investorTransactionType: input.investorTransactionType ?? null,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        projectId: l.projectId ?? null,
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

  /** @deprecated Prefer getTrialBalanceCanonical — delegates to GET /api/reports/trial-balance */
  async getTrialBalanceReport(options?: { fromDate?: string; toDate?: string }): Promise<
    Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      total_debit: number;
      total_credit: number;
    }>
  > {
    const from = options?.fromDate ?? '1970-01-01';
    const to = options?.toDate ?? new Date().toISOString().slice(0, 10);
    const canonical = await this.getTrialBalanceCanonical({ from, to, basis: 'period' });
    return canonical.accounts.map((a) => ({
      account_id: a.id,
      account_name: a.name,
      account_type: a.type,
      total_debit: a.gross_debit,
      total_credit: a.gross_credit,
    }));
  },

  /** Canonical double-entry trial balance: GET /api/reports/trial-balance */
  async getTrialBalanceCanonical(options: {
    from: string;
    to: string;
    basis?: 'period' | 'cumulative';
    projectId?: string;
    buildingId?: string;
    costCenterId?: string;
  }): Promise<{
    from: string;
    to: string;
    basis: string;
    accounts: Array<{
      id: string;
      name: string;
      code: string | null;
      type: string;
      sub_type: string | null;
      parent_id: string | null;
      is_active: boolean;
      gross_debit: number;
      gross_credit: number;
      net_balance: number;
      debit: number;
      credit: number;
    }>;
    totals: {
      total_debit: number;
      total_credit: number;
      gross_debit: number;
      gross_credit: number;
    };
    is_balanced: boolean;
    difference: number;
    diagnostics?: {
      missing_project_ids: number;
      missing_building_ids: number;
      missing_cost_centers: number;
      unbalanced_projects: Array<{
        project_id: string;
        gross_debit: number;
        gross_credit: number;
        difference: number;
      }>;
    };
  }> {
    const q = new URLSearchParams();
    q.set('from', options.from);
    q.set('to', options.to);
    if (options.basis) q.set('basis', options.basis);
    if (options.projectId) q.set('projectId', options.projectId);
    if (options.buildingId) q.set('buildingId', options.buildingId);
    if (options.costCenterId) q.set('costCenterId', options.costCenterId);
    return apiClient.get(`/reports/trial-balance?${q.toString()}`);
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
