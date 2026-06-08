import type { ProductTourId } from '../../shared/tours/productTourDefinitions';

const STORAGE_KEY = 'pbooks_product_tours_v1';

export type TourProgressStatus = 'in_progress' | 'completed' | 'skipped';

export type TourProgressEntry = {
  stepIndex: number;
  status: TourProgressStatus;
  updatedAt: string;
};

export type TourProgressStore = Partial<Record<ProductTourId, TourProgressEntry>>;

export function loadTourProgress(): TourProgressStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TourProgressStore;
  } catch {
    return {};
  }
}

export function saveTourProgress(store: TourProgressStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function getTourProgress(tourId: ProductTourId): TourProgressEntry | null {
  return loadTourProgress()[tourId] ?? null;
}

export function updateTourProgress(
  tourId: ProductTourId,
  patch: Partial<TourProgressEntry>
): TourProgressEntry {
  const store = loadTourProgress();
  const prev = store[tourId];
  const next: TourProgressEntry = {
    stepIndex: patch.stepIndex ?? prev?.stepIndex ?? 0,
    status: patch.status ?? prev?.status ?? 'in_progress',
    updatedAt: new Date().toISOString(),
  };
  store[tourId] = next;
  saveTourProgress(store);
  return next;
}

export function clearTourProgress(tourId: ProductTourId): void {
  const store = loadTourProgress();
  delete store[tourId];
  saveTourProgress(store);
}
