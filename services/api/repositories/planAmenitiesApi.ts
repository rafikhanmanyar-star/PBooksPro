/**
 * Plan Amenities API Repository
 * 
 * Provides API-based access to plan amenities data.
 * Plan amenities are configurable items that can be added to installment plans.
 */

import { apiClient } from '../client';
import { PlanAmenity } from '../../../types';

export class PlanAmenitiesApiRepository {
  /**
   * Get all plan amenities
   */
  async findAll(filters?: { activeOnly?: boolean }): Promise<PlanAmenity[]> {
    const params = new URLSearchParams();
    if (filters?.activeOnly) params.append('activeOnly', 'true');
    
    const query = params.toString();
    return apiClient.get<PlanAmenity[]>(`/plan-amenities${query ? `?${query}` : ''}`);
  }

  /**
   * Get active amenities only
   */
  async findActive(): Promise<PlanAmenity[]> {
    return this.findAll({ activeOnly: true });
  }

  /**
   * Get plan amenity by ID
   */
  async findById(id: string): Promise<PlanAmenity | null> {
    try {
      return await apiClient.get<PlanAmenity>(`/plan-amenities/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new plan amenity
   */
  async create(amenity: Partial<PlanAmenity>): Promise<PlanAmenity> {
    return apiClient.post<PlanAmenity>('/plan-amenities', amenity);
  }

  /**
   * Update an existing plan amenity
   */
  async update(id: string, amenity: Partial<PlanAmenity>): Promise<PlanAmenity> {
    return apiClient.put<PlanAmenity>(`/plan-amenities/${id}`, amenity);
  }

  /**
   * Create or update plan amenity (upsert)
   */
  async save(amenity: Partial<PlanAmenity>): Promise<PlanAmenity> {
    return apiClient.post<PlanAmenity>('/plan-amenities', amenity);
  }

  /**
   * Delete a plan amenity
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/plan-amenities/${id}`);
  }

  /**
   * Check if plan amenity exists
   */
  async exists(id: string): Promise<boolean> {
    const amenity = await this.findById(id);
    return amenity !== null;
  }
}
