import { create } from 'zustand';
import type { CollectionsAnalyticsFilters } from '../../../types/collectionsAnalytics.types';

function defaultFilters(): CollectionsAnalyticsFilters {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

interface State {
  filters: CollectionsAnalyticsFilters;
  setFilter: <K extends keyof CollectionsAnalyticsFilters>(key: K, value: CollectionsAnalyticsFilters[K]) => void;
  resetFilters: () => void;
}

export const useCollectionsAnalyticsFiltersStore = create<State>((set) => ({
  filters: defaultFilters(),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters() }),
}));
