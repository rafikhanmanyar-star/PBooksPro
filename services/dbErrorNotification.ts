/**
 * User-visible alerts for local SQLite failures and API write conflicts (409).
 * Dispatches `pbooks:db-error` — NotificationProvider shows a modal (see NotificationContext).
 */

export const PBOOKS_DB_ERROR_EVENT = 'pbooks:db-error';

export interface DbErrorNotificationDetail {
  message: string;
  title?: string;
}

export function formatDatabaseErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (lower.includes('sqlite_busy') || lower.includes('database is locked') || /\bbusy\b/.test(lower)) {
    return (
      'The database is temporarily locked (another operation may be in progress). Wait a moment and try again.\n\n' +
      raw
    );
  }
  if (lower.includes('operator is not unique') && lower.includes('unknown')) {
    return (
      'Could not save: database type resolution failed on the server (often fixed by updating the API server).\n\n' +
      raw
    );
  }
  if (
    lower.includes('constraint') ||
    (lower.includes('unique') && !lower.includes('operator is not unique')) ||
    lower.includes('foreign key') ||
    lower.includes('not null')
  ) {
    return 'Could not save: data conflict or invalid reference.\n\n' + raw;
  }
  return raw;
}

export function notifyDatabaseError(error: unknown, options?: { title?: string; context?: string }): void {
  if (typeof window === 'undefined') return;
  let message = formatDatabaseErrorMessage(error);
  if (options?.context) {
    message = `${options.context}\n\n${message}`;
  }
  window.dispatchEvent(
    new CustomEvent(PBOOKS_DB_ERROR_EVENT, {
      detail: { message, title: options?.title ?? 'Could not save' } satisfies DbErrorNotificationDetail,
    })
  );
}

/**
 * Show a modal when a user-initiated API write returns 409 (conflict / lock / version).
 * Skips bulk /state/ sync so background sync does not spam dialogs.
 */
export function notifyApiConflictIfUserFacing(
  err: { status?: number; code?: string; message?: string; error?: string },
  endpoint: string,
  method: string
): void {
  if (typeof window === 'undefined') return;
  if (err.status !== 409) return;
  const code = err.code;
  if (!code || !['VERSION_CONFLICT', 'CONFLICT', 'LOCK_HELD', 'LOCK_LOST'].includes(code)) return;
  const m = (method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return;
  if (endpoint.includes('/state/')) return;

  const serverMsg =
    typeof err.message === 'string' && err.message.trim()
      ? err.message.trim()
      : typeof err.error === 'string' && err.error.trim()
        ? err.error.trim()
        : '';

  let userMsg = serverMsg || 'The server could not apply your change.';
  if (code === 'LOCK_HELD') {
    userMsg = 'This record is locked by another user or session. Try again in a moment.';
  } else if (code === 'LOCK_LOST') {
    userMsg = 'Your edit lock expired. Refresh the page and try again.';
  } else if (code === 'VERSION_CONFLICT') {
    userMsg =
      'This record was updated on the server. Refresh to load the latest version, then try again.' +
      (serverMsg ? `\n\n${serverMsg}` : '');
  } else if (code === 'CONFLICT') {
    userMsg = 'Another change conflicts with yours. Refresh and try again.' + (serverMsg ? `\n\n${serverMsg}` : '');
  }

  window.dispatchEvent(
    new CustomEvent(PBOOKS_DB_ERROR_EVENT, {
      detail: { message: userMsg, title: 'Could not save' } satisfies DbErrorNotificationDetail,
    })
  );
}
