import type { QuotationValidationResult } from '../shared/quotation-validation/types';
import type { ContractExpenseCategoryItem } from '../types';
import type { RateValidationInput } from '../shared/quotation-validation/types';

export type ValidateLineFn = (input: RateValidationInput) => QuotationValidationResult;

export function collectQuotationViolations(
  items: ContractExpenseCategoryItem[],
  vendorId: string,
  validate: ValidateLineFn
): Array<{ item: ContractExpenseCategoryItem; result: QuotationValidationResult }> {
  if (!vendorId) return [];
  const violations: Array<{ item: ContractExpenseCategoryItem; result: QuotationValidationResult }> = [];
  for (const item of items) {
    if (!item.categoryId || !item.pricePerUnit) continue;
    const result = validate({
      vendorId,
      categoryId: item.categoryId,
      transactionRate: item.pricePerUnit,
      unit: item.unit,
    });
    if (result.exceedsQuotation && result.validationEnabled) {
      violations.push({ item, result });
    }
  }
  return violations;
}
