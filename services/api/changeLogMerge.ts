import type { AppState } from '../../types';

/** Maps Architecture v2 change_log entity_type → AppState collection key. */
export const CHANGE_LOG_ENTITY_MAP: Record<string, keyof AppState> = {
  account: 'accounts',
  vendor: 'vendors',
  contact: 'contacts',
  category: 'categories',
  project: 'projects',
  building: 'buildings',
  property: 'properties',
  unit: 'units',
  transaction: 'transactions',
  invoice: 'invoices',
  bill: 'bills',
  budget: 'budgets',
  contract: 'contracts',
  sales_return: 'salesReturns',
  rental_agreement: 'rentalAgreements',
  project_agreement: 'projectAgreements',
  installment_plan: 'installmentPlans',
  document: 'documents',
  quotation: 'quotations',
  recurring_invoice_template: 'recurringInvoiceTemplates',
};

export type ChangeLogEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  version: number;
  changedAt: string;
  changedBy?: string;
  payload?: unknown;
};

function entityVersion(item: unknown): number {
  if (!item || typeof item !== 'object') return 0;
  const v = (item as { version?: unknown }).version;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Apply Architecture v2 change_log entries onto merged incremental sync state.
 * Entries are processed in server order; LWW skips stale payloads when baseline is newer.
 */
export function applyChangeLogToMergedState(
  merged: Partial<AppState>,
  entries: ChangeLogEntry[] | undefined
): void {
  if (!entries?.length) return;

  for (const entry of entries) {
    const stateKey = CHANGE_LOG_ENTITY_MAP[entry.entityType];
    if (!stateKey) continue;

    const baselineArr = (merged[stateKey] as unknown[]) || [];
    const map = new Map<string, unknown>();
    for (const item of baselineArr) {
      const id = (item as { id?: string })?.id;
      if (id) map.set(id, item);
    }

    if (entry.action === 'delete') {
      map.delete(entry.entityId);
    } else {
      const payload = entry.payload;
      if (payload == null || typeof payload !== 'object') continue;
      const payloadId = (payload as { id?: string }).id ?? entry.entityId;
      const incomingVersion = entry.version ?? entityVersion(payload);
      const existing = map.get(payloadId);
      if (existing && incomingVersion < entityVersion(existing)) {
        continue;
      }
      map.set(payloadId, payload);
    }

    (merged as Record<string, unknown>)[stateKey] = Array.from(map.values());
  }
}
