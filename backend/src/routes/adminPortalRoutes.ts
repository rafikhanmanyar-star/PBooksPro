/**
 * Legacy PBooksPro admin portal API (/api/admin/*).
 * Separate admin_users JWT auth — not tenant-scoped.
 */
export { default as adminPortalRouter } from '../adminPortal/routes/index.js';
