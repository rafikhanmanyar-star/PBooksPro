import {
  DEMO_TOUR_ID,
  DEMO_TOUR_VERSION,
  DEMO_TOUR_VERSION_KEY,
} from '../../shared/tours/demoTourMeta';
import { DEMO_TOUR_DISMISSED_KEY } from '../../config/demoEnvironment';
import { clearTourProgress } from './productTourStorage';

/** Clear dismissed flag and saved progress when the tour definition version changes. */
export function ensureDemoTourVersionFresh(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(DEMO_TOUR_VERSION_KEY);
    if (stored === String(DEMO_TOUR_VERSION)) return;
    localStorage.setItem(DEMO_TOUR_VERSION_KEY, String(DEMO_TOUR_VERSION));
    sessionStorage.removeItem(DEMO_TOUR_DISMISSED_KEY);
    clearTourProgress(DEMO_TOUR_ID);
  } catch {
    /* ignore */
  }
}

export function resetDemoTourSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DEMO_TOUR_DISMISSED_KEY);
    clearTourProgress(DEMO_TOUR_ID);
  } catch {
    /* ignore */
  }
}
