/**
 * Gate for the privileged admin bootstrap route (`POST /api/admin/create-admin`).
 *
 * This endpoint provisions a platform super-admin and is intentionally
 * UNAUTHENTICATED, so it is a critical attack surface. It is DISABLED by default
 * and may ONLY be enabled for local development. It must never be mounted — nor
 * function — in staging or production.
 *
 * Enabled iff BOTH hold:
 *   - ENABLE_ADMIN_BOOTSTRAP === 'true'
 *   - NODE_ENV === 'development'
 */
export interface AdminBootstrapEnv {
  NODE_ENV?: string;
  ENABLE_ADMIN_BOOTSTRAP?: string;
}

export function isAdminBootstrapEnabled(env: AdminBootstrapEnv = process.env): boolean {
  return env.ENABLE_ADMIN_BOOTSTRAP === 'true' && env.NODE_ENV === 'development';
}

/** One-line startup banner emitted when the bootstrap route is mounted. */
export const ADMIN_BOOTSTRAP_WARNING =
  '⚠️  [SECURITY] Admin bootstrap route ENABLED (POST /api/admin/create-admin). ' +
  'This is an UNAUTHENTICATED super-admin provisioning endpoint. It is only permitted ' +
  'in development (NODE_ENV=development + ENABLE_ADMIN_BOOTSTRAP=true). ' +
  'Never enable this in staging or production.';
