import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FundAvailabilityFilters, ReservePolicy } from '../types/fundAvailability.types';

const defaultFilters = (): FundAvailabilityFilters => ({
    search: '',
    dateTo: '',
    projectId: 'all',
    investorId: 'all',
    projectStatus: 'all',
    liquidityHealth: 'all',
    city: 'all',
    tag: '',
    distributionCycleKey: 'all',
    withdrawalStatus: 'all',
});

const defaultReserve = (): ReservePolicy => ({ mode: 'percent', percent: 20 });

interface FundAvailabilityFiltersState {
    filters: FundAvailabilityFilters;
    reservePolicy: ReservePolicy;
    savedPresets: { name: string; filters: FundAvailabilityFilters }[];
    setFilter: <K extends keyof FundAvailabilityFilters>(key: K, value: FundAvailabilityFilters[K]) => void;
    setReservePolicy: (p: ReservePolicy) => void;
    resetFilters: () => void;
    savePreset: (name: string) => void;
    loadPreset: (name: string) => void;
    deletePreset: (name: string) => void;
}

export const useFundAvailabilityFiltersStore = create<FundAvailabilityFiltersState>()(
    persist(
        (set, get) => ({
            filters: defaultFilters(),
            reservePolicy: defaultReserve(),
            savedPresets: [],
            setFilter: (key, value) =>
                set((s) => ({
                    filters: { ...s.filters, [key]: value },
                })),
            setReservePolicy: (p) => set({ reservePolicy: p }),
            resetFilters: () =>
                set({
                    filters: { ...defaultFilters(), dateTo: get().filters.dateTo },
                }),
            savePreset: (name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                const { filters, savedPresets } = get();
                const next = savedPresets.filter((p) => p.name !== trimmed).concat({ name: trimmed, filters: { ...filters } });
                set({ savedPresets: next });
            },
            loadPreset: (name) => {
                const p = get().savedPresets.find((x) => x.name === name);
                if (p) set({ filters: { ...p.filters } });
            },
            deletePreset: (name) => set({ savedPresets: get().savedPresets.filter((p) => p.name !== name) }),
        }),
        {
            name: 'pbooks-fund-availability-v1',
            partialize: (s) => ({
                savedPresets: s.savedPresets,
                reservePolicy: s.reservePolicy,
            }),
        }
    )
);
