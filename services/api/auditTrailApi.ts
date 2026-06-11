import { apiClient } from './client';

export type AuditTrailItem = {
  id: string;
  source: 'audit_event' | 'login_event';
  occurredAt: string;
  userId: string | null;
  email: string | null;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string | null;
  oldValue: unknown;
  newValue: unknown;
};

export type AuditTrailFilters = {
  userId?: string;
  startDate?: string;
  endDate?: string;
  module?: string;
  action?: string;
  limit?: number;
  offset?: number;
};

export const auditTrailApi = {
  async listEvents(filters: AuditTrailFilters = {}): Promise<{ items: AuditTrailItem[]; count: number; tenantId?: string }> {
    const q = new URLSearchParams();
    if (filters.userId) q.set('userId', filters.userId);
    if (filters.startDate) q.set('startDate', filters.startDate);
    if (filters.endDate) q.set('endDate', filters.endDate);
    if (filters.module) q.set('module', filters.module);
    if (filters.action) q.set('action', filters.action);
    if (filters.limit != null) q.set('limit', String(filters.limit));
    if (filters.offset != null) q.set('offset', String(filters.offset));
    const qs = q.toString();
    return apiClient.get<{ items: AuditTrailItem[]; count: number; tenantId?: string }>(
      `/audit/events${qs ? `?${qs}` : ''}`
    );
  },

  async getFilterOptions(): Promise<{ modules: string[]; actions: string[] }> {
    return apiClient.get<{ modules: string[]; actions: string[] }>('/audit/filters');
  },
};
