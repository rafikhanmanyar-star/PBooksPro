/**
 * Vendors API Repository
 * 
 * Provides API-based access to vendors data.
 */

import { apiClient } from '../client';
import { Vendor } from '../../../types';
import type { PaginatedResponse } from '../../../shared/types/pagination';
import { appendEntitySearchParams } from '../entitySearchParams';

export class VendorsApiRepository {
    /**
     * Get all vendors (bulk sync).
     */
    async findAll(): Promise<Vendor[]> {
        return apiClient.get<Vendor[]>('/vendors');
    }

    /**
     * Paginated vendor search (PERF-A3.4).
     */
    async findPage(params: {
        page: number;
        pageSize: number;
        search?: string;
        sortBy?: string;
        sortDirection?: 'asc' | 'desc';
    }): Promise<PaginatedResponse<Vendor>> {
        const q = new URLSearchParams();
        appendEntitySearchParams(q, params);
        return apiClient.get<PaginatedResponse<Vendor>>(`/vendors?${q.toString()}`);
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
     * Delete a vendor (soft delete; optional version for optimistic locking)
     */
    async delete(id: string, version?: number): Promise<void> {
        const qs = version !== undefined && Number.isFinite(version) ? `?version=${version}` : '';
        await apiClient.delete(`/vendors/${id}${qs}`);
    }

    /**
     * Check if vendor exists
     */
    async exists(id: string): Promise<boolean> {
        const vendor = await this.findById(id);
        return vendor !== null;
    }
}
