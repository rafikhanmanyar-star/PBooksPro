/**
 * Browser-safe contract retention helpers (shared core).
 */
export {
  buildRetentionSummary,
  calculateMaximumPayable,
  calculateRetentionAmount,
  normalizeRetentionType,
  resolveRetentionAlertLevel,
  roundMoney,
  shouldBlockPaymentAboveRetentionLimit,
  validateRetentionThreshold,
} from '../shared/contract-retention/contractRetentionCore';

export type {
  ContractRetentionFields,
  RetentionAlertLevel,
  RetentionReleaseMethod,
  RetentionSummary,
  RetentionThresholdValidation,
  RetentionType,
} from '../shared/contract-retention/types';

export { BLOCK_PAYMENTS_ABOVE_RETENTION_LIMIT, RETENTION_WARNING_RATIO } from '../shared/contract-retention/types';

import type { Contract } from '../types';
import { buildRetentionSummary, type RetentionSummary } from '../shared/contract-retention/contractRetentionCore';

export function contractToRetentionFields(contract: Contract) {
  return {
    retentionType: contract.retentionType ?? 'NONE',
    retentionPercentage: contract.retentionPercentage ?? null,
    retentionAmount: contract.retentionAmount ?? null,
    retentionReleaseMethod: contract.retentionReleaseMethod ?? null,
    retentionReleaseDate: contract.retentionReleaseDate ?? null,
    retentionNotes: contract.retentionNotes ?? null,
    retentionBalance: contract.retentionBalance ?? 0,
    retentionReleased: contract.retentionReleased ?? 0,
    retentionReleaseBy: contract.retentionReleaseBy ?? null,
  };
}

export function getContractPaidFromTransactions(
  transactions: Array<{ contractId?: string; amount: number }>,
  contractId: string
): number {
  let sum = 0;
  for (const tx of transactions) {
    if (tx.contractId === contractId) sum += tx.amount || 0;
  }
  return Math.round(sum * 100) / 100;
}

export function buildContractRetentionSummary(
  contract: Contract,
  paidAmount: number
): RetentionSummary {
  return buildRetentionSummary({
    contractValue: contract.totalAmount ?? 0,
    paidAmount,
    fields: contractToRetentionFields(contract),
  });
}
