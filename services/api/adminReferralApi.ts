import { apiClient } from './client';
import type { AdminReferralStats, ReferralProgramConfig } from '../../shared/referrals/referralTypes';

export const adminReferralApi = {
  async getStats(): Promise<AdminReferralStats> {
    return apiClient.get('/admin/referrals/stats');
  },

  async listAttributions(options?: { status?: string; limit?: number }): Promise<{
    items: unknown[];
    count: number;
  }> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return apiClient.get(`/admin/referrals/attributions${qs ? `?${qs}` : ''}`);
  },

  async listFraud(limit = 50): Promise<{ items: unknown[]; count: number }> {
    return apiClient.get(`/admin/referrals/fraud?limit=${limit}`);
  },

  async listPendingRewards(limit = 50): Promise<{ items: unknown[]; count: number }> {
    return apiClient.get(`/admin/referrals/rewards/pending?limit=${limit}`);
  },

  async getConfig(): Promise<ReferralProgramConfig> {
    return apiClient.get('/admin/referrals/config');
  },

  async updateConfig(patch: Partial<ReferralProgramConfig>): Promise<ReferralProgramConfig> {
    return apiClient.put('/admin/referrals/config', patch);
  },

  async approveReward(rewardId: string): Promise<{ ok: boolean }> {
    return apiClient.post(`/admin/referrals/rewards/${rewardId}/approve`, {});
  },

  async rejectReward(rewardId: string, notes?: string): Promise<{ ok: boolean }> {
    return apiClient.post(`/admin/referrals/rewards/${rewardId}/reject`, { notes });
  },

  async resolveFraud(reviewId: string, resolution: 'dismissed' | 'confirmed'): Promise<{ ok: boolean }> {
    return apiClient.post(`/admin/referrals/fraud/${reviewId}/resolve`, { resolution });
  },
};
