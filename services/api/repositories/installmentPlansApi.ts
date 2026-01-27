/**
 * Installment Plans API Repository
 * 
 * Provides API-based access to installment plans data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { InstallmentPlan } from '../../../types';

export class InstallmentPlansApiRepository {
  /**
   * Get all installment plans
   */
  async findAll(): Promise<InstallmentPlan[]> {
    return apiClient.get<InstallmentPlan[]>('/installment-plans');
  }

  /**
   * Get installment plan by ID
   */
  async findById(id: string): Promise<InstallmentPlan | null> {
    try {
      return await apiClient.get<InstallmentPlan>(`/installment-plans/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new installment plan
   */
  async create(plan: Partial<InstallmentPlan>): Promise<InstallmentPlan> {
    return apiClient.post<InstallmentPlan>('/installment-plans', plan);
  }

  /**
   * Update an existing installment plan
   */
  async update(id: string, plan: Partial<InstallmentPlan>): Promise<InstallmentPlan> {
    return apiClient.put<InstallmentPlan>(`/installment-plans/${id}`, plan);
  }

  /**
   * Delete an installment plan
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/installment-plans/${id}`);
  }

  /**
   * Check if installment plan exists
   */
  async exists(id: string): Promise<boolean> {
    const plan = await this.findById(id);
    return plan !== null;
  }
}
