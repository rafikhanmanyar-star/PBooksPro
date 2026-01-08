import { apiClient } from '../client';

export class LoanAdvanceRecordsApiRepository {
  async findAll(employeeId?: string, type?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (employeeId) params.append('employeeId', employeeId);
    if (type) params.append('type', type);
    const query = params.toString();
    return apiClient.get<any[]>(`/loan-advance-records${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/loan-advance-records/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(record: Partial<any>): Promise<any> {
    return apiClient.post<any>('/loan-advance-records', record);
  }

  async update(id: string, record: Partial<any>): Promise<any> {
    return apiClient.post<any>('/loan-advance-records', { ...record, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/loan-advance-records/${id}`);
  }
}
