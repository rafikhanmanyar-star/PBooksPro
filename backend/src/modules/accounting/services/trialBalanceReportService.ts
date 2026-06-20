import type pg from 'pg';

import { roundMoney } from '../../../financial/validation.js';

import {

  applyOpeningBalances,

  buildTrialBalanceReport,

  compareTrialBalanceType,

  isDimensionScopeActive,

  mergeRawRowsByAccount,

  scopeFromReportFilters,

  shouldApplyOpeningBalancesForScope,

  type AccountOpeningInput,

  type FinancialDimensionScope,

  type TrialBalanceBasis,

  type TrialBalanceRawRow,

  type TrialBalanceReportPayload,

} from '../../../financial/trialBalanceCore.js';

import { JournalRepository } from '../repositories/JournalRepository.js';

import { AccountRepository } from '../repositories/AccountRepository.js';



export type { TrialBalanceBasis, TrialBalanceReportPayload, FinancialDimensionScope };



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



export type TrialBalanceReportOptions = {

  from: string;

  to: string;

  basis: TrialBalanceBasis;

  scope?: FinancialDimensionScope;

  scopeCtx?: import('../../../auth/tenantRepositoryScope.js').DataScopeEnforcementContext;

};



export type TrialBalanceReportResponse = TrialBalanceReportPayload & {

  from: string;

  to: string;

  basis: TrialBalanceBasis;

  scope: FinancialDimensionScope;

  diagnostics: TrialBalanceDimensionDiagnostics;

};



function mapPgRow(row: Record<string, unknown>): TrialBalanceRawRow {

  return {

    accountId: String(row.account_id),

    accountName: String(row.account_name),

    accountType: String(row.account_type),

    parentAccountId: row.parent_account_id != null ? String(row.parent_account_id) : null,

    accountCode: row.account_code != null ? String(row.account_code) : null,

    subType: row.sub_type != null ? String(row.sub_type) : null,

    isActive: row.is_active === null || row.is_active === undefined ? true : Boolean(row.is_active),

    grossDebit: roundMoney(Number(row.gross_debit)),

    grossCredit: roundMoney(Number(row.gross_credit)),

  };

}



function activeScope(scope: FinancialDimensionScope): FinancialDimensionScope | undefined {

  return isDimensionScopeActive(scope) ? scope : undefined;

}



/**

 * Double-entry trial balance from journal_lines + journal_entries + accounts.

 * - period: opening balances + prior journal activity (before from) + activity in [from, to]

 * - cumulative: opening balances + all journal lines with entry_date <= to

 * Scoped reports skip tenant opening balances (same as balance sheet / P&amp;L).

 */

export async function fetchTrialBalanceRawRows(

  client: pg.PoolClient,

  tenantId: string,

  options: TrialBalanceReportOptions

): Promise<TrialBalanceRawRow[]> {

  const scope = options.scope ?? scopeFromReportFilters();

  const journalRepo = new JournalRepository(tenantId);

  const sqlScope = activeScope(scope);



  const periodRows = (

    await journalRepo.aggregateTrialBalanceRows(client, {

      from: options.from,

      to: options.to,

      basis: options.basis,

      scope: sqlScope,

      rbacScopeCtx: options.scopeCtx,

    })

  ).map((r) => mapPgRow(r as unknown as Record<string, unknown>));



  let activityRows = periodRows;

  if (options.basis === 'period') {

    const priorRows = (

      await journalRepo.aggregateTrialBalanceRows(client, {

        from: '1900-01-01',

        to: options.from,

        basis: 'cumulative',

        priorOnly: true,

        priorBefore: options.from,

        scope: sqlScope,

        rbacScopeCtx: options.scopeCtx,

      })

    ).map((r) => mapPgRow(r as unknown as Record<string, unknown>));

    activityRows = mergeRawRowsByAccount([...priorRows, ...periodRows]);

  }



  let rows = activityRows;

  if (shouldApplyOpeningBalancesForScope(scope)) {

    const openings = await fetchAccountOpeningInputs(client, tenantId);

    rows = applyOpeningBalances(activityRows, openings);

  }



  rows.sort((x, y) => {

    const c = compareTrialBalanceType(x.accountType, y.accountType);

    if (c !== 0) return c;

    const cx = (x.accountCode || '').localeCompare(y.accountCode || '');

    if (cx !== 0) return cx;

    return x.accountName.localeCompare(y.accountName);

  });

  return rows;

}



async function fetchAccountOpeningInputs(

  client: pg.PoolClient,

  tenantId: string

): Promise<AccountOpeningInput[]> {

  const rows = await new AccountRepository(tenantId).listOpeningBalanceInputs(client);

  return rows.map((row) => ({

    accountId: row.account_id,

    accountName: row.account_name,

    accountType: row.account_type,

    parentAccountId: row.parent_account_id,

    accountCode: row.account_code,

    subType: row.sub_type,

    isActive: row.is_active,

    openingBalance: roundMoney(row.opening_balance),

  }));

}



export async function getTrialBalanceReportPayload(

  client: pg.PoolClient,

  tenantId: string,

  options: TrialBalanceReportOptions

): Promise<TrialBalanceReportResponse> {

  const scope = options.scope ?? scopeFromReportFilters();

  const journalRepo = new JournalRepository(tenantId);

  const [raw, diagnostics] = await Promise.all([

    fetchTrialBalanceRawRows(client, tenantId, { ...options, scope }),

    journalRepo.fetchTrialBalanceDimensionDiagnostics(client, {

      from: options.from,

      to: options.to,

    }),

  ]);

  const report = buildTrialBalanceReport(raw);

  return {

    ...report,

    from: options.from,

    to: options.to,

    basis: options.basis,

    scope,

    diagnostics,

  };

}



/** Parse optional dimension id from API query (omit or `all` = consolidated). */

export function parseTrialBalanceDimensionParam(raw: unknown): string | undefined {

  if (typeof raw !== 'string') return undefined;

  const t = raw.trim();

  if (!t || t.toLowerCase() === 'all') return undefined;

  return t;

}

