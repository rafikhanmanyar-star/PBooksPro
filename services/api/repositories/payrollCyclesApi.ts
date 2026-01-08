import { apiClient } from '../client';

export class PayrollCyclesApiRepository {
  async findAll(): Promise<any[]> {
    return apiClient.get<any[]>('/payroll-cycles');
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/payroll-cycles/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(cycle: Partial<any>): Promise<any> {
    return apiClient.post<any>('/payroll-cycles', cycle);
  }

  async update(id: string, cycle: Partial<any>): Promise<any> {
    return apiClient.post<any>('/payroll-cycles', { ...cycle, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/payroll-cycles/${id}`);
  }
}
