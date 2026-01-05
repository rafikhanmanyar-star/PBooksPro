/**
 * Tenant Utilities
 * 
 * Provides utilities for getting the current tenant ID from authentication context.
 * This is used to filter data by tenant in the local database.
 */

/**
 * Get the current tenant ID directly from localStorage
 * Returns null if no tenant is logged in
 * 
 * Reads directly from localStorage to avoid circular dependency issues during module initialization.
 * This matches how apiClient.getTenantId() works, but avoids importing apiClient.
 */
export function getCurrentTenantId(): string | null {
    try {
        // Read directly from localStorage to avoid circular dependency
        // This is the same source that apiClient uses, so it's safe
        if (typeof window !== 'undefined') {
            const tenantId = localStorage.getItem('tenant_id');
            return tenantId;
        }
        return null;
    } catch (error) {
        // If localStorage isn't available, return null (user not logged in or SSR)
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

