import { useMemo, useCallback } from 'react';
import type { Quotation, ProcurementSettings, Vendor, Contact } from '../types';
import {
  validateRate,
  getQuotationReference,
  type QuotationValidationRecord,
} from '../shared/quotation-validation';
import type {
  QuotationValidationResult,
  QuotationReferenceInfo,
  RateValidationInput,
} from '../shared/quotation-validation/types';
import { DEFAULT_PROCUREMENT_SETTINGS } from '../shared/quotation-validation/types';
import { resolveQuotationVendorIds, resolveBillVendorId } from '../utils/resolveBillVendorId';

export { resolveBillVendorId, resolveQuotationVendorIds };

export function quotationToValidationRecord(q: Quotation): QuotationValidationRecord {
  return {
    id: q.id,
    vendorId: q.vendorId,
    quotationNumber: q.quotationNumber,
    name: q.name,
    date: q.date,
    expiryDate: q.expiryDate,
    enablePriceValidation: q.enablePriceValidation !== false,
    validationScope: q.validationScope === 'ITEM' ? 'ITEM' : 'CATEGORY',
    isActive: q.isActive !== false,
    items: (q.items ?? []).map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      pricePerQuantity: item.pricePerQuantity,
      unit: item.unit,
    })),
  };
}

export function useQuotationValidationCache(quotations: Quotation[], vendorId?: string) {
  const records = useMemo(() => {
    const list = vendorId
      ? quotations.filter((q) => q.vendorId === vendorId)
      : quotations;
    return list.map(quotationToValidationRecord);
  }, [quotations, vendorId]);

  const recordsByVendor = useMemo(() => {
    const map = new Map<string, QuotationValidationRecord[]>();
    for (const q of quotations) {
      const rec = quotationToValidationRecord(q);
      const arr = map.get(q.vendorId) ?? [];
      arr.push(rec);
      map.set(q.vendorId, arr);
    }
    return map;
  }, [quotations]);

  return { records, recordsByVendor };
}

export function useQuotationRateValidator(
  quotations: Quotation[],
  procurementSettings?: ProcurementSettings,
  vendorContext?: {
    vendorId?: string;
    contactId?: string;
    vendors?: Vendor[];
    contacts?: Contact[];
  }
) {
  const settings = procurementSettings ?? DEFAULT_PROCUREMENT_SETTINGS;

  const vendorIds = useMemo(() => {
    if (!vendorContext) return null;
    return resolveQuotationVendorIds(
      vendorContext.vendorId,
      vendorContext.contactId,
      {
        vendors: vendorContext.vendors ?? [],
        contacts: vendorContext.contacts ?? [],
      }
    );
  }, [vendorContext]);

  const filterForVendor = useCallback(
    (vendorId: string) => {
      if (vendorIds?.length) {
        return quotations.filter((q) => vendorIds.includes(q.vendorId));
      }
      return quotations.filter((q) => q.vendorId === vendorId);
    },
    [quotations, vendorIds]
  );

  const validate = useCallback(
    (input: RateValidationInput): QuotationValidationResult => {
      const vendorRecords = filterForVendor(input.vendorId).map(quotationToValidationRecord);
      return validateRate(vendorRecords, input, settings);
    },
    [filterForVendor, settings]
  );

  const getReference = useCallback(
    (
      input: Pick<RateValidationInput, 'vendorId' | 'categoryId' | 'unit' | 'asOfDate'>,
      lookups?: { vendorName?: string; categoryName?: string }
    ): QuotationReferenceInfo | null => {
      const vendorRecords = filterForVendor(input.vendorId).map(quotationToValidationRecord);
      return getQuotationReference(vendorRecords, input, lookups);
    },
    [filterForVendor]
  );

  return { validate, getReference, settings, resolvedVendorIds: vendorIds };
}
