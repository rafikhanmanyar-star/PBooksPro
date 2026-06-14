import { create } from 'zustand';
import type { SellingAnalyticsFilters } from '../../../types/sellingAnalytics.types';

function defaultFilters(): SellingAnalyticsFilters {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

interface State {
  filters: SellingAnalyticsFilters;
  setFilter: <K extends keyof SellingAnalyticsFilters>(key: K, value: SellingAnalyticsFilters[K]) => void;
  resetFilters: () => void;
}

export const useSellingAnalyticsFiltersStore = create<State>((set) => ({
  filters: defaultFilters(),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters() }),
}));
