export interface VendorAnalyticsFilters {
  from: string;
  to: string;
  vendorId?: string;
}

export interface VendorKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface VendorAnalyticsResponse {
  filters: VendorAnalyticsFilters;
  generatedAt: string;
  kpis: VendorKpiValue[];
  spendTrend: { month: string; label: string; amount: number }[];
  topVendorsBySpend: { vendorId: string; vendorName: string; amount: number }[];
  payableByVendor: { vendorId: string; vendorName: string; outstanding: number }[];
  billStatus: { name: string; value: number }[];
}
