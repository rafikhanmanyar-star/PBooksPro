import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRetentionSummary,
  calculateMaximumPayable,
  calculateRetentionAmount,
  validateRetentionThreshold,
} from './contractRetentionCore.js';

describe('contractRetentionCore', () => {
  it('calculates percentage retention', () => {
    assert.equal(
      calculateRetentionAmount(10_000_000, {
        retentionType: 'PERCENTAGE',
        retentionPercentage: 5,
      }),
      500_000
    );
    assert.equal(calculateMaximumPayable(10_000_000, 500_000), 9_500_000);
  });

  it('calculates fixed amount retention', () => {
    assert.equal(
      calculateRetentionAmount(10_000_000, {
        retentionType: 'FIXED_AMOUNT',
        retentionAmount: 750_000,
      }),
      750_000
    );
  });

  it('returns no retention for NONE', () => {
    assert.equal(
      calculateRetentionAmount(10_000_000, { retentionType: 'NONE' }),
      0
    );
  });

  it('warns at 90% of maximum payable', () => {
    const summary = buildRetentionSummary({
      contractValue: 10_000_000,
      paidAmount: 8_700_000,
      fields: { retentionType: 'PERCENTAGE', retentionPercentage: 5 },
    });
    assert.equal(summary.alertLevel, 'warning');
    assert.equal(summary.maximumPayable, 9_500_000);
    assert.equal(summary.warningThreshold, 8_550_000);
  });

  it('critical at retention threshold', () => {
    const v = validateRetentionThreshold({
      contractValue: 10_000_000,
      paidAmount: 9_550_000,
      fields: { retentionType: 'PERCENTAGE', retentionPercentage: 5 },
    });
    assert.equal(v.alertLevel, 'critical');
    assert.ok(v.title?.includes('Retention Threshold'));
  });

  it('handles contract without retention', () => {
    const summary = buildRetentionSummary({
      contractValue: 1_000_000,
      paidAmount: 900_000,
      fields: { retentionType: 'NONE' },
    });
    assert.equal(summary.alertLevel, 'none');
    assert.equal(summary.maximumPayable, 1_000_000);
  });
});
