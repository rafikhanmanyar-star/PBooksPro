
import { apiClient } from './client';
import { BIKPI, SalesTrendData, StoreRanking } from '../../types/bi';

export const analyticsApi = {
    getKPIs: (range: string = 'MTD') => apiClient.get<BIKPI[]>(`/analytics/kpis?range=${range}`),
    getSalesTrend: (range: string = 'MTD') => apiClient.get<SalesTrendData[]>(`/analytics/sales-trend?range=${range}`),
    getStoreRankings: (range: string = 'MTD') => apiClient.get<StoreRanking[]>(`/analytics/store-rankings?range=${range}`),
    // Add others as needed
};
