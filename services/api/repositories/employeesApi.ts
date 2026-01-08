import { apiClient } from '../client';
import { Employee } from '../../../types';

export class EmployeesApiRepository {
  async findAll(): Promise<Employee[]> {
    return apiClient.get<Employee[]>('/employees');
  }

  async findById(id: string): Promise<Employee | null> {
    try {
      return await apiClient.get<Employee>(`/employees/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(employee: Partial<Employee>): Promise<Employee> {
    return apiClient.post<Employee>('/employees', employee);
  }

  async update(id: string, employee: Partial<Employee>): Promise<Employee> {
    return apiClient.post<Employee>('/employees', { ...employee, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/employees/${id}`);
  }
}
