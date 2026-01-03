/**
 * Projects API Repository
 * 
 * Provides API-based access to projects data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Project } from '../../../types';

export class ProjectsApiRepository {
  /**
   * Get all projects
   */
  async findAll(): Promise<Project[]> {
    return apiClient.get<Project[]>('/api/projects');
  }

  /**
   * Get project by ID
   */
  async findById(id: string): Promise<Project | null> {
    try {
      return await apiClient.get<Project>(`/api/projects/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new project
   */
  async create(project: Partial<Project>): Promise<Project> {
    return apiClient.post<Project>('/api/projects', project);
  }

  /**
   * Update an existing project
   */
  async update(id: string, project: Partial<Project>): Promise<Project> {
    return apiClient.put<Project>(`/api/projects/${id}`, project);
  }

  /**
   * Delete a project
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/projects/${id}`);
  }

  /**
   * Check if project exists
   */
  async exists(id: string): Promise<boolean> {
    const project = await this.findById(id);
    return project !== null;
  }
}

