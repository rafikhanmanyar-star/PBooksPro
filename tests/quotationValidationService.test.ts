/**
 * Vendor quotation price validation engine tests.
 */
import assert from 'node:assert';
import {
  validateRate,
  getApplicableQuotation,
  calculateVariance,
  resolveSeverity,
} from '../shared/quotation-validation/QuotationValidationService.js';
import type { QuotationValidationRecord } from '../shared/quotation-validation/types.js';
import { DEFAULT_PROCUREMENT_SETTINGS } from '../shared/quotation-validation/types.js';

function baseQuotation(overrides: Partial<QuotationValidationRecord> = {}): QuotationValidationRecord {
  return {
    id: 'q1',
    vendorId: 'v1',
    quotationNumber: 'QTN-2026-0045',
    name: 'ABC Steel',
    date: '2026-05-12',
    expiryDate: '2026-12-31',
    enablePriceValidation: true,
    validationScope: 'CATEGORY',
    isActive: true,
    items: [{ id: 'i1', categoryId: 'cat-cement', pricePerQuantity: 550, unit: 'quantity' }],
    ...overrides,
  };
}

function run() {
  const higher = validateRate([baseQuotation()], {
    vendorId: 'v1',
    categoryId: 'cat-cement',
    transactionRate: 620,
  });
  assert.strictEqual(higher.quotationFound, true);
  assert.strictEqual(higher.exceedsQuotation, true);
  assert.strictEqual(higher.quotedRate, 550);
  assert.strictEqual(higher.varianceAmount, 70);
  assert.strictEqual(higher.severity, 'HIGH');
  assert.strictEqual(higher.quotationReference, 'QTN-2026-0045');

  const equal = validateRate([baseQuotation()], {
    vendorId: 'v1',
    categoryId: 'cat-cement',
    transactionRate: 550,
  });
  assert.strictEqual(equal.exceedsQuotation, false);
  assert.strictEqual(equal.severity, 'WITHIN');

  const below = validateRate([baseQuotation()], {
    vendorId: 'v1',
    categoryId: 'cat-cement',
    transactionRate: 500,
  });
  assert.strictEqual(below.exceedsQuotation, false);
  assert.strictEqual(below.severity, 'WITHIN');

  const disabled = validateRate([baseQuotation({ enablePriceValidation: false })], {
    vendorId: 'v1',
    categoryId: 'cat-cement',
    transactionRate: 620,
  });
  assert.strictEqual(disabled.quotationFound, true);
  assert.strictEqual(disabled.validationEnabled, false);
  assert.strictEqual(disabled.exceedsQuotation, false);

  const expired = validateRate([baseQuotation({ expiryDate: '2026-01-01' })], {
    vendorId: 'v1',
    categoryId: 'cat-cement',
    transactionRate: 620,
    asOfDate: '2026-06-01',
  });
  assert.strictEqual(expired.quotationFound, false);

  const older = baseQuotation({
    id: 'q-old',
    date: '2026-01-01',
    items: [{ id: 'i1', categoryId: 'cat-cement', pricePerQuantity: 500 }],
  });
  const newer = baseQuotation({
    id: 'q-new',
    date: '2026-05-12',
    items: [{ id: 'i2', categoryId: 'cat-cement', pricePerQuantity: 550 }],
  });
  const match = getApplicableQuotation([older, newer], {
    vendorId: 'v1',
    categoryId: 'cat-cement',
    transactionRate: 0,
  });
  assert.strictEqual(match?.quotedRate, 550);
  assert.strictEqual(match?.quotation.id, 'q-new');

  const globalOff = validateRate(
    [baseQuotation()],
    { vendorId: 'v1', categoryId: 'cat-cement', transactionRate: 620 },
    { ...DEFAULT_PROCUREMENT_SETTINGS, enableQuotationValidationGlobally: false }
  );
  assert.strictEqual(globalOff.validationEnabled, false);
  assert.strictEqual(globalOff.exceedsQuotation, false);

  const { variancePercentage } = calculateVariance(550, 570);
  assert.ok(Math.abs(variancePercentage - 3.64) < 0.1);
  assert.strictEqual(resolveSeverity(variancePercentage), 'LOW');

  const itemScope = baseQuotation({
    validationScope: 'ITEM',
    items: [
      { id: 'i1', categoryId: 'cat-cement', pricePerQuantity: 550, unit: 'Cubic Feet' },
      { id: 'i2', categoryId: 'cat-cement', pricePerQuantity: 600, unit: 'quantity' },
    ],
  });
  const matchFeet = getApplicableQuotation([itemScope], {
    vendorId: 'v1',
    categoryId: 'cat-cement',
    transactionRate: 0,
    unit: 'Cubic Feet',
  });
  assert.strictEqual(matchFeet?.quotedRate, 550);

  console.log('quotationValidationService.test.ts — all assertions passed');
}

run();
