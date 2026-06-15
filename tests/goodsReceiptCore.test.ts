import { describe, expect, it } from 'vitest';
import {
  computeRemainingQty,
  validateBillAgainstReceived,
  validateReceiptLineQty,
} from '../shared/procurement/goodsReceiptCore';

describe('goodsReceiptCore', () => {
  it('computes remaining quantity', () => {
    expect(computeRemainingQty(100, 30)).toBe(70);
    expect(computeRemainingQty(10, 15)).toBe(0);
  });

  it('rejects over-receipt', () => {
    const result = validateReceiptLineQty({
      orderedQty: 100,
      alreadyReceivedQty: 80,
      receiptQty: 25,
    });
    expect(result.ok).toBe(false);
  });

  it('allows valid receipt', () => {
    const result = validateReceiptLineQty({
      orderedQty: 100,
      alreadyReceivedQty: 80,
      receiptQty: 20,
    });
    expect(result.ok).toBe(true);
  });

  it('blocks billing above received value', () => {
    const result = validateBillAgainstReceived({
      poReceivedAmount: 1000,
      poBilledAmount: 800,
      billAmount: 300,
    });
    expect(result.ok).toBe(false);
  });

  it('requires receipt before billing', () => {
    const result = validateBillAgainstReceived({
      poReceivedAmount: 0,
      poBilledAmount: 0,
      billAmount: 100,
    });
    expect(result.ok).toBe(false);
  });
});
