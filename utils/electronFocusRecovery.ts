/**
 * Electron (Windows): webContents can lose keyboard focus while the BrowserWindow
 * still appears focused — typing stops until minimize/restore. This module restores
 * OS-level focus to the renderer via main-process webContents.focus() without
 * stealing DOM focus from buttons or custom controls.
 */

const THROTTLE_MS = 100;
let lastWebContentsFocus = 0;

function getApi(): { focusWebContents?: () => Promise<void> } | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { electronAPI?: { focusWebContents?: () => Promise<void> } }).electronAPI;
}

function requestWebContentsFocus(reason: string): void {
  const api = getApi();
  if (!api?.focusWebContents) return;
  const now = Date.now();
  if (now - lastWebContentsFocus < THROTTLE_MS) return;
  lastWebContentsFocus = now;
  void api.focusWebContents().catch(() => {
    /* ignore */
  });
  if (typeof localStorage !== 'undefined' && localStorage.getItem('PBOOKS_DEBUG_FOCUS') === '1') {
    console.log('[FocusRecovery] webContents.focus via', reason);
  }
}

/**
 * Restore OS-level keyboard routing to the renderer (Electron/Windows).
 * Safe to call from route transitions (e.g. after logout when the login screen mounts).
 */
export function requestElectronWebContentsFocus(reason = 'manual'): void {
  requestWebContentsFocus(reason);
}

/**
 * Call once at app bootstrap (index.tsx), only effective in Electron with preload support.
 */
export function setupElectronFocusRecovery(): void {
  if (typeof window === 'undefined' || !getApi()?.focusWebContents) return;

  // Any click/touch — user expects typing to work after interacting with the window
  window.addEventListener(
    'pointerdown',
    () => {
      requestWebContentsFocus('pointerdown');
    },
    { capture: true }
  );

  // Tab into window from another app
  window.addEventListener('focus', () => {
    requestWebContentsFocus('window-focus');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      requestWebContentsFocus('visibility');
    }
  });

  /**
   * If DOM focus is stuck on <body> while the document is visible, OS-level keyboard
   * routing may still be broken — nudge webContents only (do not focus a random input).
   */
  window.setInterval(() => {
    if (!document.hasFocus() || document.hidden) return;
    if (document.activeElement !== document.body) return;
    try {
      console.warn('[FocusRecovery] activeElement is body; restoring webContents keyboard focus');
    } catch {
      /* ignore */
    }
    requestWebContentsFocus('interval-body-active');
  }, 2000);

  if (typeof localStorage !== 'undefined' && localStorage.getItem('PBOOKS_DEBUG_FOCUS') === '1') {
    document.addEventListener('focusin', (e) => console.log('[FocusIn]', e.target));
    document.addEventListener('focusout', (e) => console.log('[FocusOut]', e.target));
  }
}
