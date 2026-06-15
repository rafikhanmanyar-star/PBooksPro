import type pg from 'pg';
import { loadReportEngine } from '../../../reportEngines/loadReportEngine.js';
import { loadBalanceSheetStateInput } from '../../accounting/services/balanceSheetReportService.js';
import { listContacts, rowToContactApi } from '../../crm/services/contactsService.js';

type ClientLedgerSelection =
  | { kind: 'all' }
  | { kind: 'owner'; ownerId: string }
  | { kind: 'unit'; unitId: string };

type ClientLedgerEngineModule = {
  computeClientLedgerReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => {
    rows: unknown[];
    agreementSummaries: unknown[];
    totals: { debit: number; credit: number };
    closingBalance: number;
  };
};

async function loadClientLedgerEngine(): Promise<ClientLedgerEngineModule> {
  return loadReportEngine<ClientLedgerEngineModule>('clientLedger');
}

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

export async function loadClientLedgerStateInput(
  client: pg.PoolClient,
  tenantId: string,
  endDate: string
) {
  const [base, contactRows] = await Promise.all([
    loadBalanceSheetStateInput(client, tenantId, endDate),
    listContacts(client, tenantId),
  ]);
  const contacts = contactRows.map((r) => asRecord(rowToContactApi(r)));
  return { ...base, contacts };
}

function parseSelection(
  selectionKind: string,
  ownerId?: string,
  unitId?: string
): ClientLedgerSelection {
  if (selectionKind === 'owner' && ownerId) return { kind: 'owner', ownerId };
  if (selectionKind === 'unit' && unitId) return { kind: 'unit', unitId };
  return { kind: 'all' };
}

export async function getClientLedgerReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    selectionKind?: string;
    ownerId?: string;
    unitId?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const state = await loadClientLedgerStateInput(client, tenantId, filters.endDate);
  const { computeClientLedgerReport } = await loadClientLedgerEngine();
  const selection = parseSelection(
    filters.selectionKind ?? 'all',
    filters.ownerId,
    filters.unitId
  );

  const result = computeClientLedgerReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selection,
    sortKey: filters.sortKey,
    sortDirection: filters.sortDirection,
  });

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectionKind: selection.kind,
    ownerId: selection.kind === 'owner' ? selection.ownerId : undefined,
    unitId: selection.kind === 'unit' ? selection.unitId : undefined,
    rows: result.rows,
    agreementSummaries: result.agreementSummaries,
    totals: result.totals,
    closingBalance: result.closingBalance,
  };
}
