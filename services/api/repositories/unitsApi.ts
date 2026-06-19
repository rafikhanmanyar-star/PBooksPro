/**
 * Units API Repository
 * 
 * Provides API-based access to units data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Unit } from '../../../types';
import type { PaginatedResponse } from '../../../shared/types/pagination';
import { appendEntitySearchParams } from '../entitySearchParams';

export class UnitsApiRepository {
  /**
   * Get all units, optionally filtered by project (bulk sync).
   */
  async findAll(projectId?: string): Promise<Unit[]> {
    const q = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    return apiClient.get<Unit[]>(`/units${q}`);
  }

  /** Paginated unit / inventory search (PERF-A3.4). */
  async findPage(params: {
    page: number;
    pageSize: number;
    projectId?: string;
    search?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Unit>> {
    const q = new URLSearchParams();
    appendEntitySearchParams(q, params);
    if (params.projectId) q.set('project_id', params.projectId);
    return apiClient.get<PaginatedResponse<Unit>>(`/units?${q.toString()}`);
  }

  /**
   * Units for a single project (GET /api/units?project_id=…)
   */
  async findByProjectId(projectId: string): Promise<Unit[]> {
    return this.findAll(projectId);
  }

  /**
   * Get unit by ID
   */
  async findById(id: string): Promise<Unit | null> {
    try {
      return await apiClient.get<Unit>(`/units/${id}`);
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
    return apiClient.post<Unit>('/units', unit);
  }

  /**
   * Update an existing unit
   */
  async update(id: string, unit: Partial<Unit>): Promise<Unit> {
    return apiClient.put<Unit>(`/units/${id}`, unit);
  }

  /**
   * Delete a unit
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/units/${id}`);
  }

  /**
   * Check if unit exists
   */
  async exists(id: string): Promise<boolean> {
    const unit = await this.findById(id);
    return unit !== null;
  }
}

