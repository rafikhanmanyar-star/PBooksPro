/**
 * AUTO-GENERATED — do not edit. Source: shared/procurement/vendorRecommendationEngine.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * Weighted vendor quotation recommendation engine.
 * Used by backend procurement comparison and mirrored for client display hints.
 */

export type QuotationComparisonCandidate = {
  quotationId: string;
  vendorId: string;
  unitPrice: number;
  totalAmount: number;
  deliveryDays: number | null;
  warrantyMonths: number | null;
  vendorRating: number | null;
  paymentTermsDays: number | null;
};

export type ScoredQuotationCandidate = QuotationComparisonCandidate & {
  recommendationScore: number;
  recommendationRank: number;
  isRecommended: boolean;
};

const WEIGHTS = {
  price: 0.4,
  delivery: 0.2,
  warranty: 0.15,
  rating: 0.2,
  payment: 0.05,
} as const;

function normalizeLowerIsBetter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || min === max) return 50;
  return Math.round(((max - value) / (max - min)) * 100);
}

function normalizeHigherIsBetter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || min === max) return 50;
  return Math.round(((value - min) / (max - min)) * 100);
}

export function parseDeliveryDays(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function parseWarrantyMonths(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function parsePaymentTermsDays(value?: string | null): number | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  const netMatch = lower.match(/net\s*(\d+)/);
  if (netMatch) return Number(netMatch[1]);
  if (lower.includes('advance') || lower.includes('cod') || lower.includes('cash')) return 0;
  const daysMatch = lower.match(/(\d+)\s*days?/);
  return daysMatch ? Number(daysMatch[1]) : null;
}

export function scoreQuotationCandidates(
  candidates: QuotationComparisonCandidate[]
): ScoredQuotationCandidate[] {
  if (!candidates.length) return [];

  const unitPrices = candidates.map((c) => c.unitPrice);
  const totals = candidates.map((c) => c.totalAmount);
  const deliveries = candidates.map((c) => c.deliveryDays).filter((d): d is number => d != null);
  const warranties = candidates.map((c) => c.warrantyMonths).filter((w): w is number => w != null);
  const ratings = candidates.map((c) => c.vendorRating).filter((r): r is number => r != null && r > 0);
  const payments = candidates.map((c) => c.paymentTermsDays).filter((p): p is number => p != null);

  const minPrice = Math.min(...unitPrices);
  const maxPrice = Math.max(...unitPrices);
  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);
  const minDelivery = deliveries.length ? Math.min(...deliveries) : null;
  const maxDelivery = deliveries.length ? Math.max(...deliveries) : null;
  const minWarranty = warranties.length ? Math.min(...warranties) : null;
  const maxWarranty = warranties.length ? Math.max(...warranties) : null;
  const minRating = ratings.length ? Math.min(...ratings) : null;
  const maxRating = ratings.length ? Math.max(...ratings) : null;
  const minPayment = payments.length ? Math.min(...payments) : null;
  const maxPayment = payments.length ? Math.max(...payments) : null;

  const scored = candidates.map((candidate) => {
    const priceScore =
      (normalizeLowerIsBetter(candidate.unitPrice, minPrice, maxPrice) +
        normalizeLowerIsBetter(candidate.totalAmount, minTotal, maxTotal)) /
      2;

    let deliveryScore = 50;
    if (candidate.deliveryDays != null && minDelivery != null && maxDelivery != null) {
      deliveryScore = normalizeLowerIsBetter(candidate.deliveryDays, minDelivery, maxDelivery);
    }

    let warrantyScore = 50;
    if (candidate.warrantyMonths != null && minWarranty != null && maxWarranty != null) {
      warrantyScore = normalizeHigherIsBetter(candidate.warrantyMonths, minWarranty, maxWarranty);
    }

    let ratingScore = 50;
    if (candidate.vendorRating != null && candidate.vendorRating > 0 && minRating != null && maxRating != null) {
      ratingScore = normalizeHigherIsBetter(candidate.vendorRating, minRating, maxRating);
    }

    let paymentScore = 50;
    if (candidate.paymentTermsDays != null && minPayment != null && maxPayment != null) {
      paymentScore = normalizeHigherIsBetter(candidate.paymentTermsDays, minPayment, maxPayment);
    }

    const recommendationScore = Math.round(
      priceScore * WEIGHTS.price +
        deliveryScore * WEIGHTS.delivery +
        warrantyScore * WEIGHTS.warranty +
        ratingScore * WEIGHTS.rating +
        paymentScore * WEIGHTS.payment
    );

    return { ...candidate, recommendationScore, recommendationRank: 0, isRecommended: false };
  });

  scored.sort((a, b) => b.recommendationScore - a.recommendationScore);
  return scored.map((row, idx) => ({
    ...row,
    recommendationRank: idx + 1,
    isRecommended: idx === 0,
  }));
}
