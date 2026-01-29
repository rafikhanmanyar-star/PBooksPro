/**
 * Warehouses API Repository
 *
 * Provides API-based access to warehouses (master data).
 * Used for sync to cloud when creating/updating from Settings → Inventory → Warehouses.
 */

import { apiClient } from '../client';
import { Warehouse } from '../../../types';

export class WarehousesApiRepository {
  /**
   * Get all warehouses
   */
  async findAll(): Promise<Warehouse[]> {
    return apiClient.get<Warehouse[]>('/warehouses');
  }

  /**
   * Get warehouse by ID
   */
  async findById(id: string): Promise<Warehouse | null> {
    try {
      return await apiClient.get<Warehouse>(`/warehouses/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create or update warehouse (upsert).
   * Server POST /warehouses handles both create and update by id.
   */
  async save(warehouse: Partial<Warehouse>): Promise<Warehouse> {
    return apiClient.post<Warehouse>('/warehouses', warehouse);
  }

  /**
   * Delete a warehouse
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/warehouses/${id}`);
  }
}
