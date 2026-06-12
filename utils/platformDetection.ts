/**
 * Platform Detection Utility
 *
 * Detects whether the application is running on mobile or desktop
 * to determine database strategy and layout mode.
 */

import {
  getViewportDimensions,
  getViewportProfile,
  hasMobileUserAgent,
  isElectronRuntime,
  isTouchDevice,
  MOBILE_MAX_WIDTH,
  TABLET_MAX_WIDTH,
} from './viewportDetection';

export { MOBILE_MAX_WIDTH, TABLET_MAX_WIDTH };

/**
 * Check if the application is running on a mobile device / mobile viewport.
 * Uses live viewport width (visualViewport when available) plus mobile UA fallback
 * for cases where the address bar affects innerWidth inconsistently.
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (isElectron()) return false;

  const profile = getViewportProfile();
  if (profile.isMobileViewport) return true;
  // UA fallback: phone in odd zoom / standalone PWA with delayed resize
  return profile.hasMobileUserAgent && profile.width <= TABLET_MAX_WIDTH;
}

/** Tablet in portrait orientation (executive mobile criteria). */
export function isTabletPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  if (isElectron()) return false;
  return getViewportProfile().isTabletPortrait;
}

/** True when executive mobile shell should activate in `auto` interface mode. */
export function isExecutiveViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (isElectron()) return false;
  return getViewportProfile().isExecutiveViewport;
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
  return isElectronRuntime();
}

/**
 * Get the database mode for the current platform
 */
export function getDatabaseMode(): 'local' | 'cloud' | 'hybrid' {
  if (isMobileDevice()) {
    return 'cloud';
  }
  return 'hybrid';
}

/** @deprecated Use getViewportDimensions from viewportDetection */
export function getInnerWidth(): number {
  return getViewportDimensions().width;
}

export { hasMobileUserAgent, isTouchDevice, getViewportProfile };
