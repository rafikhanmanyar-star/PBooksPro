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
    return apiClient.get<Property[]>('/api/properties');
  }

  /**
   * Get property by ID
   */
  async findById(id: string): Promise<Property | null> {
    try {
      return await apiClient.get<Property>(`/api/properties/${id}`);
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
    return apiClient.post<Property>('/api/properties', property);
  }

  /**
   * Update an existing property
   */
  async update(id: string, property: Partial<Property>): Promise<Property> {
    return apiClient.put<Property>(`/api/properties/${id}`, property);
  }

  /**
   * Delete a property
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/properties/${id}`);
  }

  /**
   * Check if property exists
   */
  async exists(id: string): Promise<boolean> {
    const property = await this.findById(id);
    return property !== null;
  }
}

