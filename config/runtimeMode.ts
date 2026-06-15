/**
 * Build-time runtime mode (Architecture v2.1).
 * Standard Desktop/Cloud builds set VITE_LOCAL_ONLY=false at compile time.
 */

/** True only for deprecated offline builds (`npm run electron:offline:*`). */
export const IS_LEGACY_SQLITE_BUILD =
  import.meta.env.VITE_LOCAL_ONLY === 'true' || import.meta.env.VITE_LOCAL_ONLY === true;

/** PostgreSQL API mode — default for Desktop and Cloud editions. */
export const IS_POSTGRES_API_BUILD = !IS_LEGACY_SQLITE_BUILD;
