import { create } from 'zustand';
import type { RentalReportTab, RentalReportingFilters } from '../../../types/rentalReporting.types';
import { toLocalDateString } from '../../../utils/dateUtils';

function defaultRange() {
  const now = new Date();
  return {
    from: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

const { from, to } = defaultRange();

interface State {
  filters: RentalReportingFilters;
  activeTab: RentalReportTab;
  generated: boolean;
  setFilter: <K extends keyof RentalReportingFilters>(key: K, value: RentalReportingFilters[K]) => void;
  setActiveTab: (tab: RentalReportTab) => void;
  setGenerated: (v: boolean) => void;
}

export const useRentalReportingFiltersStore = create<State>((set) => ({
  filters: { from, to },
  activeTab: 'ledger',
  generated: false,
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value }, generated: false })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setGenerated: (v) => set({ generated: v }),
}));
