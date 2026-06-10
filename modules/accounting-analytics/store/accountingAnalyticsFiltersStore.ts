import { create } from 'zustand';
import type { AccountingAnalyticsFilters } from '../../../types/accountingAnalytics.types';

function defaultFilters(): AccountingAnalyticsFilters {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-01-01`, to: `${y}-${m}-${d}` };
}

interface State {
  filters: AccountingAnalyticsFilters;
  setFilter: <K extends keyof AccountingAnalyticsFilters>(key: K, value: AccountingAnalyticsFilters[K]) => void;
  resetFilters: () => void;
}

export const useAccountingAnalyticsFiltersStore = create<State>((set) => ({
  filters: defaultFilters(),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters() }),
}));
