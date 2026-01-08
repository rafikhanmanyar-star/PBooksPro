import { apiClient } from '../client';

export class StatutoryConfigurationsApiRepository {
  async findAll(): Promise<any[]> {
    return apiClient.get<any[]>('/statutory-configurations');
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/statutory-configurations/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(config: Partial<any>): Promise<any> {
    return apiClient.post<any>('/statutory-configurations', config);
  }

  async update(id: string, config: Partial<any>): Promise<any> {
    return apiClient.post<any>('/statutory-configurations', { ...config, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/statutory-configurations/${id}`);
  }
}
