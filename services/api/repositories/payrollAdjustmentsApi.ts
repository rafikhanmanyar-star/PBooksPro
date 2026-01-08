import { apiClient } from '../client';

export class PayrollAdjustmentsApiRepository {
  async findAll(employeeId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (employeeId) params.append('employeeId', employeeId);
    const query = params.toString();
    return apiClient.get<any[]>(`/payroll-adjustments${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/payroll-adjustments/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(adjustment: Partial<any>): Promise<any> {
    return apiClient.post<any>('/payroll-adjustments', adjustment);
  }

  async update(id: string, adjustment: Partial<any>): Promise<any> {
    return apiClient.post<any>('/payroll-adjustments', { ...adjustment, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/payroll-adjustments/${id}`);
  }
}
