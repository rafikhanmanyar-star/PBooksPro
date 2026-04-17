/**
 * Percentage-based property co-ownership: resolution, transfer, and cache.
 */

import type { AppState, Property, PropertyOwnership, PropertyOwnershipHistory } from '../types';
import { getOwnerIdForPropertyOnDate } from './ownershipHistoryUtils';
import { toLocalDateString } from '../utils/dateUtils';

const EPS = 0.0001;

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
  if (Math.abs(sum - 100) > EPS) return `Ownership percentages must total 100% (currently ${sum.toFixed(4)}).`;
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

/** Lexicographic max for YYYY-MM-DD strings (valid dates). */
function maxYyyyMmDd(a: string, b: string): string {
  const aa = a.slice(0, 10);
  const bb = b.slice(0, 10);
  return aa >= bb ? aa : bb;
}

/**
 * Calendar day to set on a closing ownership slice so PostgreSQL CHECK `end_date >= start_date` holds.
 * When the row started on the transfer day, `dayBefore` is before `start_date` — using it alone would fail the CHECK.
 */
function closingEndDateForOwnershipRow(
  rowStartYyyyMmDd: string,
  dayBeforeTransfer: string
): string {
  return maxYyyyMmDd(dayBeforeTransfer, rowStartYyyyMmDd.slice(0, 10));
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
  const dayBefore = addCalendarDaysYyyyMmDd(transferDay, -1);
  const now = new Date().toISOString();

  const forProperty = (state.propertyOwnership || []).filter((r) => String(r.propertyId) === pid);
  const otherPropsRows = (state.propertyOwnership || []).filter((r) => String(r.propertyId) !== pid);

  const closedPrev = forProperty.map((r) => {
    const stillOpen = r.isActive && (r.endDate == null || String(r.endDate).trim() === '');
    if (stillOpen) {
      const endDate = closingEndDateForOwnershipRow(r.startDate, dayBefore);
      return { ...r, endDate, isActive: false, updatedAt: now };
    }
    return { ...r };
  });

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
            ownershipEndDate: closingEndDateForOwnershipRow(h.ownershipStartDate, dayBefore),
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
