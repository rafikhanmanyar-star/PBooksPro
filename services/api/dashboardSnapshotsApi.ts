import { apiClient } from './client';

export type DashboardSnapshotsResponse = {
  snapshotDate: string;
  kpis: Record<string, { numeric?: number; json?: unknown }>;
  computedAt: string;
};

export const dashboardSnapshotsApi = {
  async getSnapshots(date?: string): Promise<DashboardSnapshotsResponse> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return apiClient.get<DashboardSnapshotsResponse>(`/dashboard/snapshots${q}`);
  },
};
