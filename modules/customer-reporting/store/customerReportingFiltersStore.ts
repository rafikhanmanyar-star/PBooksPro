import { create } from 'zustand';
import type { CustomerReportTab, CustomerReportingFilters } from '../../../types/customerReporting.types';
import { toLocalDateString } from '../../../utils/dateUtils';

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { from, to };
}

const { from, to } = defaultDateRange();

interface CustomerReportingFiltersState {
  filters: CustomerReportingFilters;
  activeTab: CustomerReportTab;
  generated: boolean;
  setFilter: <K extends keyof CustomerReportingFilters>(key: K, value: CustomerReportingFilters[K]) => void;
  setActiveTab: (tab: CustomerReportTab) => void;
  setGenerated: (v: boolean) => void;
  resetFilters: () => void;
}

export const useCustomerReportingFiltersStore = create<CustomerReportingFiltersState>((set) => ({
  filters: { from, to },
  activeTab: 'ledger',
  generated: false,
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value }, generated: false })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setGenerated: (v) => set({ generated: v }),
  resetFilters: () => set({ filters: { from, to }, generated: false }),
}));
