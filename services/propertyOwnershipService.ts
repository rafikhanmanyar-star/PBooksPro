/**
 * Single-owner model: attribution uses `properties.owner_id`, invoice/agreement context, and optional `transactions.owner_id`.
 */

import { ContactType, type AppState, type Transaction } from '../types';
import { toLocalDateString } from '../utils/dateUtils';

/** Kept for share validation callers; co-ownership tables were removed. */
export const OWNERSHIP_TOTAL_EPS = 0.01;

/** Co-ownership UI row (`percentage` as typed string). */
export type CoOwnerFormRow = { ownerId: string; percentage: string };

/** Calendar add for YYYY-MM-DD strings (local). */
export function addCalendarDaysYyyyMmDd(dateStr: string, deltaDays: number): string {
  const s = dateStr.slice(0, 10);
  const [y, m, day] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, day);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateString(dt);
}

/** Active ownership shares: always single 100% row from current property owner. */
export function getOwnershipSharesForPropertyOnDate(
  state: Pick<AppState, 'properties'>,
  propertyId: string,
  _dateYyyyMmDd: string
): { ownerId: string; percentage: number }[] {
  const prop = state.properties.find((p) => String(p.id) === String(propertyId));
  if (!prop?.ownerId) return [];
  return [{ ownerId: prop.ownerId, percentage: 100 }];
}

/** Properties assigned to this owner (current `properties.owner_id` only). */
export function getPropertyIdsForOwner(
  state: Pick<AppState, 'properties'>,
  ownerId: string,
  buildingId?: string
): Set<string> {
  const out = new Set<string>();
  for (const p of state.properties) {
    if (buildingId && p.buildingId !== buildingId) continue;
    if (p.ownerId === ownerId) out.add(String(p.id));
  }
  return out;
}

export function resolveOwnerForPropertyOnDate(
  state: Pick<AppState, 'properties'>,
  propertyId: string,
  _dateYyyyMmDd: string
): string | undefined {
  const prop = state.properties.find((p) => String(p.id) === String(propertyId));
  return prop?.ownerId;
}

export function resolveOwnerForTransaction(
  state: Pick<AppState, 'properties' | 'invoices' | 'rentalAgreements'>,
  tx: Pick<Transaction, 'ownerId' | 'propertyId' | 'invoiceId' | 'date'>
): string | undefined {
  if (tx.ownerId) return tx.ownerId;
  if (!tx.propertyId) return undefined;

  if (tx.invoiceId) {
    const inv = state.invoices?.find((i) => i.id === tx.invoiceId);
    if (inv?.agreementId) {
      const agr = state.rentalAgreements?.find((a) => a.id === inv.agreementId);
      if (agr?.ownerId) return agr.ownerId;
    }
    if (inv?.issueDate) {
      const resolved = resolveOwnerForPropertyOnDate(state, tx.propertyId, inv.issueDate.slice(0, 10));
      if (resolved) return resolved;
    }
  }

  const d = (tx.date || '').slice(0, 10);
  if (!d) return undefined;
  return resolveOwnerForPropertyOnDate(state, tx.propertyId, d);
}

export function getAllHistoricalOwnerIds(state: Pick<AppState, 'properties'>, propertyId: string): Set<string> {
  const pid = String(propertyId);
  const owners = new Set<string>();
  const prop = state.properties.find((p) => String(p.id) === pid);
  if (prop?.ownerId) owners.add(prop.ownerId);
  return owners;
}

export function getLedgerOwnerIdsForProperty(
  state: Pick<AppState, 'properties' | 'rentalAgreements' | 'transactions' | 'invoices'>,
  propertyId: string
): Set<string> {
  const ids = getAllHistoricalOwnerIds(state, propertyId);
  const pid = String(propertyId);
  for (const ra of state.rentalAgreements || []) {
    if (String(ra.propertyId) === pid && ra.ownerId) ids.add(ra.ownerId);
  }
  for (const tx of state.transactions || []) {
    if (tx.propertyId && String(tx.propertyId) === pid && tx.ownerId) ids.add(tx.ownerId);
  }
  const agreementOwnerById = new Map<string, string>();
  for (const a of state.rentalAgreements || []) {
    if (a?.id && a.ownerId) agreementOwnerById.set(String(a.id), a.ownerId);
  }
  for (const inv of state.invoices || []) {
    if (!inv.propertyId || String(inv.propertyId) !== pid || !inv.agreementId) continue;
    const ow = agreementOwnerById.get(String(inv.agreementId));
    if (ow) ids.add(ow);
  }
  return ids;
}

export function buildLedgerOwnerIdsByPropertyId(
  state: Pick<AppState, 'properties' | 'rentalAgreements' | 'transactions' | 'invoices'>
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const ensure = (propertyId: string): Set<string> => {
    const pid = String(propertyId);
    let s = map.get(pid);
    if (!s) {
      s = getAllHistoricalOwnerIds(state, pid);
      map.set(pid, s);
    }
    return s;
  };

  for (const prop of state.properties || []) {
    ensure(String(prop.id));
  }

  const agreementOwnerById = new Map<string, string>();
  for (const a of state.rentalAgreements || []) {
    if (a?.id && a.ownerId) agreementOwnerById.set(String(a.id), a.ownerId);
  }

  for (const ra of state.rentalAgreements || []) {
    if (ra.propertyId && ra.ownerId) ensure(String(ra.propertyId)).add(ra.ownerId);
  }
  for (const tx of state.transactions || []) {
    if (tx.propertyId && tx.ownerId) ensure(String(tx.propertyId)).add(tx.ownerId);
  }
  for (const inv of state.invoices || []) {
    if (!inv.propertyId || !inv.agreementId) continue;
    const ow = agreementOwnerById.get(String(inv.agreementId));
    if (ow) ensure(String(inv.propertyId)).add(ow);
  }

  return map;
}

export function getPayoutOwnerIdsForProperty(
  state: Pick<AppState, 'properties' | 'rentalAgreements' | 'transactions' | 'invoices'>,
  propertyId: string,
  asOfDateYyyyMmDd?: string
): Set<string> {
  const ids = getLedgerOwnerIdsForProperty(state, propertyId);
  const d = (asOfDateYyyyMmDd ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  getOwnershipSharesForPropertyOnDate(state, propertyId, d).forEach((s) => ids.add(s.ownerId));
  return ids;
}

export function hasMultipleOwnersOnDate(
  _state: Pick<AppState, 'properties'>,
  _propertyId: string,
  _dateYyyyMmDd: string
): boolean {
  return false;
}

export function getOwnerSharePercentageOnDate(
  state: Pick<AppState, 'properties'>,
  propertyId: string,
  ownerId: string,
  dateYyyyMmDd: string
): number {
  const shares = getOwnershipSharesForPropertyOnDate(state, propertyId, dateYyyyMmDd);
  const match = shares.find((s) => s.ownerId === ownerId);
  return match ? match.percentage : 0;
}

export function primaryOwnerIdFromShares(shares: { ownerId: string; percentage: number }[]): string | undefined {
  if (shares.length === 0) return undefined;
  const sorted = [...shares].sort((a, b) =>
    b.percentage !== a.percentage ? b.percentage - a.percentage : a.ownerId.localeCompare(b.ownerId)
  );
  return sorted[0].ownerId;
}

export function validateOwnershipSharesTotal(shares: { ownerId: string; percentage: number }[]): string | null {
  const sum = shares.reduce((s, x) => s + (Number(x.percentage) || 0), 0);
  if (Math.abs(sum - 100) > OWNERSHIP_TOTAL_EPS)
    return `Ownership percentages must total 100% (currently ${sum.toFixed(2)}%).`;
  const seen = new Set<string>();
  for (const s of shares) {
    if (!s.ownerId) return 'Each owner is required.';
    if (seen.has(s.ownerId)) return 'Duplicate owners are not allowed.';
    seen.add(s.ownerId);
    if ((Number(s.percentage) || 0) <= 0) return 'Each ownership percentage must be positive.';
  }
  return null;
}

function formatCoOwnerPercentOut(n: number): string {
  const x = Math.round(n * 100) / 100;
  return String(x);
}

export function redistributeCoOwnerPercentages(
  rows: CoOwnerFormRow[],
  editedIndex: number,
  rawInput: string
): CoOwnerFormRow[] {
  const out = rows.map((r) => ({ ...r }));
  if (editedIndex < 0 || editedIndex >= out.length) return out;

  const trimmed = rawInput.trim();
  if (trimmed === '') {
    out[editedIndex] = { ...out[editedIndex], percentage: '' };
    return out;
  }

  let v = parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(v)) v = 0;
  v = Math.max(0, Math.min(100, v));

  const otherWithOwner: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (i === editedIndex) continue;
    if (out[i].ownerId.trim() !== '') otherWithOwner.push(i);
  }

  out[editedIndex] = { ...out[editedIndex], percentage: formatCoOwnerPercentOut(v) };

  if (otherWithOwner.length === 0) {
    return out;
  }

  const remCents = Math.round((100 - v) * 100);
  const n = otherWithOwner.length;
  const base = Math.floor(remCents / n);
  const extra = remCents % n;
  for (let k = 0; k < n; k++) {
    const cents = base + (k < extra ? 1 : 0);
    const p = cents / 100;
    const idx = otherWithOwner[k];
    out[idx] = { ...out[idx], percentage: formatCoOwnerPercentOut(p) };
  }

  return out;
}

export function isFormerOwner(
  state: Pick<AppState, 'properties' | 'rentalAgreements' | 'transactions' | 'invoices'>,
  ownerId: string,
  propertyId?: string
): boolean {
  const props = propertyId ? state.properties.filter((p) => String(p.id) === String(propertyId)) : state.properties;
  let anySeen = false;
  for (const prop of props) {
    if (prop.ownerId === ownerId) return false;
    if (getLedgerOwnerIdsForProperty(state, prop.id).has(ownerId)) anySeen = true;
  }
  return anySeen;
}

export function getPropertyExpenseAllocatedAmountForOwner(
  state: Pick<AppState, 'properties' | 'invoices' | 'rentalAgreements' | 'contacts'>,
  tx: Pick<Transaction, 'propertyId' | 'date' | 'contactId' | 'ownerId' | 'invoiceId' | 'categoryId'>,
  rawAmount: number,
  forOwnerId: string
): number {
  if (!tx.propertyId || rawAmount <= 0 || !Number.isFinite(rawAmount)) return 0;
  if (tx.contactId) {
    const contact = state.contacts?.find((c) => c.id === tx.contactId);
    if (contact?.type === ContactType.TENANT) return 0;
  }
  const ownerIdForTx = resolveOwnerForTransaction(state, tx as Transaction);
  return ownerIdForTx === forOwnerId ? rawAmount : 0;
}

export function getBrokerFeeAllocatedAmountForOwner(
  state: Pick<AppState, 'properties'>,
  ra: {
    propertyId?: string;
    startDate?: string;
    brokerFee?: number | string;
    ownerId?: string;
    previousAgreementId?: string | null;
    brokerId?: string;
  },
  forOwnerId: string
): number {
  if (ra.previousAgreementId) return 0;
  if (!ra.brokerId || !ra.propertyId) return 0;
  const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
  if (isNaN(fee) || fee <= 0) return 0;

  const raDateStr = (ra.startDate || '').slice(0, 10);
  const prop = state.properties.find((p) => p.id === ra.propertyId);
  const pid = String(ra.propertyId);

  const raOwnerId =
    ra.ownerId ?? (raDateStr ? resolveOwnerForPropertyOnDate(state, pid, raDateStr) : prop?.ownerId);
  return raOwnerId === forOwnerId ? fee : 0;
}

export function getBillCostAllocatedAmountForOwner(
  state: Pick<AppState, 'properties'>,
  bill: { propertyId?: string; issueDate?: string; amount?: number | string; projectId?: string | null },
  forOwnerId: string
): number {
  if (!bill.propertyId || bill.projectId) return 0;
  const amount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
  if (isNaN(amount) || amount <= 0) return 0;

  const billDateStr = (bill.issueDate || '').slice(0, 10);
  const prop = state.properties.find((p) => p.id === bill.propertyId);
  const pid = String(bill.propertyId);

  const billOwnerId = billDateStr ? resolveOwnerForPropertyOnDate(state, pid, billDateStr) : prop?.ownerId;
  return billOwnerId === forOwnerId ? amount : 0;
}
