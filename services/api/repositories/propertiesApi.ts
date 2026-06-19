/**
 * Properties API Repository
 * 
 * Provides API-based access to properties data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Property } from '../../../types';
import type { PaginatedResponse } from '../../../shared/types/pagination';
import { appendEntitySearchParams } from '../entitySearchParams';

export class PropertiesApiRepository {
  /**
   * Get all properties (bulk sync).
   */
  async findAll(): Promise<Property[]> {
    return apiClient.get<Property[]>('/properties');
  }

  /** Paginated property search (PERF-A3.4). */
  async findPage(params: {
    page: number;
    pageSize: number;
    buildingId?: string;
    search?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Property>> {
    const q = new URLSearchParams();
    appendEntitySearchParams(q, params);
    if (params.buildingId) q.set('buildingId', params.buildingId);
    return apiClient.get<PaginatedResponse<Property>>(`/properties?${q.toString()}`);
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

