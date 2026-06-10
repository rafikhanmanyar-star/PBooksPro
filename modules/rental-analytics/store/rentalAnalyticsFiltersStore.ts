import { create } from 'zustand';
import type { RentalAnalyticsFilters } from '../../../types/rentalAnalytics.types';

function defaultFilters(): RentalAnalyticsFilters {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

interface State {
  filters: RentalAnalyticsFilters;
  setFilter: <K extends keyof RentalAnalyticsFilters>(key: K, value: RentalAnalyticsFilters[K]) => void;
  resetFilters: () => void;
}

export const useRentalAnalyticsFiltersStore = create<State>((set) => ({
  filters: defaultFilters(),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters() }),
}));
