
export interface BIKPI {
    label: string;
    value: string | number;
    trend: number;
    status: 'up' | 'down' | 'neutral';
    sparkline: number[];
}

export interface SalesTrendData {
    timestamp: string;
    revenue: number;
    orders: number;
    profit: number;
}

export interface StoreRanking {
    storeName: string;
    revenue: number;
    growth: number;
    margin: number;
}

export interface CategoryPerformance {
    category: string;
    revenue: number;
    stockValue: number;
    turnoverRate: number;
}

export interface CashierMetric {
    name: string;
    sales: number;
    aov: number;
    voidCount: number;
    discountTotal: number;
}

export interface CustomerSegmentData {
    segment: string;
    count: number;
    revenue: number;
    clv: number;
}
