import { apiClient } from '../client';

export class AppSettingsApiRepository {
  async findAll(): Promise<Record<string, any>> {
    return apiClient.get<Record<string, any>>('/app-settings');
  }

  async findByKey(key: string): Promise<any> {
    try {
      const result = await apiClient.get<{ key: string; value: any }>(`/app-settings/${key}`);
      return result.value;
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async setSetting(key: string, value: any): Promise<void> {
    await apiClient.post('/app-settings', { key, value });
  }

  async deleteSetting(key: string): Promise<void> {
    await apiClient.delete(`/app-settings/${key}`);
  }
}
