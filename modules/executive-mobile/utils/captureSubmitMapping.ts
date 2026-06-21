import type { CreateUnpostedTransactionPayload } from '../../../services/api/unpostedTransactionsApi';
import type { UnpostedTransaction } from '../../../types/executiveMobile.types';
import { UNPOSTED_SOURCE_EXECUTIVE_APP } from '../../../types/executiveMobile.types';
import type { CaptureType, MoneyFlow } from '../constants/quickCaptureTypes';
import { captureTypeDisplayLabel, moneyFlowDirectionLabel } from '../constants/quickCaptureTypes';
import { voiceDescriptionForFinance } from './parseVoiceQuickCapture';

export type CaptureFormFields = {
  amount: number;
  moneyFlow: MoneyFlow;
  partyName?: string;
  description?: string;
  projectId?: string;
  supplierId?: string;
  employeeId?: string;
  customerId?: string;
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

  if (fields.moneyFlow === 'in') {
    switch (captureType.kind) {
      case 'customer_collection':
        transactionType = 'customer_collection';
        break;
      case 'cash_deposit':
        transactionType = 'cash_deposit';
        break;
      case 'custom':
        transactionType = 'other';
        description = notes ? `[${captureType.label}] ${notes}` : `[${captureType.label}]`;
        break;
      default:
        transactionType = 'cash_deposit';
    }
  } else {
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
    customerId: fields.customerId || undefined,
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
    case 'customer_collection':
      return 'Customer Collection';
    case 'cash_deposit':
      return 'Cash Deposit';
    case 'other':
      return tx.customerId ? 'Customer' : 'Misc';
    default:
      return tx.transactionType.replace(/_/g, ' ');
  }
}

export function getCaptureFlowLabel(tx: UnpostedTransaction): string {
  if (tx.transactionType === 'customer_collection' || tx.transactionType === 'cash_deposit') {
    return moneyFlowDirectionLabel('in');
  }
  return moneyFlowDirectionLabel('out');
}

export function stripCaptureDescriptionPrefix(description?: string): string {
  if (!description) return '';
  return description.replace(CUSTOM_DESC_PREFIX, '').trim();
}

export function reviewCaptureTypeLabel(type: CaptureType, moneyFlow: MoneyFlow): string {
  return captureTypeDisplayLabel(type, moneyFlow);
}
