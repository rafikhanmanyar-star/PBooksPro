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

export interface SellingAnalyticsResponse {
  filters: SellingAnalyticsFilters;
  generatedAt: string;
  kpis: SellingKpiValue[];
  salesTrend: { month: string; label: string; salesValue: number; collected: number; invoiced: number }[];
  unitPipeline: { name: string; value: number }[];
  agreementStatus: { name: string; value: number }[];
  collectionTrend: { month: string; label: string; invoiced: number; collected: number }[];
  topProjects: { projectId: string; projectName: string; salesValue: number }[];
}
