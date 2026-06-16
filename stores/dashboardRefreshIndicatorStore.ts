import { create } from 'zustand';

interface DashboardRefreshIndicatorState {
  /** True when new financial activity arrived since the last dashboard refresh. */
  pending: boolean;
  markPending: () => void;
  clearPending: () => void;
}

export const useDashboardRefreshIndicatorStore = create<DashboardRefreshIndicatorState>()((set) => ({
  pending: false,
  markPending: () => set({ pending: true }),
  clearPending: () => set({ pending: false }),
}));

export function markDashboardRefreshPending(): void {
  useDashboardRefreshIndicatorStore.getState().markPending();
}

export function clearDashboardRefreshPending(): void {
  useDashboardRefreshIndicatorStore.getState().clearPending();
}
