export interface RentalAnalyticsFilters {
  from: string;
  to: string;
  propertyId?: string;
  buildingId?: string;
}

export interface RentalKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface OccupancyTrendPoint {
  month: string;
  label: string;
  occupied: number;
  total: number;
  rate: number;
}

export interface RentCollectionPoint {
  month: string;
  label: string;
  due: number;
  collected: number;
}

export interface PropertyPerformanceRow {
  propertyId: string;
  propertyName: string;
  collected: number;
}

export interface LeaseExpiryPoint {
  month: string;
  label: string;
  count: number;
}

export interface RentalAnalyticsResponse {
  filters: RentalAnalyticsFilters;
  generatedAt: string;
  kpis: RentalKpiValue[];
  occupancyTrend: OccupancyTrendPoint[];
  rentCollectionTrend: RentCollectionPoint[];
  propertyPerformance: PropertyPerformanceRow[];
  leaseExpiryForecast: LeaseExpiryPoint[];
}
