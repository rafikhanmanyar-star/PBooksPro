/**
 * Contracts API Repository
 * 
 * Provides API-based access to contracts data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Contract } from '../../../types';

export class ContractsApiRepository {
  /**
   * Get all contracts
   */
  async findAll(filters?: { status?: string; projectId?: string; vendorId?: string }): Promise<Contract[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.vendorId) params.append('vendorId', filters.vendorId);
    
    const query = params.toString();
    return apiClient.get<Contract[]>(`/api/contracts${query ? `?${query}` : ''}`);
  }

  /**
   * Get contract by ID
   */
  async findById(id: string): Promise<Contract | null> {
    try {
      return await apiClient.get<Contract>(`/api/contracts/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new contract
   */
  async create(contract: Partial<Contract>): Promise<Contract> {
    return apiClient.post<Contract>('/api/contracts', contract);
  }

  /**
   * Update an existing contract
   */
  async update(id: string, contract: Partial<Contract>): Promise<Contract> {
    return apiClient.put<Contract>(`/api/contracts/${id}`, contract);
  }

  /**
   * Delete a contract
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/contracts/${id}`);
  }

  /**
   * Check if contract exists
   */
  async exists(id: string): Promise<boolean> {
    const contract = await this.findById(id);
    return contract !== null;
  }
}

