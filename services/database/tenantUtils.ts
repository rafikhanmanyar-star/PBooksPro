/**
 * Tenant Utilities
 * 
 * Provides utilities for getting the current tenant ID from authentication context.
 * This is used to filter data by tenant in the local database.
 */

/**
 * Get the current tenant ID from apiClient (set by AuthContext)
 * Returns null if no tenant is logged in
 * 
 * Uses lazy import to avoid circular dependency issues during module initialization
 */
export function getCurrentTenantId(): string | null {
    try {
        // Lazy import to avoid circular dependency - only import when needed
        const { apiClient } = require('../api/client');
        // Get tenant ID from apiClient (which gets it from localStorage)
        return apiClient.getTenantId();
    } catch (error) {
        // If apiClient isn't available yet, return null (user not logged in)
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

