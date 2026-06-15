import { describe, expect, it } from 'vitest';
import { scoreQuotationCandidates } from '../shared/procurement/vendorRecommendationEngine';

describe('vendorRecommendationEngine', () => {
  it('ranks lower price and higher rating ahead', () => {
    const scored = scoreQuotationCandidates([
      {
        quotationId: 'q1',
        vendorId: 'v1',
        unitPrice: 120,
        totalAmount: 1200,
        deliveryDays: 14,
        warrantyMonths: 6,
        vendorRating: 3,
        paymentTermsDays: 30,
      },
      {
        quotationId: 'q2',
        vendorId: 'v2',
        unitPrice: 100,
        totalAmount: 1000,
        deliveryDays: 10,
        warrantyMonths: 12,
        vendorRating: 4.5,
        paymentTermsDays: 45,
      },
    ]);

    expect(scored[0]?.quotationId).toBe('q2');
    expect(scored[0]?.isRecommended).toBe(true);
    expect(scored[0]?.recommendationRank).toBe(1);
    expect(scored[1]?.recommendationRank).toBe(2);
  });
});
