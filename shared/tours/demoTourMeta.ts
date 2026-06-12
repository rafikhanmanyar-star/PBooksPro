/**
 * Live demo guided tour metadata — keep website chapter IDs in sync with demo_overview steps.
 */
import type { ProductTourId } from './productTourDefinitions';
import { getTourDefinition } from './productTourDefinitions';

/** Bump when demo_overview steps change so returning visitors get the new tour. */
export const DEMO_TOUR_VERSION = 2;

export const DEMO_TOUR_ID: ProductTourId = 'demo_overview';

/** localStorage key — paired with DEMO_TOUR_VERSION in demo tour bootstrap. */
export const DEMO_TOUR_VERSION_KEY = 'pbooks_demo_tour_version';

/** Website video chapter id → demo_overview step index (0-based). */
export const DEMO_TOUR_CHAPTER_TO_STEP: Record<string, number> = {
  'ch-setup': 1,
  'ch-coa': 3,
  'ch-selling': 4,
  'ch-selling-pay': 7,
  'ch-vendors': 8,
  'ch-bills': 9,
  'ch-rental': 12,
  'ch-rental-reports': 15,
  'ch-pl': 16,
};

export function resolveDemoTourStepIndex(
  chapterId?: string | null,
  stepParam?: string | null
): number {
  const tour = getTourDefinition(DEMO_TOUR_ID);
  const max = tour.steps.length - 1;

  if (chapterId) {
    const mapped = DEMO_TOUR_CHAPTER_TO_STEP[chapterId];
    if (mapped != null) return Math.max(0, Math.min(mapped, max));
  }

  if (stepParam != null && stepParam !== '') {
    const n = parseInt(stepParam, 10);
    if (!Number.isNaN(n)) return Math.max(0, Math.min(n, max));
  }

  return 0;
}

export function readDemoTourStepFromLocation(search: string): number {
  const params = new URLSearchParams(search);
  return resolveDemoTourStepIndex(
    params.get('demo_chapter'),
    params.get('demo_tour_step')
  );
}

/** Website chapter list (titles aligned with marketing site). */
export const DEMO_TOUR_WEBSITE_CHAPTERS = [
  { id: 'ch-setup', title: 'Contacts & Assets Setup', startSeconds: 0 },
  { id: 'ch-coa', title: 'Chart of Accounts', startSeconds: 90 },
  { id: 'ch-selling', title: 'Project Selling: Plan → Agreements → Invoices', startSeconds: 180 },
  { id: 'ch-selling-pay', title: 'Payment Receiving (Sales)', startSeconds: 270 },
  { id: 'ch-vendors', title: 'Vendors & Construction Contracts', startSeconds: 360 },
  { id: 'ch-bills', title: 'Bills & Bill Payments', startSeconds: 450 },
  { id: 'ch-rental', title: 'Rental: Agreements → Invoices → Payments', startSeconds: 540 },
  { id: 'ch-rental-reports', title: 'Rental Reports', startSeconds: 630 },
  { id: 'ch-pl', title: 'Financial Statements & P&L', startSeconds: 720 },
] as const;
