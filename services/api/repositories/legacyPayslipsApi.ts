import { apiClient } from '../client';

export class LegacyPayslipsApiRepository {
  async findAll(staffId?: string, month?: string, payslipType?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (staffId) params.append('staffId', staffId);
    if (month) params.append('month', month);
    if (payslipType) params.append('payslipType', payslipType);
    const query = params.toString();
    return apiClient.get<any[]>(`/legacy-payslips${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/legacy-payslips/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(payslip: Partial<any>): Promise<any> {
    return apiClient.post<any>('/legacy-payslips', payslip);
  }

  async update(id: string, payslip: Partial<any>): Promise<any> {
    return apiClient.post<any>('/legacy-payslips', { ...payslip, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/legacy-payslips/${id}`);
  }
}
