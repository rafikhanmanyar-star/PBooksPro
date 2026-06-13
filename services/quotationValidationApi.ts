import type { QuotationValidationResult } from '../shared/quotation-validation/types';
import { apiClient } from './api/client';
import { isLocalOnlyMode } from '../config/apiUrl';

export async function recordQuotationPriceOverrideApi(input: {
  quotationId?: string;
  quotationReference?: string;
  sourceType: 'contract' | 'bill';
  sourceId: string;
  lineItemId?: string;
  vendorId: string;
  categoryId?: string;
  projectId?: string;
  quotationRate?: number;
  transactionRate: number;
  varianceAmount?: number;
  variancePercentage?: number;
}): Promise<void> {
  if (isLocalOnlyMode()) return;
  await apiClient.post('/quotation-validation/overrides', input);
}

export function buildOverridePayload(
  result: QuotationValidationResult,
  ctx: {
    sourceType: 'contract' | 'bill';
    sourceId: string;
    lineItemId?: string;
    vendorId: string;
    categoryId?: string;
    projectId?: string;
  }
) {
  return {
    quotationId: result.quotationId,
    quotationReference: result.quotationReference,
    sourceType: ctx.sourceType,
    sourceId: ctx.sourceId,
    lineItemId: ctx.lineItemId,
    vendorId: ctx.vendorId,
    categoryId: ctx.categoryId,
    projectId: ctx.projectId,
    quotationRate: result.quotedRate,
    transactionRate: result.transactionRate,
    varianceAmount: result.varianceAmount,
    variancePercentage: result.variancePercentage,
  };
}
