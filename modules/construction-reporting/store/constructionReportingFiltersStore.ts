import { create } from 'zustand';
import type { ConstructionReportTab, ConstructionReportingFilters } from '../../../types/constructionReporting.types';
import { toLocalDateString } from '../../../utils/dateUtils';

const { from, to } = (() => {
  const now = new Date();
  return {
    from: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
})();

interface State {
  filters: ConstructionReportingFilters;
  activeTab: ConstructionReportTab;
  generated: boolean;
  setFilter: <K extends keyof ConstructionReportingFilters>(key: K, value: ConstructionReportingFilters[K]) => void;
  setActiveTab: (tab: ConstructionReportTab) => void;
  setGenerated: (v: boolean) => void;
}

export const useConstructionReportingFiltersStore = create<State>((set) => ({
  filters: { from, to },
  activeTab: 'ledger',
  generated: false,
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value }, generated: false })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setGenerated: (v) => set({ generated: v }),
}));
