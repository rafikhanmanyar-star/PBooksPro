
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


    const categoryPerformance: CategoryPerformance[] = useMemo(() => [], []);

    const cashierMetrics: CashierMetric[] = useMemo(() => [], []);

    const customerSegments: CustomerSegmentData[] = useMemo(() => [], []);

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
