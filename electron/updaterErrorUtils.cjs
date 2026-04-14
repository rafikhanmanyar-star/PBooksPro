/**
 * When a new GitHub release is created, the tag (and sometimes the release page) can appear
 * before all assets finish uploading. electron-updater then GETs e.g. api-server.yml or latest.yml
 * and gets 404 — not a problem with the user's machine.
 */

const RELEASE_PENDING_USER =
  'A new version is still being published on GitHub. Please try “Check for updates” again in a few minutes.';

function isReleaseMetadataPendingError(err) {
  if (!err) return false;
  const status = err.statusCode ?? err.status ?? err.response?.statusCode;
  if (status === 404) return true;
  const msg = String(err.message || err);
  const lower = msg.toLowerCase();
  if (lower.includes('404') && (lower.includes('releases/download') || lower.includes('.yml'))) {
    return true;
  }
  if (/cannot find.*\.yml/i.test(msg) && lower.includes('github.com') && lower.includes('releases')) {
    return true;
  }
  return false;
}

/** First line only; drop stack trace that electron sometimes concatenates into message. */
function primaryErrorLine(err) {
  const raw = err && err.message ? String(err.message) : String(err);
  const lines = raw.split(/\r?\n/);
  const first = lines[0] || raw;
  if (lines.length > 1 && /^\s*at\s/.test(lines[1])) {
    return first.trim();
  }
  return raw.trim().split(/\r?\n/)[0].trim();
}

/**
 * @returns {{ userMessage: string, isReleasePending: boolean, logLine: string }}
 */
function formatUpdaterError(err) {
  if (isReleaseMetadataPendingError(err)) {
    return {
      userMessage: RELEASE_PENDING_USER,
      isReleasePending: true,
      logLine: '[Updater] Release metadata not ready yet (GitHub upload in progress).',
    };
  }
  const line = primaryErrorLine(err);
  return {
    userMessage: line.length > 500 ? line.slice(0, 497) + '…' : line,
    isReleasePending: false,
    logLine: '[Updater] ' + line,
  };
}

function createUpdaterLogger() {
  return {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    debug: (...args) => console.log(...args),
    error: (message, error) => {
      if (error && isReleaseMetadataPendingError(error)) {
        console.warn('[Updater] Release metadata not ready yet (GitHub upload in progress).');
        return;
      }
      if (error && error.message) {
        console.error(message, primaryErrorLine(error));
        return;
      }
      console.error(message, error);
    },
  };
}

module.exports = {
  formatUpdaterError,
  isReleaseMetadataPendingError,
  createUpdaterLogger,
  RELEASE_PENDING_USER,
};
