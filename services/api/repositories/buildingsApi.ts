/**
 * Buildings API Repository
 * 
 * Provides API-based access to buildings data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Building } from '../../../types';

export class BuildingsApiRepository {
  /**
   * Get all buildings
   */
  async findAll(): Promise<Building[]> {
    return apiClient.get<Building[]>('/buildings');
  }

  /**
   * Get building by ID
   */
  async findById(id: string): Promise<Building | null> {
    try {
      return await apiClient.get<Building>(`/buildings/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new building
   */
  async create(building: Partial<Building>): Promise<Building> {
    return apiClient.post<Building>('/buildings', building);
  }

  /**
   * Update an existing building
   */
  async update(id: string, building: Partial<Building>): Promise<Building> {
    return apiClient.put<Building>(`/buildings/${id}`, building);
  }

  /**
   * Delete a building
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/buildings/${id}`);
  }

  /**
   * Check if building exists
   */
  async exists(id: string): Promise<boolean> {
    const building = await this.findById(id);
    return building !== null;
  }
}

