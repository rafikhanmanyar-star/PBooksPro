import { apiClient } from './client';

export type OrganizationStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

export type OrganizationRequestRow = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: OrganizationStatus;
  registrationReference: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
};

export type OrganizationRequestDetail = OrganizationRequestRow & {
  address: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
};

export const adminOrganizationRequestsApi = {
  async list(options?: {
    status?: OrganizationStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: OrganizationRequestRow[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));
    const qs = params.toString();
    return apiClient.get(`/admin/organization-requests${qs ? `?${qs}` : ''}`);
  },

  async get(id: string): Promise<OrganizationRequestDetail> {
    return apiClient.get(`/admin/organization-requests/${encodeURIComponent(id)}`);
  },

  async approve(id: string): Promise<OrganizationRequestDetail> {
    return apiClient.post(`/admin/organization-requests/${encodeURIComponent(id)}/approve`, {});
  },

  async reject(id: string, reason: string): Promise<OrganizationRequestDetail> {
    return apiClient.post(`/admin/organization-requests/${encodeURIComponent(id)}/reject`, { reason });
  },

  async suspend(id: string): Promise<OrganizationRequestDetail> {
    return apiClient.post(`/admin/organization-requests/${encodeURIComponent(id)}/suspend`, {});
  },

  async activate(id: string): Promise<OrganizationRequestDetail> {
    return apiClient.post(`/admin/organization-requests/${encodeURIComponent(id)}/activate`, {});
  },
};
