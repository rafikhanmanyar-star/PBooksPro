import { ApiClient } from './api/client';

export interface VersionInfo {
  version: string;
  buildDate?: string;
  environment?: string;
}

class VersionService {
  private apiClient: ApiClient;
  private checkInterval: number = 5 * 60 * 1000; // Check every 5 minutes
  private intervalId: NodeJS.Timeout | null = null;
  private currentVersion: string;
  private onUpdateAvailable?: (serverVersion: string, clientVersion: string) => void;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    // Get current client version from build-time injection
    this.currentVersion = (import.meta.env.APP_VERSION as string) || '1.0.0';
  }

  /**
   * Get current client version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get stored last known server version from localStorage
   */
  getLastKnownVersion(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('app_last_known_version');
  }

  /**
   * Store last known server version
   */
  setLastKnownVersion(version: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('app_last_known_version', version);
    localStorage.setItem('app_last_version_check', new Date().toISOString());
  }

  /**
   * Compare two semantic version strings
   * Returns: 1 if version1 > version2, -1 if version1 < version2, 0 if equal
   */
  compareVersions(version1: string, version2: string): number {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }
    
    return 0;
  }

  /**
   * Get the API base URL
   */
  private getApiBaseUrl(): string {
    // Use the same logic as ApiClient - get from environment or use default
    const envUrl = (import.meta.env.VITE_API_URL as string) || 'https://pbookspro-api.onrender.com/api';
    // Remove /api suffix if present for the app-info endpoint
    return envUrl.replace(/\/api$/, '');
  }

  /**
   * Check if a new version is available
   */
  async checkForUpdate(): Promise<{ available: boolean; serverVersion?: string; clientVersion: string }> {
    try {
      const baseUrl = this.getApiBaseUrl();
      const response = await fetch(`${baseUrl}/app-info/version`);
      if (!response.ok) {
        throw new Error('Failed to fetch version');
      }
      
      const versionInfo: VersionInfo = await response.json();
      const serverVersion = versionInfo.version;
      const clientVersion = this.currentVersion;
      
      // Compare versions
      const comparison = this.compareVersions(serverVersion, clientVersion);
      const available = comparison > 0; // Server version is newer
      
      // Update last known version
      if (available || serverVersion !== this.getLastKnownVersion()) {
        this.setLastKnownVersion(serverVersion);
      }
      
      return { available, serverVersion, clientVersion };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { available: false, clientVersion: this.currentVersion };
    }
  }

  /**
   * Start periodic version checking
   */
  startPeriodicCheck(onUpdateAvailable?: (serverVersion: string, clientVersion: string) => void): void {
    this.onUpdateAvailable = onUpdateAvailable;
    
    // Clear existing interval if any
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    // Initial check after 30 seconds (allow app to load)
    setTimeout(() => {
      this.checkForUpdate().then(result => {
        if (result.available && this.onUpdateAvailable && result.serverVersion) {
          this.onUpdateAvailable(result.serverVersion, result.clientVersion);
        }
      });
    }, 30000);
    
    // Then check periodically
    this.intervalId = setInterval(async () => {
      const result = await this.checkForUpdate();
      if (result.available && this.onUpdateAvailable && result.serverVersion) {
        this.onUpdateAvailable(result.serverVersion, result.clientVersion);
      }
    }, this.checkInterval);
  }

  /**
   * Stop periodic version checking
   */
  stopPeriodicCheck(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get time since last version check
   */
  getLastCheckTime(): Date | null {
    if (typeof window === 'undefined') return null;
    const lastCheck = localStorage.getItem('app_last_version_check');
    return lastCheck ? new Date(lastCheck) : null;
  }
}

// Create singleton instance
let versionServiceInstance: VersionService | null = null;

export function getVersionService(): VersionService {
  if (!versionServiceInstance) {
    // Lazy import ApiClient to avoid circular dependencies
    versionServiceInstance = new VersionService(new ApiClient());
  }
  return versionServiceInstance;
}

export const versionService = getVersionService();
