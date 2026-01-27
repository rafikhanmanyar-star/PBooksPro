/**
 * Inventory Items API Repository
 *
 * Provides API-based access to inventory items (master data).
 * Used for sync to cloud when creating/updating from Settings → Inventory.
 */

import { apiClient } from '../client';
import { InventoryItem } from '../../../types';

export class InventoryItemsApiRepository {
  /**
   * Get all inventory items
   */
  async findAll(): Promise<InventoryItem[]> {
    return apiClient.get<InventoryItem[]>('/inventory-items');
  }

  /**
   * Get inventory item by ID
   */
  async findById(id: string): Promise<InventoryItem | null> {
    try {
      return await apiClient.get<InventoryItem>(`/inventory-items/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create or update inventory item (upsert).
   * Server POST /inventory-items handles both create and update by id.
   */
  async save(item: Partial<InventoryItem>): Promise<InventoryItem> {
    return apiClient.post<InventoryItem>('/inventory-items', item);
  }

  /**
   * Delete an inventory item
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/inventory-items/${id}`);
  }
}
