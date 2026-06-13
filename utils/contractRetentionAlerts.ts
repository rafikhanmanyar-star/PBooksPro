import type { Contract } from '../types';
import {
  buildContractRetentionSummary,
  getContractPaidFromTransactions,
  shouldBlockPaymentAboveRetentionLimit,
  validateRetentionThreshold,
} from './contractRetention';

export type ContractRetentionAlert = {
  alertLevel: 'warning' | 'critical';
  title: string;
  message: string;
};

export function checkContractRetentionForPayment(
  contract: Contract | undefined,
  transactions: Array<{ contractId?: string; amount: number }>,
  additionalPayment: number
): ContractRetentionAlert | null {
  if (!contract || (contract.retentionType ?? 'NONE') === 'NONE') return null;

  const paid = getContractPaidFromTransactions(transactions, contract.id);
  const validation = validateRetentionThreshold({
    contractValue: contract.totalAmount ?? 0,
    paidAmount: paid,
    projectedPaidAmount: paid + additionalPayment,
    fields: {
      retentionType: contract.retentionType ?? 'NONE',
      retentionPercentage: contract.retentionPercentage ?? null,
      retentionAmount: contract.retentionAmount ?? null,
      retentionReleased: contract.retentionReleased ?? 0,
    },
  });

  if (validation.alertLevel === 'none') return null;

  return {
    alertLevel: validation.alertLevel,
    title: validation.title ?? 'Retention Alert',
    message: validation.message ?? '',
  };
}

export function summarizeContractRetention(contract: Contract, paidAmount: number) {
  return buildContractRetentionSummary(contract, paidAmount);
}

export { shouldBlockPaymentAboveRetentionLimit };
