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
  const rows = (state.propertyOwnership || []).filter((r) => r.propertyId === propertyId && rowEffectiveOnDate(r, d));
  if (rows.length > 0) {
    const sig = `${d}|${rows.map((r) => `${r.id}:${r.ownershipPercentage}`).sort().join(',')}`;
    const hit = ownershipSharesCache.get(propertyId);
    if (hit && hit.sig === sig) return hit.shares.map((s) => ({ ...s }));

    const shares = rows.map((r) => ({
      ownerId: r.ownerId,
      percentage: Number(r.ownershipPercentage) || 0,
    }));
    ownershipSharesCache.set(propertyId, { sig, shares: shares.map((s) => ({ ...s })) });
    return shares;
  }

  const prop = state.properties.find((p) => p.id === propertyId);
  const legacyOwner =
    getOwnerIdForPropertyOnDate(propertyId, d, state.propertyOwnershipHistory || [], prop?.ownerId) || prop?.ownerId;
  if (!legacyOwner) return [];
  return [{ ownerId: legacyOwner, percentage: 100 }];
}

/** Primary display owner: highest %, then lexicographic owner id. */
/** Properties where this owner is primary OR has a co-ownership row. */
export function getPropertyIdsForOwner(
  state: Pick<AppState, 'properties' | 'propertyOwnership'>,
  ownerId: string,
  buildingId?: string
): Set<string> {
  const stake = new Set(
    (state.propertyOwnership || []).filter((r) => r.ownerId === ownerId).map((r) => r.propertyId)
  );
  const out = new Set<string>();
  for (const p of state.properties) {
    if (buildingId && p.buildingId !== buildingId) continue;
    if (p.ownerId === ownerId || stake.has(p.id)) out.add(String(p.id));
  }
  return out;
}

export function hasMultipleOwnersOnDate(
  state: Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory'>,
  propertyId: string,
  dateYyyyMmDd: string
): boolean {
  return getOwnershipSharesForPropertyOnDate(state, propertyId, dateYyyyMmDd).length > 1;
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

  const property = state.properties.find((p) => p.id === input.propertyId);
  if (!property) throw new Error('Property not found.');

  const transferDay = input.transferDate.slice(0, 10);
  const dayBefore = addCalendarDaysYyyyMmDd(transferDay, -1);
  const now = new Date().toISOString();

  const forProperty = (state.propertyOwnership || []).filter((r) => r.propertyId === input.propertyId);
  const otherPropsRows = (state.propertyOwnership || []).filter((r) => r.propertyId !== input.propertyId);

  const closedPrev = forProperty.map((r) => {
    const stillOpen = r.isActive && (r.endDate == null || String(r.endDate).trim() === '');
    if (stillOpen) {
      return { ...r, endDate: dayBefore, isActive: false, updatedAt: now };
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

  const properties = state.properties.map((p) => (p.id === input.propertyId ? updatedProperty : p));

  // Legacy history: close open-ended row; append new open row for primary timeline (existing screens).
  let propertyOwnershipHistory = state.propertyOwnershipHistory || [];
  const openHist = propertyOwnershipHistory.filter(
    (h) => h.propertyId === input.propertyId && h.ownershipEndDate == null
  );
  if (openHist.length > 0) {
    propertyOwnershipHistory = propertyOwnershipHistory.map((h) =>
      h.propertyId === input.propertyId && h.ownershipEndDate == null
        ? { ...h, ownershipEndDate: dayBefore, updatedAt: now }
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

  invalidatePropertyOwnershipCache(input.propertyId);

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
