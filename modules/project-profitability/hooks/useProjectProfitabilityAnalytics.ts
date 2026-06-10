import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppState } from '../../../types';
import { getPersistableStateFingerprint } from '../../../services/database/persistableStateFingerprint';
import {
    filterProfitabilityRows,
    getProjectProfitabilityDetails,
    getProjectProfitabilitySummary,
    portfolioCollectionTrend,
    portfolioMonthlyTrend,
} from '../services/projectProfitability.service';
import type { ProjectProfitabilityDetails, PortfolioProfitabilitySummary } from '../types/profitability.types';

export interface ProfitabilityPermissions {
    canView: boolean;
    canExport: boolean;
    canManageFilters: boolean;
}

export function useProfitabilityPermissions(role: string | undefined): ProfitabilityPermissions {
    return useMemo(() => {
        const r = role || '';
        const elevated = ['Admin', 'SUPER_ADMIN', 'Manager', 'Accounts'].includes(r);
        return {
            canView: true,
            canExport: elevated,
            canManageFilters: true,
        };
    }, [role]);
}

export function useProjectProfitabilitySummaryQuery(state: AppState, endDate: string) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['project-profitability-summary', endDate, fp],
        queryFn: (): PortfolioProfitabilitySummary => getProjectProfitabilitySummary(state, endDate),
        staleTime: 45_000,
    });
}

export function usePortfolioMonthlyTrendQuery(state: AppState, endDate: string) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['project-profitability-monthly', endDate, fp],
        queryFn: () => portfolioMonthlyTrend(state, endDate, 12),
        staleTime: 60_000,
    });
}

export function usePortfolioCollectionTrendQuery(state: AppState, endDate: string) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['project-profitability-collection', endDate, fp],
        queryFn: () => portfolioCollectionTrend(state, endDate, 12),
        staleTime: 60_000,
    });
}

export function useProjectProfitabilityDetailsQuery(state: AppState, projectId: string | null, endDate: string, enabled: boolean) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['project-profitability-details', projectId, endDate, fp],
        queryFn: (): ProjectProfitabilityDetails | null =>
            projectId ? getProjectProfitabilityDetails(state, projectId, endDate) : null,
        enabled: enabled && !!projectId,
        staleTime: 45_000,
    });
}

export function useFilteredProfitabilityRows(
    summary: PortfolioProfitabilitySummary | undefined,
    state: AppState,
    endDate: string,
    filters: Parameters<typeof filterProfitabilityRows>[3]
) {
    return useMemo(() => {
        if (!summary) return [];
        return filterProfitabilityRows(summary.rows, state, endDate, filters);
    }, [summary, state, endDate, filters]);
}
