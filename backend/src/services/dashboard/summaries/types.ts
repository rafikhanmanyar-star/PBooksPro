import type { DashboardFilters } from '../dashboardMetricsTypes.js';

export type FinancialSummaryResponse = {
  generatedAt: string;
  from: string;
  to: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  cashPosition: number;
  bankBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  operatingCashFlow: number;
};

export type RentalSummaryFilters = {
  buildingId?: string;
  propertyId?: string;
  /** active | expiring | renewed | terminated | all */
  status?: string;
  search?: string;
  includeArBreakdown?: boolean;
};

export type RentalArBreakdown = {
  rentalDueAmount: number;
  rentalPaidAmount: number;
  securityDueAmount: number;
  securityPaidAmount: number;
  totalDueAmount: number;
  totalPaidAmount: number;
  totalInvoiceCount: number;
};

export type RentalSummaryResponse = {
  generatedAt: string;
  occupancyRate: number;
  activeAgreements: number;
  overdueInvoices: number;
  ownerPayables: number;
  activeMonthlyRent: number;
  activeSecurityDeposits: number;
  expiringAgreementsCount: number;
  arBreakdown?: RentalArBreakdown;
};

export type InventorySummaryResponse = {
  generatedAt: string;
  totalItems: number;
  projectCount: number;
  buildingCount: number;
  propertyCount: number;
  unitCount: number;
  inventoryValue: number;
  availableUnits: number;
  lowStockItems: number;
  pendingProcurement: number;
};

export type ProjectSummaryFilters = {
  from?: string;
  to?: string;
  projectId?: string;
  clientId?: string;
  unitId?: string;
  search?: string;
};

export type ProjectSummaryResponse = {
  generatedAt: string;
  totalValue: number;
  totalPaid: number;
  totalOutstanding: number;
  totalAgreements: number;
  totalUnits: number;
};

export type ProcurementSummaryResponse = {
  generatedAt: string;
  activeQuotations: number;
  expiringQuotations: number;
  priceIncreaseAlerts: number;
  lowestVendorRatesCount: number;
};

export type { DashboardFilters };
