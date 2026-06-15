import type pg from 'pg';
import {
  validateRate,
  getQuotationReference,
  getApplicableQuotation,
} from '../../../quotationValidation/QuotationValidationService.js';
import type {
  ProcurementSettings,
  QuotationValidationRecord,
  RateValidationInput,
} from '../../../quotationValidation/types.js';
import { DEFAULT_PROCUREMENT_SETTINGS } from '../../../quotationValidation/types.js';
import { QuotationRepository } from '../repositories/QuotationRepository.js';
import {
  QuotationPriceOverrideRepository,
  type QuotationPriceOverrideInput,
} from '../repositories/QuotationPriceOverrideRepository.js';
import { rowToQuotationApi, type QuotationRow } from './quotationsService.js';
import { getSettingByKey } from '../../app-settings/services/appSettingsService.js';

function rowToValidationRecord(row: QuotationRow): QuotationValidationRecord {
  const api = rowToQuotationApi(row);
  const items = Array.isArray(api.items)
    ? (api.items as Array<Record<string, unknown>>).map((item, idx) => ({
        id: String(item.id ?? idx),
        categoryId: String(item.categoryId ?? item.category_id ?? ''),
        pricePerQuantity: Number(item.pricePerQuantity ?? item.price_per_quantity ?? 0),
        unit: item.unit != null ? String(item.unit) : undefined,
      }))
    : [];

  return {
    id: String(api.id),
    vendorId: String(api.vendorId),
    quotationNumber: api.quotationNumber != null ? String(api.quotationNumber) : undefined,
    name: String(api.name ?? ''),
    date: String(api.date ?? ''),
    expiryDate: api.expiryDate != null ? String(api.expiryDate) : undefined,
    enablePriceValidation: api.enablePriceValidation !== false,
    validationScope: (api.validationScope === 'ITEM' ? 'ITEM' : 'CATEGORY') as 'CATEGORY' | 'ITEM',
    isActive: api.isActive !== false,
    items,
  };
}

async function loadProcurementSettings(
  client: pg.PoolClient,
  tenantId: string
): Promise<ProcurementSettings> {
  const raw = await getSettingByKey(client, tenantId, 'procurementSettings');
  if (!raw || typeof raw !== 'object') return DEFAULT_PROCUREMENT_SETTINGS;
  const s = raw as Record<string, unknown>;
  return {
    enableQuotationValidationGlobally:
      s.enableQuotationValidationGlobally !== false,
    showWarningOnly: s.showWarningOnly !== false,
    varianceApprovalThreshold:
      typeof s.varianceApprovalThreshold === 'number'
        ? s.varianceApprovalThreshold
        : DEFAULT_PROCUREMENT_SETTINGS.varianceApprovalThreshold,
  };
}

export async function validateQuotationRate(
  client: pg.PoolClient,
  tenantId: string,
  input: RateValidationInput
) {
  const repo = new QuotationRepository(tenantId);
  const rows = input.vendorId
    ? await repo.listActiveByVendor(client, input.vendorId)
    : await repo.listActive(client);
  const records = rows.map(rowToValidationRecord);
  const settings = await loadProcurementSettings(client, tenantId);
  return validateRate(records, input, settings);
}

export async function getQuotationReferenceForInput(
  client: pg.PoolClient,
  tenantId: string,
  input: Pick<RateValidationInput, 'vendorId' | 'categoryId' | 'unit' | 'asOfDate'>
) {
  const repo = new QuotationRepository(tenantId);
  const rows = await repo.listActiveByVendor(client, input.vendorId);
  const records = rows.map(rowToValidationRecord);
  return getQuotationReference(records, input);
}

export async function recordQuotationPriceOverride(
  client: pg.PoolClient,
  tenantId: string,
  input: QuotationPriceOverrideInput,
  userId: string | null
) {
  return new QuotationPriceOverrideRepository(tenantId).insertOverride(client, input, userId);
}

export async function getQuotationComplianceMetrics(
  client: pg.PoolClient,
  tenantId: string,
  filters: Parameters<QuotationPriceOverrideRepository['getComplianceMetrics']>[1]
) {
  return new QuotationPriceOverrideRepository(tenantId).getComplianceMetrics(client, filters);
}

export { getApplicableQuotation, validateRate, getQuotationReference };
