/**
 * Properties API Repository
 * 
 * Provides API-based access to properties data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Property } from '../../../types';

export class PropertiesApiRepository {
  /**
   * Get all properties
   */
  async findAll(): Promise<Property[]> {
    return apiClient.get<Property[]>('/properties');
  }

  /**
   * Get property by ID
   */
  async findById(id: string): Promise<Property | null> {
    try {
      return await apiClient.get<Property>(`/properties/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new property
   */
  async create(property: Partial<Property>): Promise<Property> {
    return apiClient.post<Property>('/properties', property);
  }

  /**
   * Update an existing property
   */
  async update(
    id: string,
    property: Partial<Property>,
    opts?: { skipConflictNotification?: boolean }
  ): Promise<Property> {
    return apiClient.put<Property>(`/properties/${id}`, property, {
      skipConflictNotification: opts?.skipConflictNotification,
    });
  }

  /**
   * Get all property ownership rows for the tenant.
   */
  async findAllOwnership(): Promise<Array<Record<string, unknown>>> {
    return apiClient.get<Array<Record<string, unknown>>>('/properties/ownership');
  }

  /**
   * Replace `property_ownership` rows for one property (after client-side transfer).
   */
  async syncOwnership(
    propertyId: string,
    rows: Array<{
      id: string;
      ownerId: string;
      ownershipPercentage: number;
      startDate: string;
      endDate: string | null;
      isActive: boolean;
    }>
  ): Promise<void> {
    await apiClient.post(`/properties/${propertyId}/ownership/sync`, { rows });
  }

  /**
   * Delete a property
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/properties/${id}`);
  }

  /**
   * Check if property exists
   */
  async exists(id: string): Promise<boolean> {
    const property = await this.findById(id);
    return property !== null;
  }
}

