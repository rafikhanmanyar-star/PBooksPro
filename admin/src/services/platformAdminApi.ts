/**
 * Platform-admin API client for the cross-tenant dashboards (subscriptions, referrals,
 * system health) relocated from the customer client into the admin portal.
 *
 * These endpoints live under /api/admin/* behind adminAuthMiddleware (admin_users) and
 * return the backend success envelope `{ success, data, error }`, so every call unwraps
 * `.data`. Tenant Super Admins cannot reach them — that is the whole point of the move.
 */

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || 'https://api.pbookspro.com/api/admin';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('admin_token');
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
}

async function unwrap<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* ignore parse errors on empty bodies */
  }
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ||
      (body as { error?: string } | null)?.error ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  const envelope = body as { data?: T } | null;
  return (envelope && 'data' in envelope ? (envelope.data as T) : (body as T));
}

async function get<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(`${ADMIN_API_URL}${path}`, { headers: authHeaders() }));
}

async function post<T>(path: string, payload: unknown = {}): Promise<T> {
  return unwrap<T>(
    await fetch(`${ADMIN_API_URL}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
  );
}

async function put<T>(path: string, payload: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(`${ADMIN_API_URL}${path}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
  );
}

/* ───────────────────────── Subscriptions ───────────────────────── */

export type AdminSubscriptionStats = {
  totalTenants: number;
  activeSubscriptions: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  expired: number;
  failedWebhooks: number;
  gracePeriodDays: number;
};

export type AdminSubscriptionRow = {
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  tenantActive: boolean;
  planCode: string;
  planName: string;
  status: string;
  billingCycle: string;
  renewalDate: string | null;
  trialEndDate: string | null;
  pastDueAt: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  paddleSubscriptionId: string | null;
  pendingPlanCode: string | null;
  updatedAt: string;
};

export type AdminWebhookDelivery = {
  id: string;
  eventType: string;
  tenantId: string | null;
  status: string;
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
};

export const subscriptionsApi = {
  getStats: () => get<AdminSubscriptionStats>('/subscriptions/stats'),
  listSubscriptions: (opts?: { status?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (opts?.status) p.set('status', opts.status);
    if (opts?.limit) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return get<{ items: AdminSubscriptionRow[]; count: number }>(
      `/subscriptions${qs ? `?${qs}` : ''}`
    );
  },
  listWebhooks: (opts?: { status?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (opts?.status) p.set('status', opts.status);
    if (opts?.limit) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return get<{ items: AdminWebhookDelivery[]; count: number }>(
      `/subscriptions/webhooks${qs ? `?${qs}` : ''}`
    );
  },
  runMaintenance: () =>
    post<{ ok: boolean; result: Record<string, number> }>('/subscriptions/maintenance'),
};

/* ───────────────────────── Referrals ───────────────────────── */

export type AdminReferralStats = {
  totalReferrals?: number;
  pendingRewards?: number;
  approvedRewards?: number;
  openFraudReviews?: number;
  [key: string]: unknown;
};

export type ReferralProgramConfig = {
  isEnabled: boolean;
  [key: string]: unknown;
};

export const referralsApi = {
  getStats: () => get<AdminReferralStats>('/referrals/stats'),
  getConfig: () => get<ReferralProgramConfig>('/referrals/config'),
  updateConfig: (patch: Partial<ReferralProgramConfig>) =>
    put<ReferralProgramConfig>('/referrals/config', patch),
  listFraud: (limit = 50) =>
    get<{ items: Array<Record<string, unknown>>; count: number }>(`/referrals/fraud?limit=${limit}`),
  listPendingRewards: (limit = 50) =>
    get<{ items: Array<Record<string, unknown>>; count: number }>(
      `/referrals/rewards/pending?limit=${limit}`
    ),
  approveReward: (id: string) => post<{ ok: boolean }>(`/referrals/rewards/${id}/approve`),
  rejectReward: (id: string, notes?: string) =>
    post<{ ok: boolean }>(`/referrals/rewards/${id}/reject`, { notes }),
  resolveFraud: (id: string, resolution: 'dismissed' | 'confirmed') =>
    post<{ ok: boolean }>(`/referrals/fraud/${id}/resolve`, { resolution }),
};

/* ───────────────────────── Monitoring / System Health ───────────────────────── */

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

export type HealthComponent = {
  component: string;
  status: string;
  message: string;
  checkedAt: string;
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
    entityType: string;
    action: string;
    lastError: string | null;
  }>;
  recentPending: Array<{ id: string; entityType: string; action: string; attempts: number }>;
  changeLog: { eventsLast24h: number };
};

export type AuditCoverageReport = {
  generatedAt: string;
  windowDays: number;
  eventsInWindow: number;
  byModule: Record<string, number>;
  byAction: Record<string, number>;
  gaps: Array<{ type: 'module' | 'action'; id: string; note: string }>;
};

export type HealthCenterSnapshot = {
  generatedAt: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  frontend: { note: string; clientTelemetryIngest: boolean };
  backend: {
    api: ApiStatsSummary;
    components: HealthComponent[];
    observability: Record<string, unknown>;
  };
  synchronization: SyncDiagnosticsSnapshot & { connectedSocketClients: number };
  database: DatabaseObservabilitySnapshot;
  audit: AuditCoverageReport;
  errors: { recentErrors: number; slowRequests: number; [key: string]: unknown };
};

export type MonitoringEvent = {
  id: string;
  category: string;
  severity: string;
  message: string;
  code: string | null;
  tenant_id: string | null;
  route: string | null;
  method: string | null;
  status_code: number | null;
  duration_ms: number | null;
  created_at: string;
};

export type MonitoringOverview = {
  alerts: Array<{
    id: string;
    rule_name?: string;
    status: string;
    event_count: number;
    sample_message: string | null;
    triggered_at: string;
  }>;
  categories: Array<{ id: string; label: string }>;
};

export const monitoringApi = {
  getHealthCenter: () => get<HealthCenterSnapshot>('/monitoring/health-center'),
  getOverview: (hours = 24) => get<MonitoringOverview>(`/monitoring/overview?hours=${hours}`),
  listEvents: (opts?: { category?: string; severity?: string; search?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (opts?.category) p.set('category', opts.category);
    if (opts?.severity) p.set('severity', opts.severity);
    if (opts?.search) p.set('search', opts.search);
    if (opts?.limit) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return get<{ items: MonitoringEvent[]; total: number }>(`/monitoring/events${qs ? `?${qs}` : ''}`);
  },
  acknowledgeAlert: (id: string) => post<{ ok: boolean }>(`/monitoring/alerts/${id}/acknowledge`),
  resolveAlert: (id: string) => post<{ ok: boolean }>(`/monitoring/alerts/${id}/resolve`),
};
