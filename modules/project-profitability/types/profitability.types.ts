import type { ProfitLossSubType } from '../../../types';

/** Single project row for the profitability grid */
export interface ProjectProfitabilityRow {
    projectId: string;
    projectName: string;
    projectStatus?: string;
    projectType?: string;
    city?: string;
    completionPct: number;
    unitsSold: number;
    unitsRemaining: number;
    unitsTotal: number;
    revenue: number;
    expense: number;
    grossProfit: number;
    netProfit: number;
    adjustedProfit: number;
    realizedProfit: number;
    unsoldInventoryValue: number;
    receivable: number;
    cashReceived: number;
    payables: number;
    investorCapital: number;
    roiPct: number | null;
    lastUpdated: string | null;
    brokerNames: string[];
    rowStatus: ProfitabilityRowStatus;
}

export type ProfitabilityRowStatus = 'Profitable' | 'Loss' | 'Ongoing' | 'Completed';

export interface ProjectProfitabilityFilters {
    search: string;
    dateTo: string;
    projectStatus: string;
    investorId: string;
    projectType: string;
    city: string;
    completionMin: string;
    completionMax: string;
    profitability: 'all' | 'profitable' | 'loss' | 'breakeven';
    brokerId: string;
    tag: string;
}

export interface RevenueBreakdown {
    installment: number;
    serviceCharge: number;
    rental: number;
    securityDeposit: number;
    otherIncomeFromPl: number;
}

export interface ExpenseBreakdownBucket {
    key: string;
    label: string;
    amount: number;
}

export interface InvestorLedgerBreakdown {
    deposits: number;
    withdrawals: number;
    profitAllocations: number;
}

export interface InventoryAnalytics {
    soldUnits: number;
    unsoldUnits: number;
    marketValueUnsold: number;
    /** Oldest unsold unit “age” in days from first agreement touching a unit, when derivable */
    oldestUnsoldDays: number | null;
}

export interface MonthlyProfitPoint {
    monthKey: string;
    label: string;
    revenue: number;
    expense: number;
    netProfit: number;
}

export interface ProjectProfitabilityDetails {
    projectId: string;
    projectName: string;
    projectStatus?: string;
    completionPct: number;
    revenue: number;
    expense: number;
    netProfit: number;
    adjustedProfit: number;
    realizedProfit: number;
    unsoldInventoryValue: number;
    investorCapital: number;
    roiPct: number | null;
    revenueBreakdown: RevenueBreakdown;
    expenseBreakdown: ExpenseBreakdownBucket[];
    investorLedger: InvestorLedgerBreakdown;
    inventory: InventoryAnalytics;
    monthlyTrend: MonthlyProfitPoint[];
    /** Top-level P&L category totals for traceability */
    plCategoryRollup: { categoryId: string; name: string; plSubType?: ProfitLossSubType; amount: number; type: 'income' | 'expense' }[];
}

export interface PortfolioProfitabilitySummary {
    asOfDate: string;
    totalRevenue: number;
    totalExpense: number;
    netProfit: number;
    adjustedProfit: number;
    totalUnsoldInventoryValue: number;
    roiPctAggregate: number | null;
    activeProjects: number;
    profitableProjects: number;
    lossProjects: number;
    /** Sum of investor capital (net contributed) across projects */
    totalInvestorCapital: number;
    rows: ProjectProfitabilityRow[];
}
