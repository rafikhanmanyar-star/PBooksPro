import type {
  ProcurementSettings,
  QuotationReferenceInfo,
  QuotationValidationRecord,
  QuotationValidationResult,
  QuotationValidationScope,
  QuotationPriceSeverity,
  RateValidationInput,
} from './types.js';
import { DEFAULT_PROCUREMENT_SETTINGS } from './types.js';

const YELLOW_THRESHOLD_PCT = 5;

function normalizeUnit(unit?: string): string {
  return (unit ?? '').trim().toLowerCase();
}

function parseDateOnly(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isQuotationExpired(quotation: QuotationValidationRecord, asOfDate?: string): boolean {
  if (!quotation.expiryDate) return false;
  const ref = parseDateOnly(asOfDate ?? new Date().toISOString().slice(0, 10));
  const exp = parseDateOnly(quotation.expiryDate);
  if (!ref || !exp) return false;
  return ref > exp;
}

function itemMatchesScope(
  item: QuotationValidationRecord['items'][number],
  categoryId: string,
  unit: string | undefined,
  scope: QuotationValidationScope
): boolean {
  if (item.categoryId !== categoryId) return false;
  if (scope === 'CATEGORY') return true;
  const itemUnit = normalizeUnit(item.unit);
  const inputUnit = normalizeUnit(unit);
  if (!itemUnit) return true;
  return itemUnit === inputUnit;
}

function quotationReferenceLabel(q: QuotationValidationRecord): string {
  return q.quotationNumber?.trim() || q.name?.trim() || q.id;
}

export function calculateVariance(
  quotedRate: number,
  transactionRate: number
): { varianceAmount: number; variancePercentage: number } {
  const varianceAmount = roundMoney(transactionRate - quotedRate);
  const variancePercentage =
    quotedRate > 0 ? roundPct((varianceAmount / quotedRate) * 100) : transactionRate > 0 ? 100 : 0;
  return { varianceAmount, variancePercentage };
}

export function resolveSeverity(variancePercentage: number): QuotationPriceSeverity {
  if (variancePercentage <= 0) return 'WITHIN';
  if (variancePercentage <= YELLOW_THRESHOLD_PCT) return 'LOW';
  return 'HIGH';
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ApplicableQuotationMatch {
  quotation: QuotationValidationRecord;
  quotedRate: number;
  matchedItemId?: string;
}

/**
 * Select the best matching quotation line using priority:
 * active → non-expired → latest date → (same date: first matching item rate)
 */
export function getApplicableQuotation(
  quotations: QuotationValidationRecord[],
  input: RateValidationInput
): ApplicableQuotationMatch | null {
  const asOf = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const vendorQuotations = quotations.filter((q) => q.vendorId === input.vendorId && q.isActive !== false);

  type Candidate = ApplicableQuotationMatch & { date: string };
  const candidates: Candidate[] = [];

  for (const quotation of vendorQuotations) {
    if (isQuotationExpired(quotation, asOf)) continue;

    const scope = quotation.validationScope ?? 'CATEGORY';
    for (const item of quotation.items ?? []) {
      if (!itemMatchesScope(item, input.categoryId, input.unit, scope)) continue;
      const rate = Number(item.pricePerQuantity);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      candidates.push({
        quotation,
        quotedRate: rate,
        matchedItemId: item.id,
        date: quotation.date,
      });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return a.quotedRate - b.quotedRate;
  });

  const best = candidates[0]!;
  return {
    quotation: best.quotation,
    quotedRate: best.quotedRate,
    matchedItemId: best.matchedItemId,
  };
}

export function validateRate(
  quotations: QuotationValidationRecord[],
  input: RateValidationInput,
  settings: ProcurementSettings = DEFAULT_PROCUREMENT_SETTINGS
): QuotationValidationResult {
  const transactionRate = Number(input.transactionRate) || 0;
  const base: QuotationValidationResult = {
    quotationFound: false,
    validationEnabled: settings.enableQuotationValidationGlobally,
    transactionRate,
    severity: 'NONE',
    exceedsQuotation: false,
  };

  if (!settings.enableQuotationValidationGlobally) {
    return base;
  }

  if (!input.vendorId || !input.categoryId || transactionRate <= 0) {
    return base;
  }

  const match = getApplicableQuotation(quotations, input);
  if (!match) {
    return { ...base, quotationFound: false };
  }

  const { quotation, quotedRate } = match;
  if (quotation.enablePriceValidation === false) {
    return {
      ...base,
      quotationFound: true,
      validationEnabled: false,
      quotedRate,
      quotationReference: quotationReferenceLabel(quotation),
      quotationId: quotation.id,
      quotationDate: quotation.date,
      expiryDate: quotation.expiryDate,
      validationScope: quotation.validationScope,
    };
  }

  const { varianceAmount, variancePercentage } = calculateVariance(quotedRate, transactionRate);
  const severity = resolveSeverity(variancePercentage);
  const exceedsQuotation = transactionRate > quotedRate;
  const wouldRequireApproval =
    exceedsQuotation && variancePercentage > (settings.varianceApprovalThreshold ?? 10);

  return {
    quotationFound: true,
    validationEnabled: true,
    quotedRate,
    transactionRate,
    varianceAmount,
    variancePercentage,
    severity,
    quotationReference: quotationReferenceLabel(quotation),
    quotationId: quotation.id,
    quotationDate: quotation.date,
    expiryDate: quotation.expiryDate,
    validationScope: quotation.validationScope,
    exceedsQuotation,
    wouldRequireApproval,
  };
}

export function getQuotationReference(
  quotations: QuotationValidationRecord[],
  input: Pick<RateValidationInput, 'vendorId' | 'categoryId' | 'unit' | 'asOfDate'>,
  lookups?: { vendorName?: string; categoryName?: string }
): QuotationReferenceInfo | null {
  const match = getApplicableQuotation(quotations, {
    ...input,
    transactionRate: 0,
  });
  if (!match) return null;

  const { quotation, quotedRate, matchedItemId } = match;
  const matchedItem = quotation.items.find((i) => i.id === matchedItemId);

  return {
    quotationId: quotation.id,
    quotationNumber: quotation.quotationNumber,
    vendorId: quotation.vendorId,
    vendorName: lookups?.vendorName,
    categoryId: input.categoryId,
    categoryName: lookups?.categoryName,
    itemLabel: matchedItem?.unit,
    quotedRate,
    quotationDate: quotation.date,
    expiryDate: quotation.expiryDate,
    enablePriceValidation: quotation.enablePriceValidation !== false,
    validationScope: quotation.validationScope ?? 'CATEGORY',
  };
}

export function severityLabel(severity: QuotationPriceSeverity, variancePercentage?: number): string {
  switch (severity) {
    case 'WITHIN':
      return 'Within Quotation';
    case 'LOW':
      return `${Math.abs(variancePercentage ?? 0).toFixed(0)}% Above Quotation`;
    case 'HIGH':
      return `${Math.abs(variancePercentage ?? 0).toFixed(0)}% Above Quotation`;
    default:
      return '';
  }
}

export function severityIndicator(severity: QuotationPriceSeverity): string {
  switch (severity) {
    case 'WITHIN':
      return '✔';
    case 'LOW':
      return '⚠';
    case 'HIGH':
      return '🚨';
    default:
      return '';
  }
}
