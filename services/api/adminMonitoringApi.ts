import { apiClient } from './client';

export type MonitoringCategory =
  | 'application_error'
  | 'api_failure'
  | 'database'
  | 'authentication'
  | 'payment'
  | 'performance'
  | 'email'
  | 'user_activity'
  | 'sync';

export type MonitoringOverview = {
  stats: {
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    recentErrors: number;
    slowRequests: number;
  };
  alerts: Array<{
    id: string;
    rule_id: string;
    rule_name?: string;
    status: string;
    event_count: number;
    sample_message: string | null;
    triggered_at: string;
  }>;
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Array<{
      component: string;
      status: string;
      message: string;
      details?: Record<string, unknown>;
      checkedAt: string;
    }>;
  };
  observability: {
    sentry: boolean;
    applicationInsights: boolean;
    openTelemetry: boolean;
    registeredProviders: string[];
  };
  categories: Array<{ id: string; label: string }>;
  windowHours: number;
};

export type MonitoringEvent = {
  id: string;
  category: MonitoringCategory;
  severity: string;
  message: string;
  code: string | null;
  tenant_id: string | null;
  user_id: string | null;
  route: string | null;
  method: string | null;
  status_code: number | null;
  duration_ms: number | null;
  request_id: string | null;
  created_at: string;
};

export const adminMonitoringApi = {
  async getOverview(hours = 24): Promise<MonitoringOverview> {
    return apiClient.get(`/admin/monitoring/overview?hours=${hours}`);
  },

  async listEvents(options?: {
    category?: string;
    severity?: string;
    search?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: MonitoringEvent[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.severity) params.set('severity', options.severity);
    if (options?.search) params.set('search', options.search);
    if (options?.tenantId) params.set('tenantId', options.tenantId);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const q = params.toString();
    return apiClient.get(`/admin/monitoring/events${q ? `?${q}` : ''}`);
  },

  async runHealthCheck(): Promise<MonitoringOverview['health']> {
    return apiClient.get('/admin/monitoring/health');
  },

  async acknowledgeAlert(id: string): Promise<void> {
    await apiClient.post(`/admin/monitoring/alerts/${id}/acknowledge`, {});
  },

  async resolveAlert(id: string): Promise<void> {
    await apiClient.post(`/admin/monitoring/alerts/${id}/resolve`, {});
  },

  async getHealthCenter(): Promise<HealthCenterSnapshot> {
    return apiClient.get('/admin/monitoring/health-center');
  },

  async getApiStats(minutes = 60): Promise<ApiStatsSummary> {
    return apiClient.get(`/admin/monitoring/api-stats?minutes=${minutes}`);
  },

  async getSlowApis(minutes = 60, limit = 20): Promise<{ endpoints: ApiEndpointStat[]; thresholds: { warnMs: number; criticalMs: number } }> {
    return apiClient.get(`/admin/monitoring/slow-apis?minutes=${minutes}&limit=${limit}`);
  },

  async getDatabaseObservability(): Promise<DatabaseObservabilitySnapshot> {
    return apiClient.get('/admin/monitoring/database');
  },

  async getSyncDiagnostics(): Promise<SyncDiagnosticsSnapshot> {
    return apiClient.get('/admin/monitoring/sync-diagnostics');
  },

  async getAuditCoverage(days = 30): Promise<AuditCoverageReport> {
    return apiClient.get(`/admin/monitoring/audit-coverage?days=${days}`);
  },
};

export type ApiEndpointStat = {
  routeKey: string;
  method: string;
  path: string;
  requestCount: number;
  errorCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  warningBreaches: number;
  criticalBreaches: number;
};

export type ApiStatsSummary = {
  windowMinutes: number;
  totalRequests: number;
  totalErrors: number;
  slowWarningCount: number;
  slowCriticalCount: number;
  endpoints: ApiEndpointStat[];
  thresholds: { warnMs: number; criticalMs: number };
};

export type HealthCenterSnapshot = {
  generatedAt: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  frontend: { note: string; clientTelemetryIngest: boolean };
  backend: {
    api: ApiStatsSummary;
    components: MonitoringOverview['health']['components'];
    observability: MonitoringOverview['observability'];
  };
  synchronization: SyncDiagnosticsSnapshot & { connectedSocketClients: number };
  database: DatabaseObservabilitySnapshot;
  audit: AuditCoverageReport;
  errors: MonitoringOverview['stats'];
};

export type DatabaseObservabilitySnapshot = {
  generatedAt: string;
  pool: { totalCount: number; idleCount: number; waitingCount: number; maxConnections: number };
  slowQueriesFromMonitoring: Array<{
    route: string | null;
    method: string | null;
    durationMs: number | null;
    message: string;
    createdAt: string;
  }>;
  pgStatStatementsAvailable: boolean;
  topSlowStatements: Array<{ query: string; calls: number; meanMs: number; totalMs: number }>;
  lockContention: { waitingLocks: number };
};

export type SyncDiagnosticsSnapshot = {
  generatedAt: string;
  queue: {
    pending: number;
    processing: number;
    completed24h: number;
    failed: number;
    retried24h: number;
  };
  recentFailed: Array<{
    id: string;
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
  }>;
  recentPending: Array<{
    id: string;
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    attempts: number;
    createdAt: string;
  }>;
  changeLog: { eventsLast24h: number };
};

export type AuditCoverageReport = {
  generatedAt: string;
  windowDays: number;
  eventsInWindow: number;
  byModule: Record<string, number>;
  byAction: Record<string, number>;
  gaps: Array<{ type: 'module' | 'action'; id: string; note: string }>;
  recentSamples: Array<{
    id: string;
    module: string;
    action: string;
    entityType: string | null;
    summary: string | null;
    occurredAt: string;
  }>;
};

export const monitoringIngestApi = {
  async reportClientError(input: {
    message: string;
    stack?: string;
    componentStack?: string;
    url?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await apiClient.post('/monitoring/client-errors', input);
  },

  async reportTelemetry(
    metrics: Array<{
      name: string;
      value: number;
      unit: 'ms' | 'bytes' | 'count' | 'score';
      tags?: Record<string, string>;
      timestamp?: string;
    }>
  ): Promise<void> {
    await apiClient.post('/monitoring/telemetry', { metrics });
  },
};
