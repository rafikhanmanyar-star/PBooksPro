/**
 * Navigation performance logger – helps debug slow page switches.
 * Logs to console with [NAV-PERF] prefix and timestamps.
 *
 * Enable: set localStorage.setItem('NAV_PERF_LOG', '1') in console, then navigate.
 * Disable: localStorage.removeItem('NAV_PERF_LOG')
 * In development, logs are on by default unless you disable with NAV_PERF_LOG=0.
 */
function getDev(): boolean {
  try {
    return typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
  } catch {
    return false;
  }
}
function getForceOff(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('NAV_PERF_LOG') === '0';
  } catch {
    return false;
  }
}
function getForceOn(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('NAV_PERF_LOG') === '1';
  } catch {
    return false;
  }
}

export const navPerfLogEnabled = (): boolean => {
  if (getForceOff()) return false;
  if (getForceOn()) return true;
  return getDev();
};

const ts = (): string => {
  try {
    return (performance.now() / 1000).toFixed(3) + 's';
  } catch {
    return '';
  }
};

export const navPerfLog = (message: string, detail?: Record<string, unknown>): void => {
  try {
    if (!navPerfLogEnabled()) return;
    const prefix = `[NAV-PERF] ${ts()}`;
    if (detail != null) {
      console.log(prefix, message, detail);
    } else {
      console.log(prefix, message);
    }
  } catch (_) {
    // never break app if logging fails
  }
};
