import { apiClient } from '../client';

export class BonusRecordsApiRepository {
  async findAll(employeeId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (employeeId) params.append('employeeId', employeeId);
    const query = params.toString();
    return apiClient.get<any[]>(`/bonus-records${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/bonus-records/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(record: Partial<any>): Promise<any> {
    return apiClient.post<any>('/bonus-records', record);
  }

  async update(id: string, record: Partial<any>): Promise<any> {
    return apiClient.post<any>('/bonus-records', { ...record, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/bonus-records/${id}`);
  }
}
