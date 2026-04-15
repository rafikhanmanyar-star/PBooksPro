/**
 * Cash-neutral owner split postings after a tenant rent receipt (multi-owner properties).
 */

import type { AppState, Transaction } from '../types';
import { TransactionType } from '../types';
import { getOwnershipSharesForPropertyOnDate, primaryOwnerIdFromShares } from './propertyOwnershipService';
import { resolveSystemCategoryId } from './systemEntityIds';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function shouldPostOwnerRentAllocation(
  state: AppState,
  propertyId: string | undefined,
  dateYyyyMmDd: string
): boolean {
  if (!propertyId) return false;
  const shares = getOwnershipSharesForPropertyOnDate(state, propertyId, dateYyyyMmDd);
  return shares.length > 1;
}

function resolveClearingAndShareCategoryIds(state: AppState): { clearingId: string; shareId: string } | null {
  const clearingResolved = resolveSystemCategoryId(state.categories, 'sys-cat-rent-own-clear');
  const shareResolved = resolveSystemCategoryId(state.categories, 'sys-cat-rent-own-share');
  const clearing =
    (clearingResolved ? state.categories.find((c) => c.id === clearingResolved) : undefined) ??
    state.categories.find((c) => c.name === 'Owner Rental Allocation (Clearing)');
  const share =
    (shareResolved ? state.categories.find((c) => c.id === shareResolved) : undefined) ??
    state.categories.find((c) => c.name === 'Owner Rental Income Share');
  if (!clearing?.id || !share?.id) return null;
  return { clearingId: clearing.id, shareId: share.id };
}

/**
 * Returns additional transactions (clearing + per-owner share) to post with BATCH_ADD after gross rent.
 * Net bank impact is zero; categories are P&L-excluded.
 */
export function buildOwnerRentAllocationTransactions(
  state: AppState,
  args: {
    propertyId: string;
    buildingId?: string;
    paymentDateYyyyMmDd: string;
    rentAmount: number;
    accountId: string;
    invoiceId: string;
    baseDescription: string;
    batchId: string;
  }
): Omit<Transaction, 'id'>[] {
  const amt = args.rentAmount;
  if (amt <= 0) return [];

  const cats = resolveClearingAndShareCategoryIds(state);
  if (!cats) return [];

  const shares = getOwnershipSharesForPropertyOnDate(state, args.propertyId, args.paymentDateYyyyMmDd);
  if (shares.length <= 1) return [];

  const primary = primaryOwnerIdFromShares(shares);

  const out: Omit<Transaction, 'id'>[] = [];
  out.push({
    type: TransactionType.INCOME,
    amount: -amt,
    date: args.paymentDateYyyyMmDd,
    description: `${args.baseDescription} — owner allocation clearing`,
    accountId: args.accountId,
    categoryId: cats.clearingId,
    propertyId: args.propertyId,
    buildingId: args.buildingId,
    invoiceId: args.invoiceId,
    ownerId: primary,
    batchId: args.batchId,
    isSystem: true,
  });

  let allocated = 0;
  shares.forEach((s, idx) => {
    const isLast = idx === shares.length - 1;
    const raw = (amt * s.percentage) / 100;
    const lineAmt = isLast ? round2(amt - allocated) : round2(raw);
    if (!isLast) allocated += lineAmt;

    out.push({
      type: TransactionType.INCOME,
      amount: lineAmt,
      date: args.paymentDateYyyyMmDd,
      description: `${args.baseDescription} — owner share (${s.percentage.toFixed(2)}%)`,
      accountId: args.accountId,
      categoryId: cats.shareId,
      contactId: s.ownerId,
      propertyId: args.propertyId,
      buildingId: args.buildingId,
      invoiceId: args.invoiceId,
      ownerId: s.ownerId,
      batchId: args.batchId,
      isSystem: true,
    });
  });

  return out;
}
