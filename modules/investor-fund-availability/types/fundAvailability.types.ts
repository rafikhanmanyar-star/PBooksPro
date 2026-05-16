export type FundHealthStatus = 'Healthy' | 'Warning' | 'Blocked' | 'Overdrawn';

export type ReservePolicy =
    | { mode: 'percent'; percent: number }
    | { mode: 'fixed'; amount: number };

export interface FundAvailabilityFilters {
    search: string;
    dateTo: string;
    projectId: string;
    investorId: string;
    projectStatus: string;
    liquidityHealth: 'all' | FundHealthStatus;
    city: string;
    tag: string;
    distributionCycleKey: string;
    withdrawalStatus: 'all' | 'has_withdrawals' | 'none';
}

export interface FundAvailabilityRow {
    projectId: string;
    projectName: string;
    projectStatus: string;
    city: string | null;
    completionPct: number;
    /** Gross investor deposits (principal), before allocated profit. */
    investorCapital: number;
    allocatedProfit: number;
    /** Book equity: capital + allocated profit − withdrawals. */
    investorEquity: number;
    /** Sum of project-scoped cash/bank balances (liquid). */
    availableCash: number;
    reservedFunds: number;
    pendingPayables: number;
    distributableFunds: number;
    totalWithdrawn: number;
    /** Same as book equity after withdrawals (see report copy). */
    remainingEquity: number;
    liquidityRatio: number | null;
    fundHealth: FundHealthStatus;
    lastDistributionDate: string | null;
    lastUpdated: string | null;
    realizedRevenueCash: number;
    totalExpense: number;
    realizedProfitCash: number;
}

export interface FundAvailabilityTotals {
    investorEquity: number;
    availableCash: number;
    distributableFunds: number;
    totalWithdrawn: number;
    reservedFunds: number;
    pendingPayables: number;
    investorCapital: number;
}

export interface FundAvailabilitySummary {
    asOfDate: string;
    rows: FundAvailabilityRow[];
    totals: FundAvailabilityTotals;
    healthyProjects: number;
    warningProjects: number;
    blockedProjects: number;
    overdrawnProjects: number;
}

export interface DistributionCycleEntry {
    id: string;
    date: string;
    label: string;
    amount: number;
    batchId: string | null;
}

export interface WithdrawalLedgerEntry {
    id: string;
    date: string;
    amount: number;
    description: string;
    investorAccountId: string;
    investorName: string;
    bankAccountId: string | null;
}

export interface MonthlyCashFlowPoint {
    monthKey: string;
    label: string;
    inflow: number;
    outflow: number;
    net: number;
}

export interface MonthlyDistributionPoint {
    monthKey: string;
    label: string;
    amount: number;
}

export interface FundAvailabilityDetails {
    projectId: string;
    projectName: string;
    projectStatus: string;
    completionPct: number;
    investorNames: string[];
    equity: {
        capital: number;
        allocatedProfit: number;
        withdrawals: number;
        investorEquity: number;
    };
    cashFlow: {
        cashInflow: number;
        cashOutflow: number;
        availableCash: number;
        reservedFunds: number;
        pendingPayables: number;
        distributableFunds: number;
    };
    realizedRevenueCash: number;
    totalExpense: number;
    realizedProfitCash: number;
    distributionHistory: DistributionCycleEntry[];
    withdrawalHistory: WithdrawalLedgerEntry[];
    analytics: {
        liquidityRatio: number | null;
        distributionPctOfEquity: number | null;
        safeWithdrawalMax: number;
        fundHealth: FundHealthStatus;
    };
}

export interface WithdrawalValidationResult {
    ok: boolean;
    distributableFunds: number;
    requestedAmount: number;
    shortfall: number;
    messages: string[];
    reservePolicy: ReservePolicy;
}

export interface FundAvailabilityPermissions {
    viewFundAvailability: boolean;
    exportFundAvailability: boolean;
    manageDistributionCycles: boolean;
    approveWithdrawals: boolean;
}
