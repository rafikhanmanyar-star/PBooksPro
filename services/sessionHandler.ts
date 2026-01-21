/**
 * Session Handler
 * Stores the current active User and Tenant (Organization) objects.
 */

import { User, Tenant } from '../context/AuthContext';

class SessionHandler {
    private currentUser: User | null = null;
    private currentTenant: Tenant | null = null;

    /**
     * Set the current session
     */
    setSession(user: User, tenant: Tenant): void {
        this.currentUser = user;
        this.currentTenant = tenant;
        
        // Also persist to localStorage for recovery after refresh
        if (typeof window !== 'undefined') {
            localStorage.setItem('session_user', JSON.stringify(user));
            localStorage.setItem('session_tenant', JSON.stringify(tenant));
        }
    }

    /**
     * Get the current active user
     */
    getUser(): User | null {
        if (!this.currentUser && typeof window !== 'undefined') {
            const stored = localStorage.getItem('session_user');
            if (stored) {
                try {
                    this.currentUser = JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to parse stored user', e);
                }
            }
        }
        return this.currentUser;
    }

    /**
     * Get the current active tenant
     */
    getTenant(): Tenant | null {
        if (!this.currentTenant && typeof window !== 'undefined') {
            const stored = localStorage.getItem('session_tenant');
            if (stored) {
                try {
                    this.currentTenant = JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to parse stored tenant', e);
                }
            }
        }
        return this.currentTenant;
    }

    /**
     * Clear the current session
     */
    clearSession(): void {
        this.currentUser = null;
        this.currentTenant = null;
        if (typeof window !== 'undefined') {
            localStorage.removeItem('session_user');
            localStorage.removeItem('session_tenant');
        }
    }

    /**
     * Check if a session is active
     */
    isActive(): boolean {
        return !!(this.getUser() && this.getTenant());
    }
}

export const sessionHandler = new SessionHandler();
