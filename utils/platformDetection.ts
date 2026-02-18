/**
 * Platform Detection Utility
 * 
 * Detects whether the application is running on mobile or desktop
 * to determine database strategy:
 * - Desktop: Local PostgreSQL + Cloud PostgreSQL (with offline support)
 * - Mobile: Cloud PostgreSQL only (requires internet)
 */

/**
 * Check if the application is running on a mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // Electron is always desktop - has local SQLite, never treat as mobile
  if (isElectron()) return false;

  // Check screen width (existing pattern in codebase)
  const isSmallScreen = window.innerWidth < 768;
  // Check user agent for mobile devices
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  // Consider it mobile if small screen OR mobile user agent
  return isSmallScreen || isMobileUserAgent;
}

/**
 * Check if the application is running on a desktop device
 */
export function isDesktopDevice(): boolean {
  return !isMobileDevice();
}

/**
 * Check if the platform can run local PostgreSQL
 * Only desktop devices can run local PostgreSQL
 */
export function canRunLocalPostgreSQL(): boolean {
  return isDesktopDevice();
}

/**
 * Get the current platform type
 */
export function getPlatform(): 'mobile' | 'desktop' {
  return isMobileDevice() ? 'mobile' : 'desktop';
}

/**
 * Check if running in Electron (desktop app)
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/**
 * Get the database mode for the current platform
 */
export function getDatabaseMode(): 'local' | 'cloud' | 'hybrid' {
  if (isMobileDevice()) {
    return 'cloud'; // Mobile: cloud only
  }
  return 'hybrid'; // Desktop: local + cloud
}
