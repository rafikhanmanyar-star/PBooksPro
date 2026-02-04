/**
 * Vendors API Repository
 * 
 * Provides API-based access to vendors data.
 */

import { apiClient } from '../client';
import { Vendor } from '../../../types';

export class VendorsApiRepository {
    /**
     * Get all vendors
     */
    async findAll(): Promise<Vendor[]> {
        return apiClient.get<Vendor[]>('/vendors');
    }

    /**
     * Get vendor by ID
     */
    async findById(id: string): Promise<Vendor | null> {
        try {
            return await apiClient.get<Vendor>(`/vendors/${id}`);
        } catch (error: any) {
            if (error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Create a new vendor
     */
    async create(vendor: Partial<Vendor>): Promise<Vendor> {
        try {
            return await apiClient.post<Vendor>('/vendors', vendor);
        } catch (error: any) {
            console.error('❌ VendorsApiRepository.create failed:', error);
            throw error;
        }
    }

    /**
     * Update an existing vendor
     */
    async update(id: string, vendor: Partial<Vendor>): Promise<Vendor> {
        try {
            return await apiClient.put<Vendor>(`/vendors/${id}`, vendor);
        } catch (error: any) {
            console.error('❌ VendorsApiRepository.update failed:', error);
            throw error;
        }
    }

    /**
     * Delete a vendor
     */
    async delete(id: string): Promise<void> {
        await apiClient.delete(`/vendors/${id}`);
    }

    /**
     * Check if vendor exists
     */
    async exists(id: string): Promise<boolean> {
        const vendor = await this.findById(id);
        return vendor !== null;
    }
}
