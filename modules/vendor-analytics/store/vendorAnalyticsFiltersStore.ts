import { create } from 'zustand';
import type { VendorAnalyticsFilters } from '../../../types/vendorAnalytics.types';

function defaultFilters(): VendorAnalyticsFilters {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

interface State {
  filters: VendorAnalyticsFilters;
  setFilter: <K extends keyof VendorAnalyticsFilters>(key: K, value: VendorAnalyticsFilters[K]) => void;
  resetFilters: () => void;
}

export const useVendorAnalyticsFiltersStore = create<State>((set) => ({
  filters: defaultFilters(),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters() }),
}));
