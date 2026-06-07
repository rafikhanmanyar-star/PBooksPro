import { apiClient } from './client';
import type { ReferralDashboardStats } from '../../shared/referrals/referralTypes';

export const referralApi = {
  async getDashboard(): Promise<ReferralDashboardStats> {
    return apiClient.get('/referrals/dashboard');
  },

  async sendInvitation(input: { inviteeEmail: string; inviteeName?: string }): Promise<{
    invitationId: string;
    sent: boolean;
  }> {
    return apiClient.post('/referrals/invitations', input);
  },

  async validateCode(code: string): Promise<{
    valid: boolean;
    code?: string;
    referrerTenantName?: string;
    shareUrl?: string;
  }> {
    return apiClient.get(`/referrals/validate/${encodeURIComponent(code)}`);
  },

  async trackClick(code: string): Promise<{ ok: boolean }> {
    return apiClient.post('/referrals/click', { code });
  },
};
