export interface SellingAnalyticsFilters {
  from: string;
  to: string;
  projectId?: string;
}

export interface SellingKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface SellingMonthPoint {
  month: string;
  label: string;
  salesValue: number;
  collected: number;
  invoiced: number;
}

export interface UnitPipelineSlice {
  name: string;
  value: number;
}

export interface AgreementStatusSlice {
  name: string;
  value: number;
}

export interface TopProjectRow {
  projectId: string;
  projectName: string;
  salesValue: number;
}

export interface SellingAnalyticsResponse {
  filters: SellingAnalyticsFilters;
  generatedAt: string;
  kpis: SellingKpiValue[];
  salesTrend: SellingMonthPoint[];
  unitPipeline: UnitPipelineSlice[];
  agreementStatus: AgreementStatusSlice[];
  collectionTrend: { month: string; label: string; invoiced: number; collected: number }[];
  topProjects: TopProjectRow[];
}
