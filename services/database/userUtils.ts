/**
 * User Utilities
 * 
 * Provides utilities for getting the current user ID from authentication context.
 * This is used to track which user created/modified records in the local database.
 */

/**
 * Get the current user ID from localStorage or AppState
 * Returns null if no user is logged in
 * 
 * Reads directly from localStorage to avoid circular dependency issues during module initialization.
 * This matches how apiClient.getTenantId() works, but avoids importing apiClient.
 */
export function getCurrentUserId(): string | null {
    try {
        if (typeof window !== 'undefined') {
            // Try to get from localStorage first (set during login)
            const userId = localStorage.getItem('user_id');
            if (userId) {
                return userId;
            }
            
            // Fallback: try to get from current user in app state
            // This requires accessing the app context, which may cause circular dependencies
            // So we'll primarily rely on localStorage
            return null;
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Check if user_id tracking should be applied
 */
export function shouldTrackUserId(): boolean {
    return getCurrentUserId() !== null;
}

