/**
 * Sales Returns API Repository
 * 
 * Provides API-based access to sales returns data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { SalesReturn } from '../../../types';

export class SalesReturnsApiRepository {
  /**
   * Get all sales returns
   */
  async findAll(filters?: { status?: string; agreementId?: string }): Promise<SalesReturn[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.agreementId) params.append('agreementId', filters.agreementId);
    
    const query = params.toString();
    return apiClient.get<SalesReturn[]>(`/sales-returns${query ? `?${query}` : ''}`);
  }

  /**
   * Get sales return by ID
   */
  async findById(id: string): Promise<SalesReturn | null> {
    try {
      return await apiClient.get<SalesReturn>(`/sales-returns/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new sales return
   */
  async create(salesReturn: Partial<SalesReturn>): Promise<SalesReturn> {
    return apiClient.post<SalesReturn>('/sales-returns', salesReturn);
  }

  /**
   * Update an existing sales return
   */
  async update(id: string, salesReturn: Partial<SalesReturn>): Promise<SalesReturn> {
    return apiClient.put<SalesReturn>(`/sales-returns/${id}`, salesReturn);
  }

  /**
   * Delete a sales return
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/sales-returns/${id}`);
  }

  /**
   * Check if sales return exists
   */
  async exists(id: string): Promise<boolean> {
    const salesReturn = await this.findById(id);
    return salesReturn !== null;
  }
}

