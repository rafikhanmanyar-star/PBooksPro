import { apiClient } from '../client';
import { SalaryComponent } from '../../../types';

export class SalaryComponentsApiRepository {
  async findAll(): Promise<SalaryComponent[]> {
    return apiClient.get<SalaryComponent[]>('/salary-components');
  }

  async findById(id: string): Promise<SalaryComponent | null> {
    try {
      return await apiClient.get<SalaryComponent>(`/salary-components/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(component: Partial<SalaryComponent>): Promise<SalaryComponent> {
    return apiClient.post<SalaryComponent>('/salary-components', component);
  }

  async update(id: string, component: Partial<SalaryComponent>): Promise<SalaryComponent> {
    return apiClient.post<SalaryComponent>('/salary-components', { ...component, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/salary-components/${id}`);
  }
}
