/**
 * Client-side deployment version check for PBooks Pro Cloud (web / PWA).
 * Compares the build-time version with /version.json served from the static host.
 */

export type DeploymentVersionInfo = {
  version: string;
  buildTime: string;
  packageVersion?: string;
};

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 5_000;

function isElectronClient(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { electronAPI?: unknown }).electronAPI;
}

function shouldRunVersionCheck(): boolean {
  if (typeof window === 'undefined') return false;
  if (isElectronClient()) return false;
  return true;
}

/** Build-time version baked into the bundle by Vite. */
export function getEmbeddedBuildVersion(): string {
  return (import.meta.env.VITE_APP_BUILD_VERSION as string) || (import.meta.env.APP_VERSION as string) || '0.0.0';
}

export function getEmbeddedBuildTime(): string | null {
  const raw = import.meta.env.VITE_APP_BUILD_TIME as string | undefined;
  return raw || null;
}

export function buildVersionJsonPath(baseUrl = '/', cacheBust = true): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const suffix = cacheBust ? `?t=${Date.now()}` : '';
  return `${normalized}version.json${suffix}`;
}

export function versionJsonUrl(cacheBust = true): string {
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return buildVersionJsonPath(base, cacheBust);
}

/**
 * Returns true when server deployment version differs from the running build.
 */
export function isNewerDeployment(
  embeddedVersion: string,
  serverVersion: string
): boolean {
  if (!serverVersion || !embeddedVersion) return false;
  return serverVersion.trim() !== embeddedVersion.trim();
}

export async function fetchDeploymentVersion(): Promise<DeploymentVersionInfo | null> {
  if (!shouldRunVersionCheck()) return null;

  try {
    const response = await fetch(versionJsonUrl(true), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as DeploymentVersionInfo;
    if (!data?.version) return null;
    return data;
  } catch {
    return null;
  }
}

export type VersionCheckResult = {
  updateAvailable: boolean;
  currentVersion: string;
  serverVersion?: string;
  buildTime?: string;
};

export async function checkVersion(): Promise<VersionCheckResult> {
  const currentVersion = getEmbeddedBuildVersion();
  if (!shouldRunVersionCheck()) {
    return { updateAvailable: false, currentVersion };
  }

  const remote = await fetchDeploymentVersion();
  if (!remote) {
    return { updateAvailable: false, currentVersion };
  }

  const updateAvailable = isNewerDeployment(currentVersion, remote.version);
  return {
    updateAvailable,
    currentVersion,
    serverVersion: remote.version,
    buildTime: remote.buildTime,
  };
}

export type VersionUpdateCallback = (serverVersion: string, clientVersion: string) => void;

class VersionCheckService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startupTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private onUpdateAvailable?: VersionUpdateCallback;

  start(onUpdateAvailable?: VersionUpdateCallback): void {
    if (!shouldRunVersionCheck()) return;

    this.onUpdateAvailable = onUpdateAvailable;
    this.stop();

    this.startupTimeoutId = setTimeout(() => {
      void this.runCheck();
    }, STARTUP_DELAY_MS);

    this.intervalId = setInterval(() => {
      void this.runCheck();
    }, CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.startupTimeoutId) {
      clearTimeout(this.startupTimeoutId);
      this.startupTimeoutId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async runCheck(): Promise<void> {
    const result = await checkVersion();
    if (result.updateAvailable && result.serverVersion && this.onUpdateAvailable) {
      this.onUpdateAvailable(result.serverVersion, result.currentVersion);
    }
  }

  reloadForUpdate(): void {
    window.location.reload();
  }
}

let instance: VersionCheckService | null = null;

export function getVersionCheckService(): VersionCheckService {
  if (!instance) {
    instance = new VersionCheckService();
  }
  return instance;
}

export const versionCheck = getVersionCheckService();
