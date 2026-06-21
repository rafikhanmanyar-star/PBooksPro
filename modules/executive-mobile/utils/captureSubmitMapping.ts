import type { CreateUnpostedTransactionPayload } from '../../../services/api/unpostedTransactionsApi';
import type { UnpostedTransaction } from '../../../types/executiveMobile.types';
import { UNPOSTED_SOURCE_EXECUTIVE_APP } from '../../../types/executiveMobile.types';
import type { CaptureType } from '../constants/quickCaptureTypes';
import { voiceDescriptionForFinance } from './parseVoiceQuickCapture';

export type CaptureFormFields = {
  amount: number;
  partyName?: string;
  description?: string;
  projectId?: string;
  supplierId?: string;
  employeeId?: string;
  voiceTranscript?: string | null;
};

const CUSTOM_DESC_PREFIX = /^\[([^\]]+)\]\s*/;

export function buildUnpostedPayload(
  captureType: CaptureType,
  fields: CaptureFormFields
): CreateUnpostedTransactionPayload {
  const notes = fields.description?.trim();
  let description = notes;
  let transactionType: string;

  switch (captureType.kind) {
    case 'suppliers':
      transactionType = 'supplier_payment';
      break;
    case 'staff':
      transactionType = 'employee_payment';
      break;
    case 'site':
      transactionType = 'site_expense';
      break;
    case 'misc':
      transactionType = 'other';
      break;
    case 'custom':
      transactionType = 'other';
      description = notes ? `[${captureType.label}] ${notes}` : `[${captureType.label}]`;
      break;
    default:
      transactionType = 'other';
  }

  if (fields.voiceTranscript) {
    description = voiceDescriptionForFinance(fields.voiceTranscript, description);
  }

  return {
    transactionDate: undefined,
    amount: fields.amount,
    transactionType,
    partyName: fields.partyName?.trim() || undefined,
    description,
    supplierId: fields.supplierId || undefined,
    employeeId: fields.employeeId || undefined,
    projectId: fields.projectId?.trim() || undefined,
    source: UNPOSTED_SOURCE_EXECUTIVE_APP,
    status: 'submitted',
  };
}

/** Friendly label for queue / my submissions (maps backend type + description prefix). */
export function getCaptureDisplayLabel(tx: UnpostedTransaction): string {
  const customMatch = tx.description?.match(CUSTOM_DESC_PREFIX);
  if (customMatch?.[1]) return customMatch[1];

  switch (tx.transactionType) {
    case 'supplier_payment':
      return 'Suppliers';
    case 'employee_payment':
      return 'Staff';
    case 'site_expense':
      return 'Site';
    case 'other':
      return 'Misc';
    default:
      return tx.transactionType.replace(/_/g, ' ');
  }
}

export function stripCaptureDescriptionPrefix(description?: string): string {
  if (!description) return '';
  return description.replace(CUSTOM_DESC_PREFIX, '').trim();
}
