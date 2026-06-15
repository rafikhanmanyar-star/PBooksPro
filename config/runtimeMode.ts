/**
 * Build-time runtime mode (Architecture v2.1).
 * PostgreSQL is the only supported database engine for the application client.
 */

/** Legacy offline SQLite builds were removed in Phase 4. Always false. */
export const IS_LEGACY_SQLITE_BUILD = false;

/** All standard Desktop and Cloud builds use PostgreSQL via apiClient. */
export const IS_POSTGRES_API_BUILD = true;
