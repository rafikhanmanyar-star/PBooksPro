/**
 * Renderer stability: heartbeat, global errors, recovery hints, optional long-task logging.
 * Main watchdog uses stability:heartbeat — keep this interval running when UI is responsive.
 */

import { withTimeout } from './safeInvoke';

const HEARTBEAT_MS = 1000;
const IPC_LOG_TIMEOUT_MS = 5000;
const SAFE_MODE_KEY = 'pbooks_stability_crash_count';
/** Require this many *distinct* counted incidents before enabling safe mode (was 3; chunk retries could fire multiple events). */
const SAFE_MODE_THRESHOLD = 5;
/** Dedupe: same message within this window counts once. */
const DEDUPE_MS = 12_000;
/** '1' = last run exited cleanly (beforeunload). '0' or missing = unclean exit possible. */
const LAST_EXIT_CLEAN_KEY = 'pbooks_last_exit_clean';

const recentErrorKeys = new Map<string, number>();
/** Last time `bumpCrashCount` actually incremented the counter (for auto-clear). */
let lastCountedIncidentAt = Date.now();

function shouldCountThisError(message: string): boolean {
  const m = (message || '').trim();
  if (!m) return false;
  // Benign / non-actionable browser noise — do not count toward safe mode
  if (/ResizeObserver loop limit exceeded/i.test(m)) return false;
  if (/ResizeObserver loop completed with undelivered notifications/i.test(m)) return false;
  if (/chrome-extension:\/\//i.test(m)) return false;
  if (/moz-extension:\/\//i.test(m)) return false;
  const now = Date.now();
  for (const [k, t] of recentErrorKeys) {
    if (now - t > DEDUPE_MS) recentErrorKeys.delete(k);
  }
  const key = m.slice(0, 240);
  if (recentErrorKeys.has(key)) return false;
  recentErrorKeys.set(key, now);
  return true;
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: { sendStabilityHeartbeat?: () => void } }).electronAPI;
}

function getApi(): {
  sendStabilityHeartbeat?: () => void;
  stabilityLog?: (level: string, message: string, detail?: string) => Promise<unknown>;
  stabilityDbCheckpoint?: () => Promise<{ ok: boolean }>;
} | undefined {
  return (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI as
    | {
        sendStabilityHeartbeat?: () => void;
        stabilityLog?: (level: string, message: string, detail?: string) => Promise<unknown>;
        stabilityDbCheckpoint?: () => Promise<{ ok: boolean }>;
      }
    | undefined;
}

async function logStability(level: string, message: string, detail?: string): Promise<void> {
  const api = getApi();
  if (!api?.stabilityLog) {
    console[level === 'error' ? 'error' : 'warn'](`[Stability] ${message}`, detail || '');
    return;
  }
  try {
    await withTimeout(api.stabilityLog(level, message, detail), IPC_LOG_TIMEOUT_MS, 'stability:log');
  } catch {
    console.error('[Stability] log failed:', message);
  }
}

function bumpCrashCount(message: string): void {
  if (!shouldCountThisError(message)) return;
  try {
    const n = parseInt(localStorage.getItem(SAFE_MODE_KEY) || '0', 10) + 1;
    lastCountedIncidentAt = Date.now();
    localStorage.setItem(SAFE_MODE_KEY, String(n));
    if (n >= SAFE_MODE_THRESHOLD) {
      localStorage.setItem('pbooks_safe_mode', '1');
      window.dispatchEvent(new CustomEvent('pbooks-safe-mode', { detail: { count: n } }));
    }
  } catch {
    /* ignore */
  }
}

function setupCrashRecoveryHints(): void {
  try {
    const last = localStorage.getItem(LAST_EXIT_CLEAN_KEY);
    localStorage.setItem(LAST_EXIT_CLEAN_KEY, '0');
    if (last === '0') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('pbooks-recovery-notice'));
      }, 0);
    }
    const markClean = () => {
      try {
        localStorage.setItem(LAST_EXIT_CLEAN_KEY, '1');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('beforeunload', markClean);
    window.addEventListener('pagehide', markClean);
  } catch {
    /* ignore */
  }
}

/** Optional: WAL checkpoint before heavy operations (call from app code when needed). */
export async function stabilityDbCheckpoint(): Promise<void> {
  const api = getApi();
  if (!api?.stabilityDbCheckpoint) return;
  try {
    await withTimeout(api.stabilityDbCheckpoint(), 15000, 'stability:db-checkpoint');
  } catch (e) {
    console.warn('[Stability] checkpoint failed:', e);
  }
}

export function initStabilityLayer(): void {
  if (typeof window === 'undefined') return;

  setupCrashRecoveryHints();

  window.addEventListener(
    'error',
    (event) => {
      const msg = event.message || event.error?.message || 'Error';
      bumpCrashCount(msg);
      const stack = event.error?.stack || String(event.error || '');
      void logStability('error', msg, stack);
      console.error('Global Error Detected:', event.error || event.message);
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.stack : String(event.reason);
    bumpCrashCount(event.reason instanceof Error ? event.reason.message : reason);
    void logStability('error', 'Unhandled Promise rejection', reason);
    console.error('Unhandled Promise Rejection:', event.reason);
  });

  // Heartbeat for main-process watchdog
  if (isElectron()) {
    (window as unknown as { __heartbeat?: number }).__heartbeat = Date.now();
    setInterval(() => {
      (window as unknown as { __heartbeat?: number }).__heartbeat = Date.now();
      try {
        getApi()?.sendStabilityHeartbeat?.();
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_MS);
  }

  // Long tasks (UI jank) — optional
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration > 200) {
            void logStability('warn', `Slow UI task ${e.duration.toFixed(0)}ms`, e.name || 'longtask');
          }
        }
      });
      po.observe({ entryTypes: ['longtask'] } as PerformanceObserverInit);
    } catch {
      /* longtask not supported */
    }
  }

  // Safe mode: decay crash count while app stays open (every 10 min), and clear safe mode when count reaches 0
  const decayCrashCount = () => {
    try {
      const c = parseInt(localStorage.getItem(SAFE_MODE_KEY) || '0', 10);
      if (c > 0) localStorage.setItem(SAFE_MODE_KEY, String(Math.max(0, c - 1)));
      if (parseInt(localStorage.getItem(SAFE_MODE_KEY) || '0', 10) === 0) {
        localStorage.removeItem('pbooks_safe_mode');
        window.dispatchEvent(new CustomEvent('pbooks-safe-mode-cleared'));
      }
    } catch {
      /* ignore */
    }
  };
  window.setTimeout(decayCrashCount, 10 * 60 * 1000);
  window.setInterval(decayCrashCount, 10 * 60 * 1000);

  // After 5 minutes with no *counted* stability incidents, clear safe mode
  window.setInterval(() => {
    try {
      if (localStorage.getItem('pbooks_safe_mode') !== '1') return;
      if (Date.now() - lastCountedIncidentAt < 5 * 60 * 1000) return;
      localStorage.removeItem('pbooks_safe_mode');
      localStorage.setItem(SAFE_MODE_KEY, '0');
      recentErrorKeys.clear();
      window.dispatchEvent(new CustomEvent('pbooks-safe-mode-cleared'));
    } catch {
      /* ignore */
    }
  }, 60 * 1000);

  // Enterprise: soft DOM focus when focus is stuck on body (typing appears dead)
  if (localStorage.getItem('PBOOKS_DISABLE_INPUT_FOCUS_RECOVERY') !== '1') {
    window.setInterval(() => {
      if (!document.hasFocus() || document.hidden) return;
      const ae = document.activeElement;
      if (ae && ae instanceof Node && !document.body.contains(ae)) {
        try {
          document.body.focus();
        } catch {
          /* ignore */
        }
        return;
      }
      if (document.activeElement !== document.body) return;
      // Skip combobox-style filters (e.g. report project pickers): focusing them opens the dropdown
      // and feels like "clicking anywhere" activated the combo when focus was on body after a click
      // on non-focusable content (tables, charts).
      const el = document.querySelector(
        'input:not([type="hidden"]):not([disabled]):not([data-pbooks-skip-focus-recovery]), textarea:not([disabled])'
      ) as HTMLElement | null;
      if (el && el.offsetParent !== null) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    }, 2000);
  }
}

export function isSafeModeEnabled(): boolean {
  try {
    return localStorage.getItem('pbooks_safe_mode') === '1';
  } catch {
    return false;
  }
}

/** Clears safe mode and crash counter (e.g. user confirmed the issue is resolved). */
export function clearSafeModeAndReset(): void {
  try {
    localStorage.removeItem('pbooks_safe_mode');
    localStorage.setItem(SAFE_MODE_KEY, '0');
    recentErrorKeys.clear();
    lastCountedIncidentAt = Date.now();
    window.dispatchEvent(new CustomEvent('pbooks-safe-mode-cleared'));
  } catch {
    /* ignore */
  }
}
