import { apiClient } from './client';

export type BreakGlassStatus = {
  active: boolean;
  sessionId?: string;
  expiresAt?: string;
  activatedAt?: string;
  userId?: string;
};

export type BreakGlassActivateResponse = {
  token: string;
  sessionId: string;
  expiresAt: string;
};

export const breakGlassApi = {
  status(): Promise<BreakGlassStatus> {
    return apiClient.get<BreakGlassStatus>('/rbac/break-glass/status');
  },

  activate(body: {
    totpCode?: string;
    recoveryCode?: string;
    durationMinutes?: number;
  }): Promise<BreakGlassActivateResponse> {
    return apiClient.post<BreakGlassActivateResponse>('/rbac/break-glass/activate', body);
  },

  deactivate(): Promise<{ deactivated: boolean }> {
    return apiClient.post<{ deactivated: boolean }>('/rbac/break-glass/deactivate', {});
  },
};

export function isBreakGlassUiEnabled(): boolean {
  return import.meta.env.VITE_RBAC_V2_BREAK_GLASS === 'true';
}
