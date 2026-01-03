/**
 * Bills API Repository
 * 
 * Provides API-based access to bills data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Bill } from '../../../types';

export class BillsApiRepository {
  /**
   * Get all bills
   */
  async findAll(filters?: { status?: string; projectId?: string; categoryId?: string }): Promise<Bill[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    
    const query = params.toString();
    return apiClient.get<Bill[]>(`/bills${query ? `?${query}` : ''}`);
  }

  /**
   * Get bill by ID
   */
  async findById(id: string): Promise<Bill | null> {
    try {
      return await apiClient.get<Bill>(`/bills/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new bill
   */
  async create(bill: Partial<Bill>): Promise<Bill> {
    return apiClient.post<Bill>('/bills', bill);
  }

  /**
   * Update an existing bill
   */
  async update(id: string, bill: Partial<Bill>): Promise<Bill> {
    return apiClient.put<Bill>(`/bills/${id}`, bill);
  }

  /**
   * Delete a bill
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/bills/${id}`);
  }

  /**
   * Check if bill exists
   */
  async exists(id: string): Promise<boolean> {
    const bill = await this.findById(id);
    return bill !== null;
  }
}

