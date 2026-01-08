import { apiClient } from '../client';
import { Payslip } from '../../../types';

export class PayslipsApiRepository {
  async findAll(employeeId?: string, payrollCycleId?: string, month?: string): Promise<Payslip[]> {
    const params = new URLSearchParams();
    if (employeeId) params.append('employeeId', employeeId);
    if (payrollCycleId) params.append('payrollCycleId', payrollCycleId);
    if (month) params.append('month', month);
    const query = params.toString();
    return apiClient.get<Payslip[]>(`/payslips${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<Payslip | null> {
    try {
      return await apiClient.get<Payslip>(`/payslips/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(payslip: Partial<Payslip>): Promise<Payslip> {
    return apiClient.post<Payslip>('/payslips', payslip);
  }

  async update(id: string, payslip: Partial<Payslip>): Promise<Payslip> {
    return apiClient.post<Payslip>('/payslips', { ...payslip, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/payslips/${id}`);
  }
}
