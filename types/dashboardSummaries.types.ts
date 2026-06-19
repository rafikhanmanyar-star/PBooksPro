export type FinancialSummary = {
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

export type RentalArBreakdown = {
  rentalDueAmount: number;
  rentalPaidAmount: number;
  securityDueAmount: number;
  securityPaidAmount: number;
  totalDueAmount: number;
  totalPaidAmount: number;
  totalInvoiceCount: number;
};

export type RentalSummary = {
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

export type InventorySummary = {
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

export type ProjectSummary = {
  generatedAt: string;
  totalValue: number;
  totalPaid: number;
  totalOutstanding: number;
  totalAgreements: number;
  totalUnits: number;
};

export type ProcurementSummary = {
  generatedAt: string;
  activeQuotations: number;
  expiringQuotations: number;
  priceIncreaseAlerts: number;
  lowestVendorRatesCount: number;
};
