/**
 * Runs before React boot to detect a newer deployment and purge stale PWA caches.
 * Prevents refresh from loading an old JS bundle after a release.
 */

const RELOAD_GUARD_KEY = 'pbooks_version_reload_guard';

export async function ensureLatestAppBundle(): Promise<void> {
  if (typeof window === 'undefined') return;

  const embedded = document.querySelector('meta[name="app-build-version"]')?.getAttribute('content');
  if (!embedded || embedded === 'dev') return;

  const isElectron = Boolean(window.electronAPI?.isElectron);

  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;

    const remote = (await response.json()) as { version?: string };
    const serverVersion = remote.version?.trim();
    if (!serverVersion || serverVersion === embedded) return;

    const guard = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (guard === serverVersion) return;

    sessionStorage.setItem(RELOAD_GUARD_KEY, serverVersion);

    if (!isElectron && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    window.location.reload();
  } catch {
    /* offline or version.json unavailable — continue with cached bundle */
  }
}
