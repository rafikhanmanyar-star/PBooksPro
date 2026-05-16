import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProjectProfitabilityFilters } from '../types/profitability.types';

const defaultFilters = (): ProjectProfitabilityFilters => ({
    search: '',
    dateTo: '',
    projectStatus: 'all',
    investorId: 'all',
    projectType: 'all',
    city: 'all',
    completionMin: '',
    completionMax: '',
    profitability: 'all',
    brokerId: 'all',
    tag: '',
});

interface ProfitabilityFiltersState {
    filters: ProjectProfitabilityFilters;
    savedPresets: { name: string; filters: ProjectProfitabilityFilters }[];
    setFilter: <K extends keyof ProjectProfitabilityFilters>(key: K, value: ProjectProfitabilityFilters[K]) => void;
    resetFilters: () => void;
    savePreset: (name: string) => void;
    loadPreset: (name: string) => void;
    deletePreset: (name: string) => void;
}

export const useProfitabilityFiltersStore = create<ProfitabilityFiltersState>()(
    persist(
        (set, get) => ({
            filters: defaultFilters(),
            savedPresets: [],
            setFilter: (key, value) =>
                set((s) => ({
                    filters: { ...s.filters, [key]: value },
                })),
            resetFilters: () => set({ filters: { ...defaultFilters(), dateTo: get().filters.dateTo } }),
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
        { name: 'pbooks-profitability-filters-v1', partialize: (s) => ({ savedPresets: s.savedPresets }) }
    )
);
