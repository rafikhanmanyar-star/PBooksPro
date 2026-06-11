export type AnalyticsSnapshotRow = {
  id: string;
  tenant_id: string;
  snapshot_date: string;
  kpi_key: string;
  value_numeric: number | null;
  value_json: unknown | null;
  computed_at: Date;
  period_start: string | null;
  period_end: string | null;
};

export type DashboardSnapshotApi = {
  snapshotDate: string;
  kpis: Record<string, { numeric?: number; json?: unknown }>;
  computedAt: string;
};
