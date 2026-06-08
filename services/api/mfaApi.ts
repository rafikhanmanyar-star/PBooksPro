/**
 * MFA API — TOTP setup, verification, and recovery codes.
 */

import { apiClient } from './client';
import type { User, Tenant } from '../../context/AuthContext';

export type MfaStatus = {
  enabled: boolean;
  required: boolean;
  backupCodesRemaining: number;
};

export type MfaSetupResponse = {
  secret: string;
  otpauthUri: string;
};

export type MfaEnableResponse = {
  backupCodes: string[];
  token?: string;
  loginEventId?: string;
  user?: User;
  tenant?: Tenant;
};

export type MfaVerifyResponse = {
  token: string;
  loginEventId?: string;
  user: User;
  tenant: Tenant;
  usedRecoveryCode?: boolean;
};

function mfaAuthHeaders(setupOrAccessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${setupOrAccessToken}` };
}

export const mfaApi = {
  async getStatus(): Promise<MfaStatus> {
    return apiClient.get<MfaStatus>('/auth/mfa/status');
  },

  async setup(accessOrSetupToken?: string): Promise<MfaSetupResponse> {
    const options = accessOrSetupToken ? { headers: mfaAuthHeaders(accessOrSetupToken) } : undefined;
    return apiClient.post<MfaSetupResponse>('/auth/mfa/setup', {}, options);
  },

  async enable(code: string, accessOrSetupToken?: string): Promise<MfaEnableResponse> {
    const options = accessOrSetupToken ? { headers: mfaAuthHeaders(accessOrSetupToken) } : undefined;
    return apiClient.post<MfaEnableResponse>('/auth/mfa/enable', { code }, options);
  },

  async verify(input: {
    mfaToken: string;
    totpCode?: string;
    recoveryCode?: string;
  }): Promise<MfaVerifyResponse> {
    return apiClient.post<MfaVerifyResponse>('/auth/mfa/verify', input);
  },

  async disable(code: string): Promise<{ ok: boolean }> {
    return apiClient.post<{ ok: boolean }>('/auth/mfa/disable', { code });
  },
};
