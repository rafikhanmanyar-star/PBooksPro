import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppState } from '../../../types';
import { getPersistableStateFingerprint } from '../../../services/state/persistableStateFingerprint';
import {
    filterFundAvailabilityRows,
    getFundAvailabilityDetails,
    getFundAvailabilitySummary,
    portfolioMonthlyDistributable,
    projectMonthlyCashFlow,
    projectMonthlyDistributions,
    portfolioMonthlyCashFlow,
    portfolioWithdrawalsByMonth,
} from '../services/investorFundAvailability.service';
import type {
    FundAvailabilityFilters,
    FundAvailabilitySummary,
    FundAvailabilityDetails,
    ReservePolicy,
} from '../types/fundAvailability.types';
export function useFundAvailabilityPermissions(role: string | undefined) {
    return useMemo(() => {
        const r = role || '';
        const adminLike = ['Admin', 'SUPER_ADMIN', 'Manager', 'Accounts'].includes(r);
        return {
            viewFundAvailability: true,
            exportFundAvailability: adminLike,
            manageDistributionCycles: adminLike,
            approveWithdrawals: adminLike,
        };
    }, [role]);
}

export function useFundAvailabilitySummaryQuery(state: AppState, endDate: string, reservePolicy: ReservePolicy) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['investor-fund-availability-summary', endDate, fp, reservePolicy],
        queryFn: (): FundAvailabilitySummary => getFundAvailabilitySummary(state, endDate, reservePolicy),
        staleTime: 45_000,
    });
}

export function usePortfolioDistributableTrendQuery(
    state: AppState,
    endDate: string,
    reservePolicy: ReservePolicy
) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['investor-fund-availability-distributable-trend', endDate, fp, reservePolicy],
        queryFn: () => portfolioMonthlyDistributable(state, endDate, reservePolicy, 6),
        staleTime: 60_000,
    });
}

export function usePortfolioCashFlowTrendQuery(state: AppState, endDate: string) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['investor-fund-availability-portfolio-cf', endDate, fp],
        queryFn: () => portfolioMonthlyCashFlow(state, endDate, 6),
        staleTime: 60_000,
    });
}

export function usePortfolioWithdrawalsTrendQuery(state: AppState, endDate: string) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['investor-fund-availability-withdrawals-trend', endDate, fp],
        queryFn: () => portfolioWithdrawalsByMonth(state, endDate, 6),
        staleTime: 60_000,
    });
}

export function useProjectCashFlowTrendQuery(state: AppState, projectId: string | null, endDate: string, enabled: boolean) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['investor-fund-availability-cash-trend', projectId, endDate, fp],
        queryFn: () => (projectId ? projectMonthlyCashFlow(state, projectId, endDate, 6) : []),
        enabled: enabled && !!projectId,
        staleTime: 45_000,
    });
}

export function useProjectDistributionTrendQuery(state: AppState, projectId: string | null, endDate: string, enabled: boolean) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['investor-fund-availability-dist-trend', projectId, endDate, fp],
        queryFn: () => (projectId ? projectMonthlyDistributions(state, projectId, endDate, 6) : []),
        enabled: enabled && !!projectId,
        staleTime: 45_000,
    });
}

export function useFundAvailabilityDetailsQuery(
    state: AppState,
    projectId: string | null,
    endDate: string,
    reservePolicy: ReservePolicy,
    enabled: boolean
) {
    const fp = getPersistableStateFingerprint(state);
    return useQuery({
        queryKey: ['investor-fund-availability-details', projectId, endDate, fp, reservePolicy],
        queryFn: (): FundAvailabilityDetails | null =>
            projectId ? getFundAvailabilityDetails(state, projectId, endDate, reservePolicy) : null,
        enabled: enabled && !!projectId,
        staleTime: 45_000,
    });
}

export function useFilteredFundRows(
    summary: FundAvailabilitySummary | undefined,
    state: AppState,
    endDate: string,
    filters: FundAvailabilityFilters
) {
    return useMemo(() => {
        if (!summary) return [];
        return filterFundAvailabilityRows(summary.rows, state, endDate, filters);
    }, [summary, state, endDate, filters]);
}
