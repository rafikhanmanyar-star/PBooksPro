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

export const mfaApi = {
  async getStatus(): Promise<MfaStatus> {
    return apiClient.get<MfaStatus>('/auth/mfa/status');
  },

  async setup(accessOrSetupToken?: string): Promise<MfaSetupResponse> {
    // Body-only for setup JWT — avoids generic authMiddleware treating it as an access token.
    return apiClient.post<MfaSetupResponse>(
      '/auth/mfa/setup',
      accessOrSetupToken ? { mfaSetupToken: accessOrSetupToken } : {}
    );
  },

  async enable(code: string, accessOrSetupToken?: string): Promise<MfaEnableResponse> {
    return apiClient.post<MfaEnableResponse>(
      '/auth/mfa/enable',
      accessOrSetupToken ? { code, mfaSetupToken: accessOrSetupToken } : { code }
    );
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
