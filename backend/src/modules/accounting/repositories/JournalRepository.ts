import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import { todayUtcYyyyMmDd } from '../../../utils/dateOnly.js';
import { assertAccountingPeriodOpen } from '../../../services/accountingPeriodService.js';
import { appendAuditEvent } from '../../../services/enterpriseAuditService.js';
import {
  roundMoney,
  validateBalanced,
  swapLinesForReversal,
  type JournalLineInput,
} from '../../../financial/validation.js';

export type InvestorTransactionType = 'investment' | 'profit_allocation' | 'withdrawal' | 'transfer';

export type CreateJournalBody = {
  entryDate: string;
  reference?: string;
  description?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  createdBy?: string | null;
  projectId?: string | null;
  investorId?: string | null;
  investorTransactionType?: InvestorTransactionType | null;
  lines: JournalLineInput[];
};

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

function newId(): string {
  return randomUUID();
}

/**
 * Tenant-scoped journal persistence. All GL writes go through this repository.
 */
export class JournalRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  private async assertAccountsExist(client: pg.PoolClient, accountIds: string[]): Promise<void> {
    const uniq = [...new Set(accountIds)];
    if (uniq.length === 0) throw new Error('No accounts specified.');
    const ph = uniq.map((_, i) => `$${i + 1}`).join(',');
    const r = await client.query<{ id: string }>(
      `SELECT id FROM accounts WHERE id IN (${ph}) AND deleted_at IS NULL
       AND (tenant_id = $${uniq.length + 1} OR tenant_id = $${uniq.length + 2})`,
      [...uniq, this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    const found = new Set(r.rows.map((x) => x.id));
    for (const id of uniq) {
      if (!found.has(id)) {
        throw new Error(`Account not found for this tenant or inactive: ${id}`);
      }
    }
  }

  private async persistEntryRow(
    client: pg.PoolClient,
    journalEntryId: string,
    input: CreateJournalBody
  ): Promise<void> {
    const entryProjectId =
      input.projectId != null && String(input.projectId).trim() !== '' ? String(input.projectId).trim() : null;
    const entryInvestorId =
      input.investorId != null && String(input.investorId).trim() !== '' ? String(input.investorId).trim() : null;
    const entryInvType = input.investorTransactionType ?? null;

    await client.query(
      `INSERT INTO journal_entries (id, tenant_id, entry_date, reference, description, source_module, source_id, created_by, project_id, investor_id, investor_transaction_type, created_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        journalEntryId,
        this.tenantId,
        input.entryDate,
        input.reference ?? '',
        input.description ?? null,
        input.sourceModule ?? null,
        input.sourceId ?? null,
        input.createdBy ?? null,
        entryProjectId,
        entryInvestorId,
        entryInvType,
      ]
    );
  }

  private async persistLines(
    client: pg.PoolClient,
    journalEntryId: string,
    lines: JournalLineInput[]
  ): Promise<void> {
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const lineId = newId();
      const d = roundMoney(line.debitAmount);
      const c = roundMoney(line.creditAmount);
      const pid = line.projectId != null && String(line.projectId).trim() !== '' ? String(line.projectId).trim() : null;
      await client.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_amount, credit_amount, line_number, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [lineId, journalEntryId, line.accountId, d, c, idx, pid]
      );
    }
  }

  private async persistCreateAudit(
    client: pg.PoolClient,
    journalEntryId: string,
    input: CreateJournalBody
  ): Promise<Record<string, unknown>> {
    const auditPayload = JSON.stringify({
      journalEntryId,
      entryDate: input.entryDate,
      reference: input.reference,
      sourceModule: input.sourceModule,
      sourceId: input.sourceId,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debitAmount: roundMoney(l.debitAmount),
        creditAmount: roundMoney(l.creditAmount),
        projectId: l.projectId ?? null,
      })),
    });
    await client.query(
      `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, timestamp, old_value, new_value)
       VALUES ($1, $2, 'journal_entry', $3, 'create', $4, NOW(), NULL, $5)`,
      [newId(), this.tenantId, journalEntryId, input.createdBy ?? null, auditPayload]
    );
    return JSON.parse(auditPayload) as Record<string, unknown>;
  }

  async insertEntry(
    client: pg.PoolClient,
    input: CreateJournalBody,
    journalEntryIdOverride?: string,
    options?: { allowClosedPeriod?: boolean }
  ): Promise<{ journalEntryId: string }> {
    const err = validateBalanced(input.lines);
    if (err) throw new Error(err);

    await assertAccountingPeriodOpen(client, this.tenantId, input.entryDate, {
      allowClosedPeriod: options?.allowClosedPeriod,
    });

    await this.assertAccountsExist(
      client,
      input.lines.map((l) => l.accountId)
    );

    const journalEntryId = journalEntryIdOverride ?? newId();
    await this.persistEntryRow(client, journalEntryId, input);
    await this.persistLines(client, journalEntryId, input.lines);
    const auditValue = await this.persistCreateAudit(client, journalEntryId, input);

    await appendAuditEvent(client, {
      tenantId: this.tenantId,
      userId: input.createdBy ?? null,
      module: 'journal',
      action: 'post',
      entityType: 'journal_entry',
      entityId: journalEntryId,
      summary: `Journal entry posted (${input.reference?.trim() || journalEntryId.slice(0, 8)})`,
      newValue: auditValue,
    });

    return { journalEntryId };
  }

  async getWithLines(
    client: pg.PoolClient,
    journalEntryId: string
  ): Promise<{ entry: Record<string, unknown>; lines: Record<string, unknown>[] } | null> {
    const e = await client.query(
      `SELECT id, tenant_id, entry_date, reference, description, source_module, source_id, created_by, created_at,
              project_id, investor_id, investor_transaction_type
       FROM journal_entries WHERE id = $1 AND tenant_id = $2`,
      [journalEntryId, this.tenantId]
    );
    if (e.rows.length === 0) return null;
    const l = await client.query(
      `SELECT id, journal_entry_id, account_id, debit_amount, credit_amount, line_number, project_id
       FROM journal_lines WHERE journal_entry_id = $1 ORDER BY line_number ASC`,
      [journalEntryId]
    );
    return { entry: e.rows[0], lines: l.rows };
  }

  async getSourceModuleForUpdate(
    client: pg.PoolClient,
    journalEntryId: string
  ): Promise<{ id: string; source_module: string | null } | null> {
    const r = await client.query<{ id: string; source_module: string | null }>(
      `SELECT id, source_module FROM journal_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [journalEntryId, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async isReversed(client: pg.PoolClient, journalEntryId: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM journal_reversals WHERE original_journal_entry_id = $1 AND tenant_id = $2 LIMIT 1`,
      [journalEntryId, this.tenantId]
    );
    return r.rows.length > 0;
  }

  async isReversedAnyTenant(client: pg.PoolClient, journalEntryId: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM journal_reversals WHERE original_journal_entry_id = $1 LIMIT 1`,
      [journalEntryId]
    );
    return r.rows.length > 0;
  }

  static async isReversedGlobal(client: pg.PoolClient, journalEntryId: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM journal_reversals WHERE original_journal_entry_id = $1 LIMIT 1`,
      [journalEntryId]
    );
    return r.rows.length > 0;
  }

  async reverseEntry(
    client: pg.PoolClient,
    originalJournalEntryId: string,
    reason: string,
    createdBy: string | null
  ): Promise<{ reversalJournalEntryId: string }> {
    if (!reason?.trim()) throw new Error('Reversal reason is required.');

    const existing = await this.getWithLines(client, originalJournalEntryId);
    if (!existing) throw new Error('Original journal entry not found.');

    if (await this.isReversed(client, originalJournalEntryId)) {
      throw new Error('This journal entry has already been reversed.');
    }

    const lineInputs: JournalLineInput[] = existing.lines.map((row: Record<string, unknown>) => ({
      accountId: String(row.account_id),
      debitAmount: Number(row.debit_amount),
      creditAmount: Number(row.credit_amount),
      projectId: row.project_id != null && String(row.project_id) !== '' ? String(row.project_id) : null,
    }));
    const swapped = swapLinesForReversal(lineInputs);
    const verr = validateBalanced(swapped);
    if (verr) throw new Error(verr);

    await this.assertAccountsExist(
      client,
      swapped.map((l) => l.accountId)
    );

    const origEntry = existing.entry as Record<string, unknown>;
    const reversalJournalEntryId = newId();
    const reversalInput: CreateJournalBody = {
      entryDate: todayUtcYyyyMmDd(),
      reference: `REV:${originalJournalEntryId}`,
      description: `Reversal of ${originalJournalEntryId}: ${reason.trim()}`,
      sourceModule: 'reversal',
      sourceId: originalJournalEntryId,
      createdBy,
      projectId: origEntry.project_id != null ? String(origEntry.project_id) : null,
      investorId: origEntry.investor_id != null ? String(origEntry.investor_id) : null,
      investorTransactionType: null,
      lines: swapped,
    };

    await this.insertEntry(client, reversalInput, reversalJournalEntryId);

    await client.query(
      `INSERT INTO journal_reversals (id, tenant_id, original_journal_entry_id, reversal_journal_entry_id, reason, created_at, created_by)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [newId(), this.tenantId, originalJournalEntryId, reversalJournalEntryId, reason.trim(), createdBy]
    );

    const auditNew = JSON.stringify({
      originalJournalEntryId,
      reversalJournalEntryId,
      reason: reason.trim(),
    });
    await client.query(
      `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, timestamp, old_value, new_value)
       VALUES ($1, $2, 'journal_reversal', $3, 'reverse', $4, NOW(), $5, $6)`,
      [
        newId(),
        this.tenantId,
        originalJournalEntryId,
        createdBy,
        JSON.stringify({ id: originalJournalEntryId }),
        auditNew,
      ]
    );

    return { reversalJournalEntryId };
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

  async getTrialBalanceReport(
    client: pg.PoolClient,
    options?: { fromDate?: string; toDate?: string }
  ): Promise<
    Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      total_debit: number;
      total_credit: number;
    }>
  > {
    const params: unknown[] = [this.tenantId, GLOBAL_SYSTEM_TENANT_ID];
    let cond = '';
    if (options?.fromDate) {
      cond += ` AND je.entry_date >= $${params.length + 1}`;
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      cond += ` AND je.entry_date <= $${params.length + 1}`;
      params.push(options.toDate);
    }
    const r = await client.query(
      `SELECT
        jl.account_id AS account_id,
        a.name AS account_name,
        a.type AS account_type,
        COALESCE(SUM(jl.debit_amount), 0)::float AS total_debit,
        COALESCE(SUM(jl.credit_amount), 0)::float AS total_credit
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
      WHERE je.tenant_id = $1${cond}
      GROUP BY jl.account_id, a.name, a.type
      ORDER BY a.type, a.name`,
      params
    );
    return r.rows as Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      total_debit: number;
      total_credit: number;
    }>;
  }

  async getGeneralLedgerReport(
    client: pg.PoolClient,
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
      is_brought_forward?: boolean;
    }>;
  }> {
    const acc = await client.query(
      `SELECT type, name, COALESCE(opening_balance, 0)::float AS opening_balance
       FROM accounts WHERE id = $1 AND (tenant_id = $2 OR tenant_id = $3) AND deleted_at IS NULL`,
      [accountId, this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    if (acc.rows.length === 0) throw new Error('Account not found.');
    const accountType = String((acc.rows[0] as { type: string }).type);
    const accountName = String((acc.rows[0] as { name: string }).name);
    const openingBalance = roundMoney(Number((acc.rows[0] as { opening_balance: number }).opening_balance));
    const dir = normalBalanceDirection(accountType);

    let running = roundMoney(dir * openingBalance);

    if (options?.fromDate) {
      const prior = await client.query(
        `SELECT
          COALESCE(SUM(jl.debit_amount), 0)::float AS gross_debit,
          COALESCE(SUM(jl.credit_amount), 0)::float AS gross_credit
        FROM journal_lines jl
        INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id = $1 AND je.tenant_id = $2 AND je.entry_date < $3::date`,
        [accountId, this.tenantId, options.fromDate]
      );
      if (prior.rows.length) {
        const gd = roundMoney(Number((prior.rows[0] as { gross_debit: number }).gross_debit));
        const gc = roundMoney(Number((prior.rows[0] as { gross_credit: number }).gross_credit));
        running = roundMoney(running + dir * (gd - gc));
      }
    }

    type GlRow = {
      entry_date: string;
      journal_entry_id: string;
      reference: string;
      description: string | null;
      line_number: number;
      debit_amount: number;
      credit_amount: number;
      running_balance: number;
      is_brought_forward?: boolean;
    };

    const rows: GlRow[] = [];
    if (Math.abs(running) >= 0.005 || openingBalance !== 0) {
      rows.push({
        entry_date: options?.fromDate ?? '',
        journal_entry_id: '',
        reference: 'B/F',
        description: 'Brought forward (opening balance + prior activity)',
        line_number: 0,
        debit_amount: 0,
        credit_amount: 0,
        running_balance: running,
        is_brought_forward: true,
      });
    }

    const params: unknown[] = [accountId, this.tenantId];
    let cond = '';
    if (options?.fromDate) {
      cond += ` AND je.entry_date >= $${params.length + 1}::date`;
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      cond += ` AND je.entry_date <= $${params.length + 1}::date`;
      params.push(options.toDate);
    }

    const r = await client.query(
      `SELECT
        je.entry_date AS entry_date,
        je.id AS journal_entry_id,
        je.reference AS reference,
        je.description AS description,
        jl.line_number AS line_number,
        jl.debit_amount AS debit_amount,
        jl.credit_amount AS credit_amount
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.account_id = $1 AND je.tenant_id = $2${cond}
      ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`,
      params
    );

    for (const raw of r.rows as Record<string, unknown>[]) {
      const debit = roundMoney(Number(raw.debit_amount));
      const credit = roundMoney(Number(raw.credit_amount));
      const delta = dir * (debit - credit);
      running = roundMoney(running + delta);
      rows.push({
        entry_date: String(raw.entry_date),
        journal_entry_id: String(raw.journal_entry_id),
        reference: String(raw.reference ?? ''),
        description: raw.description != null ? String(raw.description) : null,
        line_number: Number(raw.line_number),
        debit_amount: debit,
        credit_amount: credit,
        running_balance: running,
      });
    }

    return { accountType, accountName, rows };
  }

  async loadLedgerInput(
    client: pg.PoolClient,
    options?: { asOfDate?: string }
  ): Promise<{
    journalLines: Array<{
      journalEntryId: string;
      accountId: string;
      debitAmount: number;
      creditAmount: number;
      lineNumber: number;
      projectId: string | null;
    }>;
    journalEntries: Array<{
      id: string;
      entryDate: string;
      reference?: string;
      description: string | null;
      sourceModule: string | null;
      sourceId: string | null;
      projectId: string | null;
      isReversed: boolean;
    }>;
  }> {
    const params: unknown[] = [this.tenantId];
    let dateCond = '';
    if (options?.asOfDate) {
      dateCond = ` AND je.entry_date <= $${params.length + 1}::date`;
      params.push(options.asOfDate);
    }

    const linesR = await client.query(
      `SELECT
        jl.journal_entry_id AS journal_entry_id,
        jl.account_id AS account_id,
        jl.debit_amount::float AS debit_amount,
        jl.credit_amount::float AS credit_amount,
        jl.line_number AS line_number,
        jl.project_id AS project_id
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.tenant_id = $1${dateCond}
      ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`,
      params
    );

    const entriesR = await client.query(
      `SELECT
        je.id AS id,
        je.entry_date::text AS entry_date,
        je.reference AS reference,
        je.description AS description,
        je.source_module AS source_module,
        je.source_id AS source_id,
        je.project_id AS project_id,
        EXISTS (
          SELECT 1 FROM journal_reversals jr
          WHERE jr.original_journal_entry_id = je.id AND jr.tenant_id = je.tenant_id
        ) AS is_reversed
      FROM journal_entries je
      WHERE je.tenant_id = $1${dateCond}`,
      params
    );

    return {
      journalLines: (linesR.rows as Record<string, unknown>[]).map((r) => ({
        journalEntryId: String(r.journal_entry_id),
        accountId: String(r.account_id),
        debitAmount: Number(r.debit_amount),
        creditAmount: Number(r.credit_amount),
        lineNumber: Number(r.line_number),
        projectId: r.project_id != null ? String(r.project_id) : null,
      })),
      journalEntries: (entriesR.rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        entryDate: String(r.entry_date).slice(0, 10),
        reference: r.reference != null ? String(r.reference) : undefined,
        description: r.description != null ? String(r.description) : null,
        sourceModule: r.source_module != null ? String(r.source_module) : null,
        sourceId: r.source_id != null ? String(r.source_id) : null,
        projectId: r.project_id != null ? String(r.project_id) : null,
        isReversed: Boolean(r.is_reversed),
      })),
    };
  }

  async aggregateTrialBalanceRows(
    client: pg.PoolClient,
    options: {
      from: string;
      to: string;
      basis: 'period' | 'cumulative';
      priorOnly?: boolean;
      priorBefore?: string;
    }
  ): Promise<
    Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      parent_account_id: string | null;
      account_code: string | null;
      sub_type: string | null;
      is_active: boolean;
      gross_debit: number;
      gross_credit: number;
    }>
  > {
    const params: unknown[] = [this.tenantId, GLOBAL_SYSTEM_TENANT_ID];
    let dateCond = '';
    if (options.priorOnly && options.priorBefore) {
      dateCond = ` AND je.entry_date < $${params.length + 1}`;
      params.push(options.priorBefore);
    } else if (options.basis === 'cumulative') {
      dateCond = ` AND je.entry_date <= $${params.length + 1}`;
      params.push(options.to);
    } else {
      dateCond = ` AND je.entry_date >= $${params.length + 1} AND je.entry_date <= $${params.length + 2}`;
      params.push(options.from, options.to);
    }

    const r = await client.query(
      `SELECT
        jl.account_id AS account_id,
        a.name AS account_name,
        a.type AS account_type,
        a.parent_account_id AS parent_account_id,
        a.account_code AS account_code,
        a.sub_type AS sub_type,
        COALESCE(a.is_active, TRUE) AS is_active,
        COALESCE(SUM(jl.debit_amount), 0)::float AS gross_debit,
        COALESCE(SUM(jl.credit_amount), 0)::float AS gross_credit
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id
        AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
      WHERE je.tenant_id = $1
        AND a.deleted_at IS NULL
        ${dateCond}
      GROUP BY jl.account_id, a.name, a.type, a.parent_account_id, a.account_code, a.sub_type, a.is_active`,
      params
    );
    return r.rows as Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      parent_account_id: string | null;
      account_code: string | null;
      sub_type: string | null;
      is_active: boolean;
      gross_debit: number;
      gross_credit: number;
    }>;
  }

  async deleteByTransactionSourceIds(
    client: pg.PoolClient,
    transactionIds: string[]
  ): Promise<{ reversals: number; lines: number; entries: number }> {
    if (transactionIds.length === 0) {
      return { reversals: 0, lines: 0, entries: 0 };
    }
    const jeR = await client.query<{ id: string }>(
      `SELECT id FROM journal_entries
       WHERE tenant_id = $1 AND source_module = 'transaction' AND source_id = ANY($2::text[])`,
      [this.tenantId, transactionIds]
    );
    const journalEntryIds = jeR.rows.map((r) => r.id);
    if (journalEntryIds.length === 0) {
      return { reversals: 0, lines: 0, entries: 0 };
    }
    const revDel = await client.query(
      `DELETE FROM journal_reversals
       WHERE tenant_id = $1
         AND (original_journal_entry_id = ANY($2::text[]) OR reversal_journal_entry_id = ANY($2::text[]))`,
      [this.tenantId, journalEntryIds]
    );
    const jlDel = await client.query(
      `DELETE FROM journal_lines WHERE journal_entry_id = ANY($1::text[])`,
      [journalEntryIds]
    );
    const jeDel = await client.query(
      `DELETE FROM journal_entries WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [this.tenantId, journalEntryIds]
    );
    return {
      reversals: revDel.rowCount ?? 0,
      lines: jlDel.rowCount ?? 0,
      entries: jeDel.rowCount ?? 0,
    };
  }
}

function normalBalanceDirection(accountType: string): 1 | -1 {
  const t = (accountType || '').toLowerCase();
  if (t === 'asset' || t === 'expense' || t === 'bank' || t === 'cash') return 1;
  return -1;
}
