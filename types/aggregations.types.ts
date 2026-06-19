export type OwnerBalanceAggregationRow = {
  ownerId: string;
  totalCollected: number;
  totalSettled: number;
  outstandingBalance: number;
  serviceCharges: number;
  netPayable: number;
};

export type OwnerBalancesAggregationResponse = {
  generatedAt: string;
  rows: OwnerBalanceAggregationRow[];
};

export type VendorBalanceAggregationRow = {
  vendorId: string;
  totalBills: number;
  totalPayments: number;
  outstandingBalance: number;
};

export type VendorBalancesAggregationResponse = {
  generatedAt: string;
  rows: VendorBalanceAggregationRow[];
};

export type BrokerBalanceAggregationRow = {
  brokerId: string;
  commissionsEarned: number;
  commissionsPaid: number;
  outstandingCommission: number;
};

export type BrokerBalancesAggregationResponse = {
  generatedAt: string;
  context: 'all' | 'Rental' | 'Project';
  rows: BrokerBalanceAggregationRow[];
};

export type DashboardKpiAggregationResponse = {
  generatedAt: string;
  from: string;
  to: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  occupancyRate: number;
  ownerPayables: number;
  overdueInvoices: number;
};
