/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/sodPairs.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * RBAC 2.0 — Separation of Duties pair registry (metadata only in Phase 1).
 * Mirrors docs/security/SoD_MATRIX.md mandatory + extended pairs.
 */

import type { SodPairDefinition } from './permissionTypes.js';

export const SOD_MANDATORY_PAIRS: readonly SodPairDefinition[] = [
  {
    permissionA: 'payroll.runs.create',
    permissionB: 'payroll.runs.approve',
    category: 'mandatory',
    domain: 'Payroll',
    rationale: 'Creator cannot approve own payroll run',
  },
  {
    permissionA: 'procurement.purchase_orders.create',
    permissionB: 'procurement.purchase_orders.approve',
    category: 'mandatory',
    domain: 'Procurement — Purchase Orders',
    rationale: 'Requester cannot approve own PO',
  },
  {
    permissionA: 'procurement.bills.create',
    permissionB: 'procurement.bills.approve',
    category: 'mandatory',
    domain: 'Vendor Bills',
    rationale: 'Bill creator cannot approve own bill',
  },
  {
    permissionA: 'accounting.transactions.create',
    permissionB: 'approve.payments',
    category: 'mandatory',
    domain: 'Payments',
    rationale: 'Payment initiator cannot approve payment release',
  },
  {
    permissionA: 'accounting.journals.create',
    permissionB: 'accounting.journals.approve',
    category: 'mandatory',
    domain: 'Manual Journals',
    rationale: 'Journal preparer cannot approve own entry',
  },
  {
    permissionA: 'accounting.journals.reverse',
    permissionB: 'accounting.journals.approve',
    category: 'mandatory',
    domain: 'Journal Reversal',
    rationale: 'Reversal initiator cannot approve the reversal',
  },
] as const;

export const SOD_EXTENDED_PAIRS: readonly SodPairDefinition[] = [
  {
    permissionA: 'rental.agreements.create',
    permissionB: 'rental.agreements.approve',
    category: 'extended',
    domain: 'Rental',
    rationale: 'Agreement creator cannot approve own agreement',
  },
  {
    permissionA: 'project_selling.agreements.create',
    permissionB: 'project_selling.agreements.approve',
    category: 'extended',
    domain: 'Project selling',
    rationale: 'Agreement creator cannot approve own agreement',
  },
  {
    permissionA: 'procurement.quotations.create',
    permissionB: 'procurement.quotations.approve',
    category: 'extended',
    domain: 'Procurement',
    rationale: 'Quotation creator cannot approve own quotation',
  },
  {
    permissionA: 'goods_receipt.create',
    permissionB: 'goods_receipt.post',
    category: 'extended',
    domain: 'Inventory / GRN',
    rationale: 'GRN creator cannot post own receipt',
  },
  {
    permissionA: 'pev.create',
    permissionB: 'pev.approve',
    category: 'extended',
    domain: 'Project expense vouchers',
    rationale: 'PEV creator cannot approve own voucher',
  },
] as const;

export const ALL_SOD_PAIRS: readonly SodPairDefinition[] = [
  ...SOD_MANDATORY_PAIRS,
  ...SOD_EXTENDED_PAIRS,
] as const;

export function getSodPairs(category?: 'mandatory' | 'extended'): readonly SodPairDefinition[] {
  if (category === 'mandatory') return SOD_MANDATORY_PAIRS;
  if (category === 'extended') return SOD_EXTENDED_PAIRS;
  return ALL_SOD_PAIRS;
}

export function collectSodReferencedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const pair of ALL_SOD_PAIRS) {
    keys.add(pair.permissionA);
    keys.add(pair.permissionB);
  }
  return keys;
}
