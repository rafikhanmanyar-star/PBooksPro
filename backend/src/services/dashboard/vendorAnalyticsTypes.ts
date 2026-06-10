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

export interface VendorMonthPoint {
  month: string;
  label: string;
  amount: number;
}

export interface VendorSpendRow {
  vendorId: string;
  vendorName: string;
  amount: number;
}

export interface VendorPayableRow {
  vendorId: string;
  vendorName: string;
  outstanding: number;
}

export interface BillStatusSlice {
  name: string;
  value: number;
}

export interface VendorAnalyticsResponse {
  filters: VendorAnalyticsFilters;
  generatedAt: string;
  kpis: VendorKpiValue[];
  spendTrend: VendorMonthPoint[];
  topVendorsBySpend: VendorSpendRow[];
  payableByVendor: VendorPayableRow[];
  billStatus: BillStatusSlice[];
}
