import { apiClient } from './client';
import type { SystemInfo } from '../../shared/systemFeatures';

export const systemApi = {
  async getInfo(): Promise<SystemInfo> {
    return apiClient.get<SystemInfo>('/system/info');
  },
};
