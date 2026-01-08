import { apiClient } from '../client';

export class AttendanceRecordsApiRepository {
  async findAll(employeeId?: string, startDate?: string, endDate?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (employeeId) params.append('employeeId', employeeId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    return apiClient.get<any[]>(`/attendance-records${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await apiClient.get<any>(`/attendance-records/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(record: Partial<any>): Promise<any> {
    return apiClient.post<any>('/attendance-records', record);
  }

  async update(id: string, record: Partial<any>): Promise<any> {
    return apiClient.post<any>('/attendance-records', { ...record, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/attendance-records/${id}`);
  }
}
