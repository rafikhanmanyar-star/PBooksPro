/**
 * Shared API response shapes for frontend and backend alignment.
 * Import from `@/shared/apiContract` or relative path.
 */

export const API_ERROR_CODES = {
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

/** Standard API envelope: success is true only after a committed DB transaction (or read success). */
export type ApiSuccess<T> = { success: true; data: T; error: null };
export type ApiFailure = {
  success: false;
  data: null;
  error: { code: string; message: string };
};
