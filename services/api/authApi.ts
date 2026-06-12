import { apiClient } from './client';

export type CurrentUserResponse = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  organizationId: string;
  role?: string;
};

export async function fetchCurrentUser(): Promise<CurrentUserResponse> {
  return apiClient.get<CurrentUserResponse>('/auth/me');
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  return apiClient.post<{ ok: boolean; message: string }>('/auth/forgot-password', { email });
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ ok: boolean; message: string }> {
  return apiClient.post<{ ok: boolean; message: string }>('/auth/reset-password', {
    token,
    newPassword,
  });
}
