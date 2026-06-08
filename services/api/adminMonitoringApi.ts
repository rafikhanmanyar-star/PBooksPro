import { apiClient } from './client';

export type MonitoringCategory =
  | 'application_error'
  | 'api_failure'
  | 'database'
  | 'authentication'
  | 'payment'
  | 'performance'
  | 'email'
  | 'user_activity';

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
};
