import { apiClient } from './client';

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

export const adminSubscriptionApi = {
  async getStats(): Promise<AdminSubscriptionStats> {
    return apiClient.get('/admin/subscriptions/stats');
  },

  async listSubscriptions(options?: { status?: string; limit?: number }): Promise<{
    items: AdminSubscriptionRow[];
    count: number;
  }> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return apiClient.get(`/admin/subscriptions${qs ? `?${qs}` : ''}`);
  },

  async listWebhooks(options?: { status?: string; limit?: number }): Promise<{
    items: AdminWebhookDelivery[];
    count: number;
  }> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return apiClient.get(`/admin/subscriptions/webhooks${qs ? `?${qs}` : ''}`);
  },

  async runMaintenance(): Promise<{
    ok: boolean;
    result: {
      lifecycleExpired: number;
      pendingPlansApplied: number;
      pastDueExpired: number;
      webhooksRetried: number;
    };
  }> {
    return apiClient.post('/admin/subscriptions/maintenance', {});
  },
};
