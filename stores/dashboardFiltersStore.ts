import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardComparisonPeriod, DashboardDatePreset, DashboardFilters } from '../types/dashboardMetrics.types';

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveDatePreset(preset: DashboardDatePreset): { from: string; to: string } {
  const now = new Date();
  const today = toDateOnly(now);

  switch (preset) {
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateOnly(start), to: toDateOnly(end) };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { from: toDateOnly(start), to: today };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: toDateOnly(start), to: today };
    }
    case 'last_30_days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { from: toDateOnly(start), to: today };
    }
    case 'this_month':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateOnly(start), to: today };
    }
  }
}

const defaultFilters = (): DashboardFilters => {
  const { from, to } = resolveDatePreset('this_month');
  return {
    from,
    to,
    comparisonPeriod: 'previous_period',
    projectId: undefined,
    buildingId: undefined,
    propertyId: undefined,
    vendorId: undefined,
    customerId: undefined,
    branchId: undefined,
    companyId: undefined,
    salesAgentId: undefined,
  };
};

interface DashboardFiltersState {
  filters: DashboardFilters;
  datePreset: DashboardDatePreset;
  savedViews: { name: string; filters: DashboardFilters }[];
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  setDatePreset: (preset: DashboardDatePreset) => void;
  setDateRange: (from: string, to: string) => void;
  resetFilters: () => void;
  saveView: (name: string) => void;
  loadView: (name: string) => void;
  deleteView: (name: string) => void;
}

export const useDashboardFiltersStore = create<DashboardFiltersState>()(
  persist(
    (set, get) => ({
      filters: defaultFilters(),
      datePreset: 'this_month',
      savedViews: [],
      setFilter: (key, value) =>
        set((s) => ({
          filters: { ...s.filters, [key]: value },
          datePreset: key === 'from' || key === 'to' ? 'custom' : s.datePreset,
        })),
      setDatePreset: (preset) => {
        if (preset === 'custom') {
          set({ datePreset: preset });
          return;
        }
        const range = resolveDatePreset(preset);
        set((s) => ({
          datePreset: preset,
          filters: { ...s.filters, from: range.from, to: range.to },
        }));
      },
      setDateRange: (from, to) =>
        set((s) => ({
          datePreset: 'custom',
          filters: { ...s.filters, from, to },
        })),
      resetFilters: () => set({ filters: defaultFilters(), datePreset: 'this_month' }),
      saveView: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const { filters, savedViews } = get();
        set({
          savedViews: savedViews.filter((v) => v.name !== trimmed).concat({ name: trimmed, filters: { ...filters } }),
        });
      },
      loadView: (name) => {
        const view = get().savedViews.find((v) => v.name === name);
        if (view) set({ filters: { ...view.filters }, datePreset: 'custom' });
      },
      deleteView: (name) => set({ savedViews: get().savedViews.filter((v) => v.name !== name) }),
    }),
    {
      name: 'pbooks-dashboard-filters-v1',
      partialize: (s) => ({ savedViews: s.savedViews, datePreset: s.datePreset }),
    }
  )
);
