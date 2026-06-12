import type { InterfaceMode } from '../types/executiveMobile.types';

const STORAGE_KEY = 'pbooks_interface_mode';

export function readStoredInterfaceMode(): InterfaceMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'auto' || value === 'full_erp' || value === 'executive_mobile') {
      return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function persistInterfaceMode(mode: InterfaceMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function resolveEffectiveInterfaceMode(
  userMode: InterfaceMode | undefined,
  sessionFullErp: boolean
): InterfaceMode {
  if (sessionFullErp) return 'full_erp';
  return userMode ?? readStoredInterfaceMode() ?? 'auto';
}
