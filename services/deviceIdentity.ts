/**
 * Device Identity Service
 *
 * Generates and persists a unique device UUID in localStorage.
 * Used to track which device produced a sync operation — essential for:
 * - Conflict resolution (same user, two devices)
 * - Audit trails
 * - Server-side deduplication
 * - Lock attribution
 *
 * The device ID is stable across sessions and user switches.
 */

const DEVICE_ID_KEY = 'pbookspro_device_id';

function generateUUID(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the persistent device ID. Creates one if it doesn't exist.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    // SSR or non-browser environment — return a transient ID
    return `device_transient_${Date.now()}`;
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log(`[DeviceIdentity] Generated new device ID: ${deviceId}`);
  }
  return deviceId;
}

/**
 * Check if a device ID has been generated.
 */
export function hasDeviceId(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }
  return localStorage.getItem(DEVICE_ID_KEY) !== null;
}
