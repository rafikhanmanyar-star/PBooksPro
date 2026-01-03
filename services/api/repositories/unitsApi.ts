/**
 * Units API Repository
 * 
 * Provides API-based access to units data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Unit } from '../../../types';

export class UnitsApiRepository {
  /**
   * Get all units
   */
  async findAll(): Promise<Unit[]> {
    return apiClient.get<Unit[]>('/api/units');
  }

  /**
   * Get unit by ID
   */
  async findById(id: string): Promise<Unit | null> {
    try {
      return await apiClient.get<Unit>(`/api/units/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new unit
   */
  async create(unit: Partial<Unit>): Promise<Unit> {
    return apiClient.post<Unit>('/api/units', unit);
  }

  /**
   * Update an existing unit
   */
  async update(id: string, unit: Partial<Unit>): Promise<Unit> {
    return apiClient.put<Unit>(`/api/units/${id}`, unit);
  }

  /**
   * Delete a unit
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/units/${id}`);
  }

  /**
   * Check if unit exists
   */
  async exists(id: string): Promise<boolean> {
    const unit = await this.findById(id);
    return unit !== null;
  }
}

