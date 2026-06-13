export type QuotationValidationScope = 'CATEGORY' | 'ITEM';

export type QuotationPriceSeverity = 'WITHIN' | 'LOW' | 'HIGH' | 'NONE';

export interface QuotationValidationItem {
  id: string;
  categoryId: string;
  pricePerQuantity: number;
  unit?: string;
}

export interface QuotationValidationRecord {
  id: string;
  vendorId: string;
  quotationNumber?: string;
  name: string;
  date: string;
  expiryDate?: string;
  enablePriceValidation: boolean;
  validationScope: QuotationValidationScope;
  isActive: boolean;
  items: QuotationValidationItem[];
}

export interface ProcurementSettings {
  enableQuotationValidationGlobally: boolean;
  showWarningOnly: boolean;
  /** Future approval workflow threshold (%). Not enforced yet. */
  varianceApprovalThreshold: number;
}

export const DEFAULT_PROCUREMENT_SETTINGS: ProcurementSettings = {
  enableQuotationValidationGlobally: true,
  showWarningOnly: true,
  varianceApprovalThreshold: 10,
};

export interface RateValidationInput {
  vendorId: string;
  categoryId: string;
  transactionRate: number;
  unit?: string;
  /** YYYY-MM-DD — defaults to today when matching expiry */
  asOfDate?: string;
}

export interface QuotationValidationResult {
  quotationFound: boolean;
  validationEnabled: boolean;
  quotedRate?: number;
  transactionRate: number;
  varianceAmount?: number;
  variancePercentage?: number;
  severity: QuotationPriceSeverity;
  quotationReference?: string;
  quotationId?: string;
  quotationDate?: string;
  expiryDate?: string;
  validationScope?: QuotationValidationScope;
  /** True when rate exceeds quoted and validation is active */
  exceedsQuotation: boolean;
  /** Future: would require approval if variance exceeds tenant threshold */
  wouldRequireApproval?: boolean;
}

export interface QuotationReferenceInfo {
  quotationId: string;
  quotationNumber?: string;
  vendorId: string;
  vendorName?: string;
  categoryId?: string;
  categoryName?: string;
  itemLabel?: string;
  quotedRate: number;
  quotationDate: string;
  expiryDate?: string;
  enablePriceValidation: boolean;
  validationScope: QuotationValidationScope;
}

export interface QuotationComplianceFilters {
  dateFrom?: string;
  dateTo?: string;
  vendorId?: string;
  projectId?: string;
  categoryId?: string;
}

export interface QuotationComplianceMetrics {
  purchasesWithinQuotation: number;
  purchasesAboveQuotation: number;
  totalVarianceAmount: number;
  savingsAchieved: number;
  topVendorsByVariance: Array<{
    vendorId: string;
    vendorName?: string;
    varianceAmount: number;
    overrideCount: number;
  }>;
}
