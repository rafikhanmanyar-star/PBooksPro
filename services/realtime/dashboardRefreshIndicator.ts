import type { RealtimeEntityPayload } from './realtimePayload';
import { markDashboardRefreshPending } from '../../stores/dashboardRefreshIndicatorStore';

/** Entity types that mean new ledger / payment activity for the executive dashboard. */
export const DASHBOARD_TRANSACTION_ENTITY_TYPES = new Set([
  'transaction',
  'payment',
  'invoice',
  'bill',
  'project_expense_voucher',
  'contractor_bill',
]);

export function shouldMarkDashboardRefreshForEntity(
  payload: RealtimeEntityPayload,
  ctx: { currentUserId?: string }
): boolean {
  const entityType = payload.type;
  if (!entityType || !DASHBOARD_TRANSACTION_ENTITY_TYPES.has(entityType)) {
    return false;
  }
  if (payload.sourceUserId && ctx.currentUserId && payload.sourceUserId === ctx.currentUserId) {
    return false;
  }
  return true;
}

export function maybeMarkDashboardRefreshForEntity(
  payload: RealtimeEntityPayload,
  ctx: { currentUserId?: string }
): void {
  if (shouldMarkDashboardRefreshForEntity(payload, ctx)) {
    markDashboardRefreshPending();
  }
}

export function markDashboardRefreshForFinancialPosted(): void {
  markDashboardRefreshPending();
}
