/**
 * AUTO-GENERATED — do not edit. Source: shared/workflow/approvalLifecycle.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/** Parallel approval lifecycle (separate from bill payment status / contract lifecycle). */
export type ApprovalLifecycleStatus = 'Draft' | 'Submitted' | 'Approved';

export const APPROVAL_LIFECYCLE_STATUSES: readonly ApprovalLifecycleStatus[] = [
  'Draft',
  'Submitted',
  'Approved',
] as const;

export function isApprovalGated(status: string | null | undefined): boolean {
  const s = String(status ?? 'Approved').trim();
  return s !== 'Approved';
}

export function normalizeApprovalLifecycleStatus(
  raw: string | null | undefined,
  fallback: ApprovalLifecycleStatus = 'Approved'
): ApprovalLifecycleStatus {
  const s = String(raw ?? fallback).trim();
  if (s === 'Draft' || s === 'Submitted' || s === 'Approved') return s;
  return fallback;
}
