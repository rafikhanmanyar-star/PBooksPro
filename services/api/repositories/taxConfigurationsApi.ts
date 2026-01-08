import { apiClient } from '../client';

export class TaxConfigurationsApiRepository {
  async findAll(): Promise<any[]> {
    return apiClient.get<any[]>('/tax-configurations');
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/tax-configurations/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(config: Partial<any>): Promise<any> {
    return apiClient.post<any>('/tax-configurations', config);
  }

  async update(id: string, config: Partial<any>): Promise<any> {
    return apiClient.post<any>('/tax-configurations', { ...config, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tax-configurations/${id}`);
  }
}
