/**
 * Percentage-based property co-ownership: resolution, transfer, and cache.
 */

import { ContactType, type AppState, type Property, type PropertyOwnership, type PropertyOwnershipHistory, type Transaction } from '../types';
import { getOwnerIdForPropertyOnDate } from './ownershipHistoryUtils';
import { toLocalDateString } from '../utils/dateUtils';

/** Total ownership must equal 100% within this tolerance (aligned with co-owner UI and API). */
export const OWNERSHIP_TOTAL_EPS = 0.01;

/** Session cache: propertyId → last resolved shares signature (avoid repeated scans in tight loops). */
const ownershipSharesCache = new Map<string, { sig: string; shares: { ownerId: string; percentage: number }[] }>();

export function invalidatePropertyOwnershipCache(propertyId?: string): void {
  if (propertyId) ownershipSharesCache.delete(propertyId);
  else ownershipSharesCache.clear();
}

function ymdParts(d: string): [number, number, number] {
  const s = d.slice(0, 10);
  const [y, m, day] = s.split('-').map((x) => parseInt(x, 10));
  return [y, m, day];
}

/** Calendar add for YYYY-MM-DD strings (local). */
export function addCalendarDaysYyyyMmDd(dateStr: string, deltaDays: number): string {
  const [y, m, d] = ymdParts(dateStr);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateString(dt);
}

function rowEffectiveOnDate(row: PropertyOwnership, dateYyyyMmDd: string): boolean {
  const d = dateYyyyMmDd.slice(0, 10);
  if (row.deletedAt) return false;
  if (row.startDate > d) return false;
  if (row.endDate != null && row.endDate !== '' && row.endDate < d) return false;
  return true;
}

/**
 * Active ownership shares for a property on a calendar date (sum should be 100 for configured properties).
 * Falls back to legacy single owner when `propertyOwnership` has no rows for this property.
 *
 * Precedence when unit-level ownership exists in the future: resolve unit-scoped splits first when a
 * `unitId` applies (e.g. invoice or charge line); if no unit splits exist, use these property-level
 * `propertyOwnership` rows; if still empty, fall back to `propertyOwnershipHistory` and `property.ownerId`.
 */
export function getOwnershipSharesForPropertyOnDate(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory'>,
  propertyId: string,
  dateYyyyMmDd: string
): { ownerId: string; percentage: number }[] {
  const d = dateYyyyMmDd.slice(0, 10);
  const pid = String(propertyId);
  let rows = (state.propertyOwnership || []).filter(
    (r) => String(r.propertyId) === pid && rowEffectiveOnDate(r, d)
  );
  // Same calendar day as a replacement: closed slice may share start/end with new active rows — prefer current active rows only.
  if (rows.some((r) => r.isActive)) {
    rows = rows.filter((r) => r.isActive);
  }
  if (rows.length > 0) {
    const sig = `${d}|${rows.map((r) => `${r.id}:${r.ownershipPercentage}`).sort().join(',')}`;
    const hit = ownershipSharesCache.get(pid);
    if (hit && hit.sig === sig) return hit.shares.map((s) => ({ ...s }));

    const shares = rows.map((r) => ({
      ownerId: r.ownerId,
      percentage: Number(r.ownershipPercentage) || 0,
    }));
    ownershipSharesCache.set(pid, { sig, shares: shares.map((s) => ({ ...s })) });
    return shares;
  }

  const prop = state.properties.find((p) => String(p.id) === pid);
  const legacyOwner =
    getOwnerIdForPropertyOnDate(pid, d, state.propertyOwnershipHistory || [], prop?.ownerId) || prop?.ownerId;
  if (!legacyOwner) return [];
  return [{ ownerId: legacyOwner, percentage: 100 }];
}

/** Primary display owner: highest %, then lexicographic owner id. */
/** Properties where this owner is primary OR has a co-ownership row (including closed/historical rows). */
export function getPropertyIdsForOwner(
  state: Pick<AppState, 'properties' | 'propertyOwnership'>,
  ownerId: string,
  buildingId?: string
): Set<string> {
  // Include ALL ownership rows (active + closed) so transferred-away properties still appear for old owners.
  const stake = new Set(
    (state.propertyOwnership || [])
      .filter((r) => r.ownerId === ownerId && !r.deletedAt)
      .map((r) => String(r.propertyId))
  );
  const out = new Set<string>();
  for (const p of state.properties) {
    if (buildingId && p.buildingId !== buildingId) continue;
    if (p.ownerId === ownerId || stake.has(String(p.id))) out.add(String(p.id));
  }
  return out;
}

/**
 * Resolve the owner of a property on a given date, using propertyOwnership rows
 * (co-ownership with date ranges) then falling back to propertyOwnershipHistory,
 * then to the current property.ownerId.
 */
export function resolveOwnerForPropertyOnDate(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory'>,
  propertyId: string,
  dateYyyyMmDd: string
): string | undefined {
  const shares = getOwnershipSharesForPropertyOnDate(state, propertyId, dateYyyyMmDd);
  if (shares.length > 0) return primaryOwnerIdFromShares(shares);
  const prop = state.properties.find((p) => String(p.id) === String(propertyId));
  return prop?.ownerId;
}

/**
 * Resolve the owner for a transaction, using invoice/agreement context when
 * available so that pre-transfer rental income stays attributed to the old owner.
 *
 * Priority:
 *   1. tx.ownerId if already stamped.
 *   2. Agreement owner (invoice → agreement → ownerId).
 *   3. property_ownership lookup using invoice issue date.
 *   4. property_ownership lookup using transaction date.
 *   5. property.ownerId fallback.
 */
export function resolveOwnerForTransaction(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory' | 'invoices' | 'rentalAgreements'>,
  tx: Pick<Transaction, 'ownerId' | 'propertyId' | 'invoiceId' | 'date'>
): string | undefined {
  if (tx.ownerId) return tx.ownerId;
  if (!tx.propertyId) return undefined;

  if (tx.invoiceId) {
    const inv = state.invoices?.find(i => i.id === tx.invoiceId);
    if (inv?.agreementId) {
      const agr = state.rentalAgreements?.find(a => a.id === inv.agreementId);
      if (agr?.ownerId) return agr.ownerId;
    }
    if (inv?.issueDate) {
      const invDate = inv.issueDate.slice(0, 10);
      const resolved = resolveOwnerForPropertyOnDate(state, tx.propertyId, invDate);
      if (resolved) return resolved;
    }
  }

  const d = (tx.date || '').slice(0, 10);
  if (!d) return undefined;
  return resolveOwnerForPropertyOnDate(state, tx.propertyId, d);
}

/**
 * Returns the set of all owner IDs that have ever owned a given property
 * (current owner + any owner from closed propertyOwnership rows).
 */
export function getAllHistoricalOwnerIds(
  state: Pick<AppState, 'properties' | 'propertyOwnership'>,
  propertyId: string
): Set<string> {
  const pid = String(propertyId);
  const owners = new Set<string>();
  const prop = state.properties.find((p) => String(p.id) === pid);
  if (prop?.ownerId) owners.add(prop.ownerId);
  (state.propertyOwnership || []).forEach((r) => {
    if (String(r.propertyId) === pid && !r.deletedAt) owners.add(r.ownerId);
  });
  return owners;
}

/**
 * All owner contacts that should appear under a property in portfolio / owner ledgers:
 * {@link getAllHistoricalOwnerIds} plus owners found on rental agreements, stamped
 * `transactions.owner_id`, and invoice-linked agreements (covers transfers where closed
 * `property_ownership` rows no longer list the former owner).
 */
export function getLedgerOwnerIdsForProperty(
  state: Pick<
    AppState,
    'properties' | 'propertyOwnership' | 'rentalAgreements' | 'transactions' | 'invoices'
  >,
  propertyId: string
): Set<string> {
  const ids = getAllHistoricalOwnerIds(state, propertyId);
  const pid = String(propertyId);
  (state.rentalAgreements || []).forEach((ra) => {
    if (String(ra.propertyId) === pid && ra.ownerId) ids.add(ra.ownerId);
  });
  (state.transactions || []).forEach((tx) => {
    if (tx.propertyId && String(tx.propertyId) === pid && tx.ownerId) ids.add(tx.ownerId);
  });
  (state.invoices || []).forEach((inv) => {
    if (inv.propertyId && String(inv.propertyId) === pid && inv.agreementId) {
      const agr = state.rentalAgreements?.find((a) => a.id === inv.agreementId);
      if (agr?.ownerId) ids.add(agr.ownerId);
    }
  });
  return ids;
}

/**
 * Owners to iterate for per-unit rental payout breakdown: {@link getLedgerOwnerIdsForProperty}
 * plus anyone with an active ownership share on the given date (e.g. 50/50 co-owners on
 * `property_ownership` even when former-only rows were not merged into historical ids).
 */
export function getPayoutOwnerIdsForProperty(
  state: Pick<
    AppState,
    'properties' | 'propertyOwnership' | 'propertyOwnershipHistory' | 'rentalAgreements' | 'transactions' | 'invoices'
  >,
  propertyId: string,
  asOfDateYyyyMmDd?: string
): Set<string> {
  const ids = getLedgerOwnerIdsForProperty(state, propertyId);
  const d = (asOfDateYyyyMmDd ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  getOwnershipSharesForPropertyOnDate(state, propertyId, d).forEach((s) => ids.add(s.ownerId));
  return ids;
}

export function hasMultipleOwnersOnDate(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory'>,
  propertyId: string,
  dateYyyyMmDd: string
): boolean {
  return getOwnershipSharesForPropertyOnDate(state, propertyId, dateYyyyMmDd).length > 1;
}

/**
 * Returns the ownership percentage for a specific owner on a given date.
 * Used to compute an owner's share of a gross rent transaction when no explicit
 * "Owner Rental Income Share" split lines exist (legacy / pre-co-ownership data).
 * Returns 100 when the owner is the sole owner; 0 when the owner has no stake.
 */
export function getOwnerSharePercentageOnDate(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory'>,
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

/** Co-ownership UI row (`percentage` as typed string). */
export type CoOwnerFormRow = { ownerId: string; percentage: string };

function formatCoOwnerPercentOut(n: number): string {
  const x = Math.round(n * 100) / 100;
  return String(x);
}

/**
 * When the user edits one row's %: clamp that value to 0–100 and split the remainder equally across
 * **other** rows that already have an owner selected (so totals stay at 100% when possible).
 * Empty input clears that row's % without redistributing.
 */
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

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function buildDefaultPropertyOwnershipRow(
  property: Property,
  tenantId: string,
  opts?: { startDate?: string }
): PropertyOwnership {
  const now = new Date().toISOString();
  return {
    id: `po-${property.id}-${newId()}`,
    tenantId: tenantId || '',
    propertyId: property.id,
    ownerId: property.ownerId,
    ownershipPercentage: 100,
    startDate: opts?.startDate ?? '2000-01-01',
    endDate: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export interface TransferOwnershipInput {
  propertyId: string;
  transferDate: string;
  /** Each owner id and percentage; must sum to 100. */
  newOwners: { ownerId: string; percentage: number }[];
  /** Stored as `transferDocument` on each new `propertyOwnership` row. */
  transferReference?: string;
  notes?: string;
  tenantId: string;
}

/**
 * Pure state transform: closes active `propertyOwnership` rows, inserts new active rows, updates primary `property.ownerId`,
 * and keeps `propertyOwnershipHistory` in sync for legacy UI (single-owner timeline).
 */
export function applyOwnershipTransferToState(state: AppState, input: TransferOwnershipInput): AppState {
  const err = validateOwnershipSharesTotal(input.newOwners);
  if (err) throw new Error(err);

  const pid = String(input.propertyId);
  const property = state.properties.find((p) => String(p.id) === pid);
  if (!property) throw new Error('Property not found.');

  const transferDay = input.transferDate.slice(0, 10);
  const now = new Date().toISOString();

  const forProperty = (state.propertyOwnership || []).filter((r) => String(r.propertyId) === pid);
  const otherPropsRows = (state.propertyOwnership || []).filter((r) => String(r.propertyId) !== pid);

  const closedPrev = forProperty.map((r) => {
    const stillOpen = r.isActive && (r.endDate == null || String(r.endDate).trim() === '');
    if (stillOpen) {
      return { ...r, endDate: transferDay, isActive: false, updatedAt: now };
    }
    return { ...r };
  });

  const doc = input.transferReference?.trim() || undefined;
  const segNotes = input.notes?.trim() || undefined;
  const newRows: PropertyOwnership[] = input.newOwners.map((o) => ({
    id: `po-${input.propertyId}-${o.ownerId}-${newId()}`,
    tenantId: input.tenantId || '',
    propertyId: input.propertyId,
    ownerId: o.ownerId,
    ownershipPercentage: Number(o.percentage),
    startDate: transferDay,
    endDate: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...(doc ? { transferDocument: doc } : {}),
    ...(segNotes ? { notes: segNotes } : {}),
  }));

  const primary = primaryOwnerIdFromShares(
    newRows.map((r) => ({ ownerId: r.ownerId, percentage: r.ownershipPercentage }))
  )!;

  const updatedProperty: Property = { ...property, ownerId: primary };

  const properties = state.properties.map((p) => (String(p.id) === pid ? updatedProperty : p));

  // Legacy history: close open-ended row; append new open row for primary timeline (existing screens).
  let propertyOwnershipHistory = state.propertyOwnershipHistory || [];
  const openHist = propertyOwnershipHistory.filter(
    (h) => String(h.propertyId) === pid && h.ownershipEndDate == null
  );
  if (openHist.length > 0) {
    propertyOwnershipHistory = propertyOwnershipHistory.map((h) =>
      String(h.propertyId) === pid && h.ownershipEndDate == null
        ? {
            ...h,
            ownershipEndDate: transferDay,
            updatedAt: now,
          }
        : h
    );
  }
  const histRow: PropertyOwnershipHistory = {
    id: `poh-${newId()}`,
    tenantId: input.tenantId || '',
    propertyId: input.propertyId,
    ownerId: primary,
    ownershipStartDate: transferDay,
    ownershipEndDate: null,
    transferReference: input.transferReference,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  propertyOwnershipHistory = [...propertyOwnershipHistory, histRow];

  invalidatePropertyOwnershipCache(pid);

  return {
    ...state,
    properties,
    propertyOwnership: [...otherPropsRows, ...closedPrev, ...newRows],
    propertyOwnershipHistory,
  };
}

/**
 * True when the owner has no active/current ownership for the given property (or any property if
 * propertyId is omitted). Used to show "Former Owner" labels in the UI.
 */
export function isFormerOwner(
  state: Pick<AppState, 'properties' | 'propertyOwnership'>,
  ownerId: string,
  propertyId?: string
): boolean {
  const candidates = propertyId
    ? state.properties.filter((p) => String(p.id) === String(propertyId))
    : state.properties;
  for (const prop of candidates) {
    if (prop.ownerId === ownerId) return false;
    const activeRows = (state.propertyOwnership || []).filter(
      (r) =>
        String(r.propertyId) === String(prop.id) &&
        r.ownerId === ownerId &&
        r.isActive &&
        !r.deletedAt
    );
    if (activeRows.length > 0) return false;
  }
  return true;
}

/**
 * For properties that have no `property_ownership` rows yet, build a default 100% row
 * from `property.ownerId` so the ownership system treats them consistently.
 */
export function ensureOwnershipRowsExist(state: AppState, tenantId: string): PropertyOwnership[] {
  const newRows: PropertyOwnership[] = [];
  for (const prop of state.properties) {
    const hasRows = (state.propertyOwnership || []).some(
      (r) => String(r.propertyId) === String(prop.id) && !r.deletedAt
    );
    if (!hasRows && prop.ownerId) {
      newRows.push(buildDefaultPropertyOwnershipRow(prop, tenantId));
    }
  }
  return newRows;
}

/**
 * Single-new-owner transfer (compat with existing PropertyTransferModal): 100% to `newOwnerId`.
 */
export function applyLegacySingleOwnerTransfer(
  state: AppState,
  args: {
    propertyId: string;
    newOwnerId: string;
    transferDate: string;
    transferReference?: string;
    notes?: string;
    tenantId: string;
  }
): AppState {
  return applyOwnershipTransferToState(state, {
    propertyId: args.propertyId,
    transferDate: args.transferDate,
    newOwners: [{ ownerId: args.newOwnerId, percentage: 100 }],
    transferReference: args.transferReference,
    notes: args.notes,
    tenantId: args.tenantId,
  });
}

// --- Owner ledger / payout allocations (match OwnerLedger.tsx co-owner rules) ---

/**
 * Part of a property expense allocated to one owner: proportional share when co-owners exist on tx date,
 * else full amount only for the resolved single owner (0 for others).
 * Skips amounts tied to tenant contacts (same as Owner Ledger expense filter).
 */
export function getPropertyExpenseAllocatedAmountForOwner(
  state: Pick<
    AppState,
    'properties' | 'propertyOwnership' | 'propertyOwnershipHistory' | 'invoices' | 'rentalAgreements' | 'contacts'
  >,
  tx: Pick<Transaction, 'propertyId' | 'date' | 'contactId' | 'ownerId' | 'invoiceId' | 'categoryId'>,
  rawAmount: number,
  forOwnerId: string
): number {
  if (!tx.propertyId || rawAmount <= 0 || !Number.isFinite(rawAmount)) return 0;
  if (tx.contactId) {
    const contact = state.contacts?.find((c) => c.id === tx.contactId);
    if (contact?.type === ContactType.TENANT) return 0;
  }
  const pid = String(tx.propertyId);
  const d = (tx.date || '').slice(0, 10);
  if (!d) return 0;

  if (hasMultipleOwnersOnDate(state, pid, d)) {
    const pct = getOwnerSharePercentageOnDate(state, pid, forOwnerId, d);
    if (pct <= 0) return 0;
    return Math.round(rawAmount * pct) / 100;
  }
  const ownerIdForTx = resolveOwnerForTransaction(state, tx as Transaction);
  return ownerIdForTx === forOwnerId ? rawAmount : 0;
}

/**
 * Broker fee from a rental agreement allocated to one co-owner by ownership % on agreement start date.
 */
export function getBrokerFeeAllocatedAmountForOwner(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory'>,
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

  if (raDateStr && hasMultipleOwnersOnDate(state, pid, raDateStr)) {
    const pct = getOwnerSharePercentageOnDate(state, pid, forOwnerId, raDateStr);
    if (pct <= 0) return 0;
    return Math.round(fee * pct) / 100;
  }
  const raOwnerId =
    ra.ownerId ?? (raDateStr ? resolveOwnerForPropertyOnDate(state, pid, raDateStr) : prop?.ownerId);
  return raOwnerId === forOwnerId ? fee : 0;
}

/**
 * Owner-property bill (cost center) amount allocated to one co-owner by ownership % on bill issue date.
 */
export function getBillCostAllocatedAmountForOwner(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory'>,
  bill: { propertyId?: string; issueDate?: string; amount?: number | string; projectId?: string | null },
  forOwnerId: string
): number {
  if (!bill.propertyId || bill.projectId) return 0;
  const amount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
  if (isNaN(amount) || amount <= 0) return 0;

  const billDateStr = (bill.issueDate || '').slice(0, 10);
  const prop = state.properties.find((p) => p.id === bill.propertyId);
  const pid = String(bill.propertyId);

  if (billDateStr && hasMultipleOwnersOnDate(state, pid, billDateStr)) {
    const pct = getOwnerSharePercentageOnDate(state, pid, forOwnerId, billDateStr);
    if (pct <= 0) return 0;
    return Math.round(amount * pct) / 100;
  }
  const billOwnerId = billDateStr ? resolveOwnerForPropertyOnDate(state, pid, billDateStr) : prop?.ownerId;
  return billOwnerId === forOwnerId ? amount : 0;
}
