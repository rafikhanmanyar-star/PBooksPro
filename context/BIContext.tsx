
import React, { createContext, useContext, useState, useMemo } from 'react';
import {
    BIKPI,
    SalesTrendData,
    StoreRanking,
    CategoryPerformance,
    CashierMetric,
    CustomerSegmentData
} from '../types/bi';
import { analyticsApi } from '../services/api/analyticsApi';

interface BIContextType {
    kpis: BIKPI[];
    salesTrend: SalesTrendData[];
    storeRankings: StoreRanking[];
    categoryPerformance: CategoryPerformance[];
    cashierMetrics: CashierMetric[];
    customerSegments: CustomerSegmentData[];

    // Filters
    dateRange: string;
    setDateRange: (range: string) => void;
    selectedStoreId: string | 'all';
    setSelectedStoreId: (id: string | 'all') => void;
}

const BIContext = createContext<BIContextType | undefined>(undefined);

export const BIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [dateRange, setDateRange] = useState('MTD');
    const [selectedStoreId, setSelectedStoreId] = useState<'all' | string>('all');

    const [kpis, setKpis] = useState<BIKPI[]>([]);
    const [salesTrend, setSalesTrend] = useState<SalesTrendData[]>([]);
    const [storeRankings, setStoreRankings] = useState<StoreRanking[]>([]);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [kpisData, trendData, rankingData] = await Promise.all([
                    analyticsApi.getKPIs(dateRange),
                    analyticsApi.getSalesTrend(dateRange),
                    analyticsApi.getStoreRankings(dateRange)
                ]);
                setKpis(kpisData);
                setSalesTrend(trendData);
                setStoreRankings(rankingData);
            } catch (error) {
                console.error('Failed to fetch BI data:', error);
            }
        };
        fetchData();
    }, [dateRange]);


    const categoryPerformance: CategoryPerformance[] = useMemo(() => [
        { category: 'Sanitary Ware', revenue: 4500000, stockValue: 12000000, turnoverRate: 3.2 },
        { category: 'Tiles & Ceramics', revenue: 8200000, stockValue: 25000000, turnoverRate: 2.8 },
        { category: 'CP Fittings', revenue: 3100000, stockValue: 8000000, turnoverRate: 4.1 },
    ], []);

    const cashierMetrics: CashierMetric[] = useMemo(() => [
        { name: 'Zubair Shah', sales: 450000, aov: 3200, voidCount: 2, discountTotal: 4500 },
        { name: 'Mariam Ali', sales: 380000, aov: 3100, voidCount: 0, discountTotal: 1200 },
        { name: 'Kamran Jaffar', sales: 420000, aov: 3400, voidCount: 5, discountTotal: 8900 },
    ], []);

    const customerSegments: CustomerSegmentData[] = useMemo(() => [
        { segment: 'Champions', count: 120, revenue: 12500000, clv: 104000 },
        { segment: 'Loyal Customers', count: 450, revenue: 8900000, clv: 19700 },
        { segment: 'At Risk', count: 85, revenue: 1200000, clv: 14000 },
    ], []);

    const value = {
        kpis,
        salesTrend,
        storeRankings,
        categoryPerformance,
        cashierMetrics,
        customerSegments,
        dateRange,
        setDateRange,
        selectedStoreId,
        setSelectedStoreId
    };

    return <BIContext.Provider value={value}>{children}</BIContext.Provider>;
};

export const useBI = () => {
    const context = useContext(BIContext);
    if (!context) throw new Error('useBI must be used within a BIProvider');
    return context;
};
