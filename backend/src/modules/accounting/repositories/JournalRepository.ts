import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { roundMoney } from '../../../financial/validation.js';
import {
  insertJournalEntry,
  reverseJournalEntry,
  getJournalWithLines,
  isJournalReversed,
  type CreateJournalBody,
} from '../../../services/journalService.js';

export type InvestorEquityLedgerLineRow = {
  journal_entry_id: string;
  entry_date: string;
  investor_transaction_type: string | null;
  reference: string | null;
  description: string | null;
  account_id: string;
  account_name: string;
  debit: number;
  credit: number;
  project_id: string | null;
};

export type InvestorEquityLedgerFilters = {
  from?: string;
  to?: string;
  projectId?: string | 'all';
};

/**
 * Tenant-scoped journal persistence. All GL writes go through this repository.
 */
export class JournalRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async insertEntry(
    client: pg.PoolClient,
    input: CreateJournalBody,
    journalEntryIdOverride?: string,
    options?: { allowClosedPeriod?: boolean }
  ): Promise<{ journalEntryId: string }> {
    return insertJournalEntry(client, this.tenantId, input, journalEntryIdOverride, options);
  }

  async reverseEntry(
    client: pg.PoolClient,
    originalJournalEntryId: string,
    reason: string,
    createdBy: string | null
  ): Promise<{ reversalJournalEntryId: string }> {
    return reverseJournalEntry(client, this.tenantId, originalJournalEntryId, reason, createdBy);
  }

  async getWithLines(
    client: pg.PoolClient,
    journalEntryId: string
  ): Promise<{ entry: Record<string, unknown>; lines: Record<string, unknown>[] } | null> {
    return getJournalWithLines(client, journalEntryId, this.tenantId);
  }

  async isReversed(client: pg.PoolClient, journalEntryId: string): Promise<boolean> {
    return isJournalReversed(client, journalEntryId, this.tenantId);
  }

  async findActiveBySource(
    client: pg.PoolClient,
    sourceModule: string,
    sourceId: string
  ): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT je.id FROM journal_entries je
       WHERE je.tenant_id = $1 AND je.source_module = $2 AND je.source_id = $3
         AND NOT EXISTS (
           SELECT 1 FROM journal_reversals jr
           WHERE jr.original_journal_entry_id = je.id AND jr.tenant_id = $1
         )
       ORDER BY je.created_at DESC, je.id DESC
       LIMIT 1`,
      [this.tenantId, sourceModule, sourceId]
    );
    return r.rows[0]?.id ?? null;
  }

  /** Equity GL: net balance = credits − debits through date (normal credit balance). */
  async getEquityAccountBalanceThrough(
    client: pg.PoolClient,
    equityAccountId: string,
    asOfYyyyMmDd: string
  ): Promise<number> {
    const r = await client.query<{ s: string }>(
      `SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0)::text AS s
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.tenant_id = $1 AND jl.account_id = $2 AND je.entry_date <= $3::date`,
      [this.tenantId, equityAccountId, asOfYyyyMmDd]
    );
    return roundMoney(Number(r.rows[0]?.s ?? 0));
  }

  async listInvestorEquityLedgerLines(
    client: pg.PoolClient,
    investorEquityAccountId: string,
    options: InvestorEquityLedgerFilters
  ): Promise<InvestorEquityLedgerLineRow[]> {
    const params: unknown[] = [this.tenantId, investorEquityAccountId];
    let dateCond = '';
    if (options.from) {
      dateCond += ` AND je.entry_date >= $${params.length + 1}::date`;
      params.push(options.from);
    }
    if (options.to) {
      dateCond += ` AND je.entry_date <= $${params.length + 1}::date`;
      params.push(options.to);
    }
    let projCond = '';
    if (options.projectId && options.projectId !== 'all') {
      projCond = ` AND (je.project_id = $${params.length + 1} OR jl.project_id = $${params.length + 1})`;
      params.push(options.projectId);
    }

    const r = await client.query<InvestorEquityLedgerLineRow>(
      `SELECT je.id AS journal_entry_id, je.entry_date::text AS entry_date,
              je.investor_transaction_type, je.reference, je.description,
              jl.account_id, a.name AS account_name,
              jl.debit_amount::float AS debit, jl.credit_amount::float AS credit,
              COALESCE(jl.project_id, je.project_id) AS project_id
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       INNER JOIN accounts a ON a.id = jl.account_id
       WHERE je.tenant_id = $1
         AND jl.account_id = $2
         AND a.deleted_at IS NULL
         ${dateCond}
         ${projCond}
       ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`,
      params
    );
    return r.rows;
  }
}
