/**
 * General ledger, trial balance, and account statement from journal_lines + journal_entries.
 * Local-only: SQLite via Electron bridge. LAN/API: PostgreSQL via REST.
 */

import { roundMoney } from './validation';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { journalApi } from '../api/journalApi';
import {
  applyOpeningBalances,
  buildTrialBalanceReport,
  buildDimensionSql,
  compareTrialBalanceType,
  isDimensionScopeActive,
  ledgerTenantIdsForLocalQuery,
  mergeRawRowsByAccount,
  normalBalanceDirection,
  scopeFromReportFilters,
  shouldApplyOpeningBalancesForScope,
  type AccountOpeningInput,
  type FinancialDimensionScope,
  type TrialBalanceBasis,
  type TrialBalanceRawRow,
  type TrialBalanceReportPayload,
} from './trialBalanceCore';
import { buildTrialBalanceRawRowsFromTransactions } from './trialBalanceFromTransactions';
import type { Account, Transaction } from '../../types';
import {
  filterTransactionsForTrialBalanceEntityScope,
  type ReportStateSlice,
} from '../../components/reports/reportUtils';
import { entityScopeFromFilterId } from '../../components/reports/financialEntityScope';

function getBridge() {
  if (typeof window === 'undefined' || !window.sqliteBridge?.query) {
    throw new Error('Ledger reports require Electron SQLite bridge.');
  }
  return window.sqliteBridge;
}

/** @deprecated Use fetchTrialBalanceReport — gross columns only */
export type TrialBalanceRow = {
  account_id: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
};

export type FetchTrialBalanceOptions = {
  from: string;
  to: string;
  basis?: TrialBalanceBasis;
  /**
   * When the GL journal has no lines in range, build synthetic TB from legacy `transactions`
   * (Income/Expense/Transfer/Loan) so the report is not empty in local-only mode.
   */
  ledgerFallback?: {
    transactions: Transaction[];
    accounts: Account[];
  };
  /**
   * When not `all`, filter journal lines by project/building (GL dimensions).
   */
  entityScopeId?: string;
  /** @deprecated Use entityScopeId (`project:…` / `building:…` / `all`) */
  projectScopeId?: string;
  projectScopeState?: ReportStateSlice;
  costCenterId?: string;
};

export type TrialBalanceDimensionDiagnostics = {
  missingProjectIds: number;
  missingBuildingIds: number;
  missingCostCenters: number;
  unbalancedProjects: Array<{
    projectId: string;
    grossDebit: number;
    grossCredit: number;
    difference: number;
  }>;
};

export type TrialBalanceReportResult = TrialBalanceReportPayload & {
  from: string;
  to: string;
  basis: TrialBalanceBasis;
  /** `transactions_fallback` = derived from operational transactions; `journal` = journal_lines only. */
  dataSource?: 'journal' | 'transactions_fallback';
  diagnostics?: TrialBalanceDimensionDiagnostics;
};

function mapApiToTrialBalanceResult(raw: {
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
  difference?: number;
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
}): TrialBalanceReportResult {
  const basis: TrialBalanceBasis = raw.basis === 'cumulative' ? 'cumulative' : 'period';
  const accounts = raw.accounts.map((a) => ({
    accountId: a.id,
    accountName: a.name,
    accountType: a.type,
    parentAccountId: a.parent_id,
    accountCode: a.code,
    subType: a.sub_type,
    isActive: a.is_active,
    grossDebit: roundMoney(Number(a.gross_debit)),
    grossCredit: roundMoney(Number(a.gross_credit)),
    netBalance: roundMoney(Number(a.net_balance)),
    debit: roundMoney(Number(a.debit)),
    credit: roundMoney(Number(a.credit)),
  }));
  const totals = {
    totalDebit: roundMoney(Number(raw.totals.total_debit)),
    totalCredit: roundMoney(Number(raw.totals.total_credit)),
    grossDebit: roundMoney(Number(raw.totals.gross_debit)),
    grossCredit: roundMoney(Number(raw.totals.gross_credit)),
  };
  const difference =
    raw.difference != null
      ? roundMoney(Number(raw.difference))
      : roundMoney(totals.totalDebit - totals.totalCredit);
  const diagnostics = raw.diagnostics
    ? {
        missingProjectIds: raw.diagnostics.missing_project_ids,
        missingBuildingIds: raw.diagnostics.missing_building_ids,
        missingCostCenters: raw.diagnostics.missing_cost_centers,
        unbalancedProjects: raw.diagnostics.unbalanced_projects.map((p) => ({
          projectId: p.project_id,
          grossDebit: roundMoney(Number(p.gross_debit)),
          grossCredit: roundMoney(Number(p.gross_credit)),
          difference: roundMoney(Number(p.difference)),
        })),
      }
    : undefined;
  return {
    from: raw.from,
    to: raw.to,
    basis,
    accounts,
    totals,
    isBalanced: raw.is_balanced,
    difference,
    diagnostics,
    dataSource: 'journal',
  };
}

function dimensionScopeFromFetchOptions(
  scopeFilterId: string,
  costCenterId?: string
): FinancialDimensionScope {
  const entity = entityScopeFromFilterId(scopeFilterId);
  return scopeFromReportFilters(
    entity.projectId !== 'all' ? entity.projectId : undefined,
    entity.buildingId !== 'all' ? entity.buildingId : undefined,
    costCenterId
  );
}

async function fetchScopedTrialBalanceFromJournalLocal(
  tenantId: string,
  from: string,
  to: string,
  basis: TrialBalanceBasis,
  scope: FinancialDimensionScope
): Promise<TrialBalanceReportResult> {
  const bridge = getBridge();
  const tenantIds = ledgerTenantIdsForLocalQuery(tenantId);
  const tenantPlaceholders = tenantIds.map(() => '?').join(', ');

  const periodRows = await queryLocalJournalAggregates(
    bridge,
    tenantPlaceholders,
    tenantIds,
    from,
    to,
    basis,
    false,
    scope
  );

  let activityRows = periodRows;
  if (basis === 'period') {
    const priorRows = await queryLocalJournalAggregates(
      bridge,
      tenantPlaceholders,
      tenantIds,
      from,
      to,
      basis,
      true,
      scope
    );
    activityRows = mergeRawRowsByAccount([...priorRows, ...periodRows]);
  }

  let rawRows = activityRows;
  if (shouldApplyOpeningBalancesForScope(scope)) {
    const openings = await queryLocalAccountOpenings(bridge, tenantPlaceholders, tenantIds);
    rawRows = applyOpeningBalances(activityRows, openings);
  }

  rawRows.sort((x, y) => {
    const c = compareTrialBalanceType(x.accountType, y.accountType);
    if (c !== 0) return c;
    const cx = (x.accountCode || '').localeCompare(y.accountCode || '');
    if (cx !== 0) return cx;
    return x.accountName.localeCompare(y.accountName);
  });

  const report = buildTrialBalanceReport(rawRows);
  return {
    ...report,
    from,
    to,
    basis,
    dataSource: 'journal',
  };
}

/**
 * Canonical trial balance (double-entry): net debit/credit columns, gross totals, balance check.
 */
export async function fetchTrialBalanceReport(
  tenantId: string,
  options: FetchTrialBalanceOptions
): Promise<TrialBalanceReportResult> {
  const from = options.from;
  const to = options.to;
  const basis = options.basis ?? 'period';

  const scopeFilterId =
    options.entityScopeId ??
    (options.projectScopeId && options.projectScopeId !== 'all'
      ? `project:${options.projectScopeId}`
      : 'all');

  if (scopeFilterId !== 'all' || options.costCenterId) {
    const scope = dimensionScopeFromFetchOptions(scopeFilterId, options.costCenterId);
    if (isDimensionScopeActive(scope)) {
      if (!isLocalOnlyMode()) {
        void tenantId;
        const entity = entityScopeFromFilterId(scopeFilterId);
        const raw = await journalApi.getTrialBalanceCanonical({
          from,
          to,
          basis,
          projectId: entity.projectId !== 'all' ? entity.projectId : undefined,
          buildingId: entity.buildingId !== 'all' ? entity.buildingId : undefined,
          costCenterId: options.costCenterId,
        });
        return mapApiToTrialBalanceResult(raw as Parameters<typeof mapApiToTrialBalanceResult>[0]);
      }

      const journalResult = await fetchScopedTrialBalanceFromJournalLocal(tenantId, from, to, basis, scope);
      if (journalResult.accounts.length > 0) {
        return journalResult;
      }

      const fb = options.ledgerFallback;
      const st = options.projectScopeState;
      if (fb?.accounts?.length && st) {
        const scopedTx = filterTransactionsForTrialBalanceEntityScope(fb.transactions, scopeFilterId, st);
        let rawRows: TrialBalanceRawRow[] = buildTrialBalanceRawRowsFromTransactions(
          scopedTx,
          fb.accounts,
          from,
          to,
          basis
        );
        rawRows.sort((x, y) => {
          const c = compareTrialBalanceType(x.accountType, y.accountType);
          if (c !== 0) return c;
          const cx = (x.accountCode || '').localeCompare(y.accountCode || '');
          if (cx !== 0) return cx;
          return x.accountName.localeCompare(y.accountName);
        });
        const report = buildTrialBalanceReport(rawRows);
        return {
          ...report,
          from,
          to,
          basis,
          dataSource: 'transactions_fallback',
        };
      }

      return journalResult;
    }
  }

  if (!isLocalOnlyMode()) {
    void tenantId;
    const raw = await journalApi.getTrialBalanceCanonical({ from, to, basis });
    return mapApiToTrialBalanceResult(raw as Parameters<typeof mapApiToTrialBalanceResult>[0]);
  }

  const bridge = getBridge();
  const tenantIds = ledgerTenantIdsForLocalQuery(tenantId);
  const tenantPlaceholders = tenantIds.map(() => '?').join(', ');

  const periodRows = await queryLocalJournalAggregates(
    bridge,
    tenantPlaceholders,
    tenantIds,
    from,
    to,
    basis,
    false
  );

  let activityRows = periodRows;
  if (basis === 'period') {
    const priorRows = await queryLocalJournalAggregates(
      bridge,
      tenantPlaceholders,
      tenantIds,
      from,
      to,
      basis,
      true
    );
    activityRows = mergeRawRowsByAccount([...priorRows, ...periodRows]);
  }

  const openings = await queryLocalAccountOpenings(bridge, tenantPlaceholders, tenantIds);
  let rawRows = applyOpeningBalances(activityRows, openings);

  let dataSource: 'journal' | 'transactions_fallback' = 'journal';

  if (
    rawRows.length === 0 &&
    options.ledgerFallback?.transactions?.length &&
    options.ledgerFallback.accounts?.length
  ) {
    rawRows = buildTrialBalanceRawRowsFromTransactions(
      options.ledgerFallback.transactions,
      options.ledgerFallback.accounts,
      from,
      to,
      basis
    );
    dataSource = 'transactions_fallback';
  }

  rawRows.sort((x, y) => {
    const c = compareTrialBalanceType(x.accountType, y.accountType);
    if (c !== 0) return c;
    const cx = (x.accountCode || '').localeCompare(y.accountCode || '');
    if (cx !== 0) return cx;
    return x.accountName.localeCompare(y.accountName);
  });

  const report = buildTrialBalanceReport(rawRows);
  return {
    ...report,
    from,
    to,
    basis,
    dataSource,
  };
}

async function queryLocalJournalAggregates(
  bridge: NonNullable<typeof window.sqliteBridge>,
  tenantPlaceholders: string,
  tenantIds: string[],
  from: string,
  to: string,
  basis: TrialBalanceBasis,
  priorOnly: boolean,
  scope?: FinancialDimensionScope
): Promise<TrialBalanceRawRow[]> {
  let dateCond = '';
  const params: unknown[] = [...tenantIds];
  if (priorOnly) {
    dateCond = ` AND je.entry_date < ?`;
    params.push(from);
  } else if (basis === 'cumulative') {
    dateCond = ` AND je.entry_date <= ?`;
    params.push(to);
  } else {
    dateCond = ` AND je.entry_date >= ? AND je.entry_date <= ?`;
    params.push(from, to);
  }

  const dimensionSql =
    scope && isDimensionScopeActive(scope)
      ? buildDimensionSql(scope, params, { paramStyle: 'sqlite' })
      : '';

  const sql = `
    SELECT
      jl.account_id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      a.parent_account_id AS parent_account_id,
      a.account_code AS account_code,
      a.sub_type AS sub_type,
      COALESCE(a.is_active, 1) AS is_active_raw,
      COALESCE(SUM(jl.debit_amount), 0) AS gross_debit,
      COALESCE(SUM(jl.credit_amount), 0) AS gross_credit
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    INNER JOIN accounts a ON a.id = jl.account_id
    WHERE je.tenant_id IN (${tenantPlaceholders})
      AND a.deleted_at IS NULL
      ${dateCond}${dimensionSql}
    GROUP BY jl.account_id, a.name, a.type, a.parent_account_id, a.account_code, a.sub_type, a.is_active
  `;

  const r = await bridge.query(sql, params);
  if (!r.ok) throw new Error(r.error || 'Trial balance query failed');

  return (r.rows || []).map((row: Record<string, unknown>) => ({
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    accountType: String(row.account_type),
    parentAccountId: row.parent_account_id != null ? String(row.parent_account_id) : null,
    accountCode: row.account_code != null ? String(row.account_code) : null,
    subType: row.sub_type != null ? String(row.sub_type) : null,
    isActive: Number(row.is_active_raw) !== 0,
    grossDebit: roundMoney(Number(row.gross_debit)),
    grossCredit: roundMoney(Number(row.gross_credit)),
  }));
}

async function queryLocalAccountOpenings(
  bridge: NonNullable<typeof window.sqliteBridge>,
  tenantPlaceholders: string,
  tenantIds: string[]
): Promise<AccountOpeningInput[]> {
  const sql = `
    SELECT
      a.id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      a.parent_account_id AS parent_account_id,
      a.account_code AS account_code,
      a.sub_type AS sub_type,
      COALESCE(a.is_active, 1) AS is_active_raw,
      COALESCE(a.opening_balance, 0) AS opening_balance
    FROM accounts a
    WHERE a.tenant_id IN (${tenantPlaceholders})
      AND a.deleted_at IS NULL
      AND COALESCE(a.opening_balance, 0) <> 0
  `;
  const r = await bridge.query(sql, tenantIds);
  if (!r.ok) throw new Error(r.error || 'Opening balance query failed');
  return (r.rows || []).map((row: Record<string, unknown>) => ({
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    accountType: String(row.account_type),
    parentAccountId: row.parent_account_id != null ? String(row.parent_account_id) : null,
    accountCode: row.account_code != null ? String(row.account_code) : null,
    subType: row.sub_type != null ? String(row.sub_type) : null,
    isActive: Number(row.is_active_raw) !== 0,
    openingBalance: roundMoney(Number(row.opening_balance)),
  }));
}
/**
 * @deprecated Use fetchTrialBalanceReport for net columns and is_balanced.
 */
export async function getTrialBalance(
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<TrialBalanceRow[]> {
  const from = options?.fromDate ?? '2000-01-01';
  const to = options?.toDate ?? new Date().toISOString().slice(0, 10);
  const full = await fetchTrialBalanceReport(tenantId, { from, to, basis: 'period' });
  return full.accounts.map((a) => ({
    account_id: a.accountId,
    account_name: a.accountName,
    account_type: a.accountType,
    total_debit: a.grossDebit,
    total_credit: a.grossCredit,
  }));
}

export type GeneralLedgerRow = {
  entry_date: string;
  journal_entry_id: string;
  reference: string;
  description: string | null;
  line_number: number;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  /** True for the synthetic brought-forward row (opening + prior activity). */
  is_brought_forward?: boolean;
};

/**
 * Running balance uses (debit - credit) * direction for normal balance display.
 */
export async function getGeneralLedger(
  accountId: string,
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<{ accountType: string; accountName: string; rows: GeneralLedgerRow[] }> {
  if (!isLocalOnlyMode()) {
    void tenantId;
    const data = await journalApi.getGeneralLedgerReport(accountId, {
      fromDate: options?.fromDate,
      toDate: options?.toDate,
    });
    return {
      accountType: data.accountType,
      accountName: data.accountName,
      rows: data.rows.map((r) => ({
        entry_date: r.entry_date,
        journal_entry_id: r.journal_entry_id,
        reference: r.reference,
        description: r.description,
        line_number: r.line_number,
        debit_amount: roundMoney(Number(r.debit_amount)),
        credit_amount: roundMoney(Number(r.credit_amount)),
        running_balance: roundMoney(Number(r.running_balance)),
        is_brought_forward: Boolean((r as { is_brought_forward?: boolean }).is_brought_forward),
      })),
    };
  }

  const bridge = getBridge();
  const acc = await bridge.query(
    `SELECT type, name, COALESCE(opening_balance, 0) AS opening_balance FROM accounts WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [accountId, tenantId]
  );
  if (!acc.ok || !acc.rows?.length) throw new Error('Account not found.');
  const accountType = String((acc.rows[0] as { type: string }).type);
  const accountName = String((acc.rows[0] as { name: string }).name);
  const openingBalance = roundMoney(Number((acc.rows[0] as { opening_balance: number }).opening_balance));
  const dir = normalBalanceDirection(accountType);

  let running = roundMoney(dir * openingBalance);

  // Prior journal activity before fromDate (brought forward)
  if (options?.fromDate) {
    const prior = await bridge.query(
      `SELECT
        COALESCE(SUM(jl.debit_amount), 0) AS gross_debit,
        COALESCE(SUM(jl.credit_amount), 0) AS gross_credit
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.account_id = ? AND je.tenant_id = ? AND je.entry_date < ?`,
      [accountId, tenantId, options.fromDate]
    );
    if (prior.ok && prior.rows?.length) {
      const gd = roundMoney(Number((prior.rows[0] as { gross_debit: number }).gross_debit));
      const gc = roundMoney(Number((prior.rows[0] as { gross_credit: number }).gross_credit));
      running = roundMoney(running + dir * (gd - gc));
    }
  }

  const rows: GeneralLedgerRow[] = [];
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

  let sql = `
    SELECT
      je.entry_date AS entry_date,
      je.id AS journal_entry_id,
      je.reference AS reference,
      je.description AS description,
      jl.line_number AS line_number,
      jl.debit_amount AS debit_amount,
      jl.credit_amount AS credit_amount
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = ? AND je.tenant_id = ?
  `;
  const params: unknown[] = [accountId, tenantId];
  if (options?.fromDate) {
    sql += ` AND je.entry_date >= ?`;
    params.push(options.fromDate);
  }
  if (options?.toDate) {
    sql += ` AND je.entry_date <= ?`;
    params.push(options.toDate);
  }
  sql += ` ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`;

  const r = await bridge.query(sql, params);
  if (!r.ok) throw new Error(r.error || 'General ledger query failed');

  for (const raw of r.rows || []) {
    const debit = roundMoney(Number((raw as Record<string, unknown>).debit_amount));
    const credit = roundMoney(Number((raw as Record<string, unknown>).credit_amount));
    const delta = dir * (debit - credit);
    running = roundMoney(running + delta);
    rows.push({
      entry_date: String((raw as Record<string, unknown>).entry_date),
      journal_entry_id: String((raw as Record<string, unknown>).journal_entry_id),
      reference: String((raw as Record<string, unknown>).reference ?? ''),
      description:
        (raw as Record<string, unknown>).description != null
          ? String((raw as Record<string, unknown>).description)
          : null,
      line_number: Number((raw as Record<string, unknown>).line_number),
      debit_amount: debit,
      credit_amount: credit,
      running_balance: running,
    });
  }

  return { accountType, accountName, rows };
}

export type AccountStatementRow = GeneralLedgerRow;

export async function getAccountStatement(
  accountId: string,
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<{ accountType: string; accountName: string; rows: AccountStatementRow[] }> {
  return getGeneralLedger(accountId, tenantId, options);
}

/** Load journal lines + entries for unified GL reporting (local SQLite). */
export async function fetchJournalLedgerInput(
  tenantId: string,
  options?: { asOfDate?: string }
): Promise<import('./journalLedgerCore').JournalLedgerInput> {
  const bridge = getBridge();
  const tenantIds = ledgerTenantIdsForLocalQuery(tenantId);
  const tenantPlaceholders = tenantIds.map(() => '?').join(', ');
  const params: unknown[] = [...tenantIds];
  let dateCond = '';
  if (options?.asOfDate) {
    dateCond = ` AND je.entry_date <= ?`;
    params.push(options.asOfDate);
  }

  const linesR = await bridge.query(
    `SELECT
      jl.journal_entry_id AS journal_entry_id,
      jl.account_id AS account_id,
      jl.debit_amount AS debit_amount,
      jl.credit_amount AS credit_amount,
      jl.line_number AS line_number,
      jl.project_id AS project_id,
      jl.building_id AS building_id,
      jl.cost_center_id AS cost_center_id
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.tenant_id IN (${tenantPlaceholders})${dateCond}
    ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`,
    params
  );
  if (!linesR.ok) throw new Error(linesR.error || 'Journal lines query failed');

  const entriesR = await bridge.query(
    `SELECT
      je.id AS id,
      je.entry_date AS entry_date,
      je.reference AS reference,
      je.description AS description,
      je.source_module AS source_module,
      je.source_id AS source_id,
      je.project_id AS project_id,
      je.building_id AS building_id,
      CASE WHEN EXISTS (
        SELECT 1 FROM journal_reversals jr WHERE jr.original_journal_entry_id = je.id
      ) THEN 1 ELSE 0 END AS is_reversed
    FROM journal_entries je
    WHERE je.tenant_id IN (${tenantPlaceholders})${dateCond}`,
    params
  );
  if (!entriesR.ok) throw new Error(entriesR.error || 'Journal entries query failed');

  return {
    journalLines: (linesR.rows || []).map((r: Record<string, unknown>) => ({
      journalEntryId: String(r.journal_entry_id),
      accountId: String(r.account_id),
      debitAmount: roundMoney(Number(r.debit_amount)),
      creditAmount: roundMoney(Number(r.credit_amount)),
      lineNumber: Number(r.line_number),
      projectId: r.project_id != null ? String(r.project_id) : null,
      buildingId: r.building_id != null ? String(r.building_id) : null,
      costCenterId: r.cost_center_id != null ? String(r.cost_center_id) : null,
    })),
    journalEntries: (entriesR.rows || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      entryDate: String(r.entry_date).slice(0, 10),
      reference: r.reference != null ? String(r.reference) : undefined,
      description: r.description != null ? String(r.description) : null,
      sourceModule: r.source_module != null ? String(r.source_module) : null,
      sourceId: r.source_id != null ? String(r.source_id) : null,
      projectId: r.project_id != null ? String(r.project_id) : null,
      buildingId: r.building_id != null ? String(r.building_id) : null,
      isReversed: Number(r.is_reversed) !== 0,
    })),
    accounts: [],
  };
}
