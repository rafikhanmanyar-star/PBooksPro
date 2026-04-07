/**
 * User Utilities
 * 
 * Provides utilities for getting the current user ID from authentication context.
 * In local-only mode, always returns 'local-user'.
 */

import { isLocalOnlyMode } from '../../config/apiUrl';

/**
 * Get the current user ID from localStorage
 * In local-only mode, returns 'local-user' always.
 */
export function getCurrentUserId(): string | null {
    if (isLocalOnlyMode()) return 'local-user';
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

