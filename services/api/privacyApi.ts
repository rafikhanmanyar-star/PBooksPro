import { apiClient, formatApiErrorMessage } from './client';

export type PrivacyRequestType =
  | 'data_export'
  | 'user_data_export'
  | 'tenant_data_export'
  | 'deletion'
  | 'correction'
  | 'anonymization';

export type PrivacyRequestStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'failed';

export type PrivacyRequest = {
  id: string;
  tenant_id: string;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  requested_at: string;
  completed_at: string | null;
  requested_by_user_id: string | null;
  metadata: Record<string, unknown>;
};

export type PrivacyExportScope = 'data' | 'user' | 'tenant';

async function downloadPrivacyExport(scope: PrivacyExportScope): Promise<void> {
  const base = apiClient.getBaseUrl().replace(/\/$/, '');
  const token = apiClient.getToken();
  if (!token) throw new Error('Not authenticated');

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const tid = apiClient.getTenantId();
  if (tid) (headers as Record<string, string>)['X-Tenant-ID'] = tid;

  const res = await fetch(`${base}/privacy/export`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ scope }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatApiErrorMessage(text) || `Export failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `pbooks-privacy-${scope}-${Date.now()}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const privacyApi = {
  async listRequests(): Promise<{ items: PrivacyRequest[]; count: number }> {
    return apiClient.get('/privacy/requests');
  },

  async getRequest(id: string): Promise<{ request: PrivacyRequest }> {
    return apiClient.get(`/privacy/requests/${id}`);
  },

  async createRequest(input: {
    requestType: PrivacyRequestType;
    notes?: string;
    targetUserId?: string;
  }): Promise<{ request: PrivacyRequest }> {
    return apiClient.post('/privacy/requests', input);
  },

  async exportData(scope: PrivacyExportScope = 'data'): Promise<void> {
    return downloadPrivacyExport(scope);
  },

  async exportUserData(): Promise<void> {
    return downloadPrivacyExport('user');
  },

  async exportTenantData(): Promise<void> {
    return downloadPrivacyExport('tenant');
  },

  async processDeletion(requestId: string): Promise<{ request: PrivacyRequest }> {
    return apiClient.post(`/privacy/requests/${requestId}/process-deletion`, {});
  },

  async resolveCorrection(
    requestId: string,
    status: 'completed' | 'rejected',
    adminNotes?: string
  ): Promise<{ request: PrivacyRequest }> {
    return apiClient.post(`/privacy/requests/${requestId}/resolve`, { status, adminNotes });
  },

  async anonymizeUser(userId: string): Promise<{ request: PrivacyRequest }> {
    return apiClient.post('/privacy/anonymize', { userId });
  },
};
