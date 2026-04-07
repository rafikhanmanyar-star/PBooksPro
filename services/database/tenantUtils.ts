/**
 * Tenant Utilities (Single-Tenant Local-Only Mode)
 *
 * In local-only architecture there is only one tenant ('local').
 * These helpers exist so callers that still reference them keep compiling,
 * but tenant-based filtering is permanently disabled.
 */

export function getCurrentTenantId(): string {
    return 'local';
}

export function shouldFilterByTenant(): boolean {
    return false;
}
