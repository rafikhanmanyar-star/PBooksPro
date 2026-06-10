import { create } from 'zustand';
import type { ExpenseAnalyticsFilters, ExpenseScope } from '../../../types/expenseAnalytics.types';

function defaultFilters(defaultScope: ExpenseScope = 'all'): ExpenseAnalyticsFilters {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}`, scope: defaultScope };
}

interface State {
  filters: ExpenseAnalyticsFilters;
  setFilter: <K extends keyof ExpenseAnalyticsFilters>(key: K, value: ExpenseAnalyticsFilters[K]) => void;
  resetFilters: (scope?: ExpenseScope) => void;
}

export const useExpenseAnalyticsFiltersStore = create<State>((set) => ({
  filters: defaultFilters(),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: (scope) => set({ filters: defaultFilters(scope) }),
}));
