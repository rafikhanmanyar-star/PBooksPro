/**
 * Budgets API Repository
 * 
 * Provides API-based access to budgets data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Budget } from '../../../types';

export class BudgetsApiRepository {
  /**
   * Get all budgets
   */
  async findAll(filters?: { projectId?: string }): Promise<Budget[]> {
    const params = new URLSearchParams();
    if (filters?.projectId) params.append('projectId', filters.projectId);
    
    const query = params.toString();
    return apiClient.get<Budget[]>(`/api/budgets${query ? `?${query}` : ''}`);
  }

  /**
   * Get budget by ID
   */
  async findById(id: string): Promise<Budget | null> {
    try {
      return await apiClient.get<Budget>(`/api/budgets/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new budget
   */
  async create(budget: Partial<Budget>): Promise<Budget> {
    return apiClient.post<Budget>('/api/budgets', budget);
  }

  /**
   * Update an existing budget
   */
  async update(id: string, budget: Partial<Budget>): Promise<Budget> {
    return apiClient.put<Budget>(`/api/budgets/${id}`, budget);
  }

  /**
   * Delete a budget
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/budgets/${id}`);
  }

  /**
   * Check if budget exists
   */
  async exists(id: string): Promise<boolean> {
    const budget = await this.findById(id);
    return budget !== null;
  }
}

