/**
 * Categories API Repository
 * 
 * Provides API-based access to categories data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Category } from '../../../types';

export class CategoriesApiRepository {
  /**
   * Get all categories
   */
  async findAll(): Promise<Category[]> {
    return apiClient.get<Category[]>('/categories');
  }

  /**
   * Get category by ID
   */
  async findById(id: string): Promise<Category | null> {
    try {
      return await apiClient.get<Category>(`/categories/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new category
   */
  async create(category: Partial<Category>): Promise<Category> {
    return apiClient.post<Category>('/categories', category);
  }

  /**
   * Update an existing category
   */
  async update(id: string, category: Partial<Category>): Promise<Category> {
    return apiClient.put<Category>(`/categories/${id}`, category);
  }

  /**
   * Delete a category
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/categories/${id}`);
  }

  /**
   * Check if category exists
   */
  async exists(id: string): Promise<boolean> {
    const category = await this.findById(id);
    return category !== null;
  }
}

