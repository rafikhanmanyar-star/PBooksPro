/**
 * Project Agreements API Repository
 * 
 * Provides API-based access to project agreements data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { ProjectAgreement } from '../../../types';

export class ProjectAgreementsApiRepository {
  /**
   * Get all project agreements
   */
  async findAll(filters?: { status?: string; projectId?: string; clientId?: string }): Promise<ProjectAgreement[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.clientId) params.append('clientId', filters.clientId);
    
    const query = params.toString();
    return apiClient.get<ProjectAgreement[]>(`/api/project-agreements${query ? `?${query}` : ''}`);
  }

  /**
   * Get project agreement by ID
   */
  async findById(id: string): Promise<ProjectAgreement | null> {
    try {
      return await apiClient.get<ProjectAgreement>(`/api/project-agreements/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new project agreement
   */
  async create(agreement: Partial<ProjectAgreement>): Promise<ProjectAgreement> {
    return apiClient.post<ProjectAgreement>('/api/project-agreements', agreement);
  }

  /**
   * Update an existing project agreement
   */
  async update(id: string, agreement: Partial<ProjectAgreement>): Promise<ProjectAgreement> {
    return apiClient.put<ProjectAgreement>(`/api/project-agreements/${id}`, agreement);
  }

  /**
   * Delete a project agreement
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/project-agreements/${id}`);
  }

  /**
   * Check if project agreement exists
   */
  async exists(id: string): Promise<boolean> {
    const agreement = await this.findById(id);
    return agreement !== null;
  }
}

