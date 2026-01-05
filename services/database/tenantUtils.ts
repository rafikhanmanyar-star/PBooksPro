/**
 * Tenant Utilities
 * 
 * Provides utilities for getting the current tenant ID from authentication context.
 * This is used to filter data by tenant in the local database.
 */

import { apiClient } from '../api/client';

/**
 * Get the current tenant ID from apiClient (set by AuthContext)
 * Returns null if no tenant is logged in
 */
export function getCurrentTenantId(): string | null {
    try {
        // Get tenant ID from apiClient (which gets it from localStorage)
        return apiClient.getTenantId();
    } catch (error) {
        console.warn('Failed to get tenant ID:', error);
        return null;
    }
}

/**
 * Check if tenant_id filtering should be applied
 * Returns true if tenant_id is available and should be used for filtering
 */
export function shouldFilterByTenant(): boolean {
    return getCurrentTenantId() !== null;
}

