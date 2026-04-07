/**
 * System accounts/categories are stored once with this tenant_id so every org shares the same rows (canonical ids: sys-acc-*, sys-cat-*).
 */
export const GLOBAL_SYSTEM_TENANT_ID = '__system__' as const;
