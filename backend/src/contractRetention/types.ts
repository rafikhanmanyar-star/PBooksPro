/**
 * AUTO-GENERATED — do not edit. Source: shared/contract-retention/types.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

export type RetentionType = 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT';

export type RetentionReleaseMethod =
  | 'MANUAL'
  | 'ON_COMPLETION'
  | 'ON_HANDOVER'
  | 'DEFECT_LIABILITY_PERIOD';

export type RetentionAlertLevel = 'none' | 'warning' | 'critical';

/** Future-ready: when true, payments above max payable would be blocked. */
export const BLOCK_PAYMENTS_ABOVE_RETENTION_LIMIT = false;

export const RETENTION_WARNING_RATIO = 0.9;

export type ContractRetentionFields = {
  retentionType: RetentionType;
  retentionPercentage?: number | null;
  retentionAmount?: number | null;
  retentionReleaseMethod?: RetentionReleaseMethod | null;
  retentionReleaseDate?: string | null;
  retentionNotes?: string | null;
  retentionBalance?: number;
  retentionReleased?: number;
  retentionReleaseBy?: string | null;
};

export type RetentionSummary = {
  contractValue: number;
  retentionAmount: number;
  maximumPayable: number;
  paidAmount: number;
  outstandingAmount: number;
  retentionHeld: number;
  retentionReleased: number;
  remainingRetention: number;
  remainingPayable: number;
  warningThreshold: number;
  alertLevel: RetentionAlertLevel;
};

export type RetentionThresholdValidation = RetentionSummary & {
  message?: string;
  title?: string;
};
