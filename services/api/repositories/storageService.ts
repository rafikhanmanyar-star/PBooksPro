/**
 * Generic Storage Service using Repository Pattern
 * All data is prefixed with a tenant_Id for multi-tenancy.
 */

import { apiClient } from '../client';

export abstract class StorageService<T extends { id?: string; tenant_Id?: string }> {
    protected abstract endpoint: string;

    /**
     * Get a single item by ID
     */
    async get(id: string): Promise<T> {
        return apiClient.get<T>(`${this.endpoint}/${id}`);
    }

    /**
     * Get all items for the current tenant
     */
    async getAll(): Promise<T[]> {
        return apiClient.get<T[]>(this.endpoint);
    }

    /**
     * Save an item (Create or Update)
     * Automatically ensures tenant_Id is set before saving
     */
    async save(data: T): Promise<T> {
        const tenantId = apiClient.getTenantId();
        if (!tenantId) {
            throw new Error('No tenant ID found. Please login.');
        }

        const itemToSave = {
            ...data,
            tenant_Id: tenantId
        };

        if (data.id) {
            return apiClient.put<T>(`${this.endpoint}/${data.id}`, itemToSave);
        } else {
            return apiClient.post<T>(this.endpoint, itemToSave);
        }
    }

    /**
     * Delete an item by ID
     */
    async delete(id: string): Promise<void> {
        return apiClient.delete(`${this.endpoint}/${id}`);
    }
}
