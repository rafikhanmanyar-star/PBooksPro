import { apiClient } from '../client';

export interface PMCycleAllocation {
  id: string;
  projectId: string;
  cycleId: string;
  cycleLabel: string;
  frequency: 'Monthly' | 'Weekly' | 'Yearly';
  startDate: string;
  endDate: string;
  allocationDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  billId?: string;
  description?: string;
  expenseTotal: number;
  feeRate: number;
  excludedCategoryIds?: string[];
}

export class PMCycleAllocationsApiRepository {
  async findAll(projectId?: string, cycleId?: string, status?: string): Promise<PMCycleAllocation[]> {
    const params = new URLSearchParams();
    if (projectId) params.append('projectId', projectId);
    if (cycleId) params.append('cycleId', cycleId);
    if (status) params.append('status', status);
    const query = params.toString();
    return apiClient.get<PMCycleAllocation[]>(`/pm-cycle-allocations${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<PMCycleAllocation | null> {
    try {
      return await apiClient.get<PMCycleAllocation>(`/pm-cycle-allocations/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(allocation: Partial<PMCycleAllocation>): Promise<PMCycleAllocation> {
    return apiClient.post<PMCycleAllocation>('/pm-cycle-allocations', allocation);
  }

  async update(id: string, allocation: Partial<PMCycleAllocation>): Promise<PMCycleAllocation> {
    return apiClient.post<PMCycleAllocation>('/pm-cycle-allocations', { ...allocation, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/pm-cycle-allocations/${id}`);
  }
}
