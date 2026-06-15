import { describe, expect, it } from 'vitest';
import {
  computePoBillingStatus,
  validateBillAgainstPurchaseOrder,
} from '../shared/procurement/purchaseOrderBillingCore';

describe('purchaseOrderBillingCore', () => {
  it('blocks billing cancelled or unapproved POs', () => {
    expect(
      validateBillAgainstPurchaseOrder({
        poStatus: 'Cancelled',
        poTotalAmount: 1000,
        poBilledAmount: 0,
        billAmount: 100,
        poVendorId: 'v1',
        billVendorId: 'v1',
      }).ok
    ).toBe(false);

    expect(
      validateBillAgainstPurchaseOrder({
        poStatus: 'Draft',
        poTotalAmount: 1000,
        poBilledAmount: 0,
        billAmount: 100,
        poVendorId: 'v1',
        billVendorId: 'v1',
      }).ok
    ).toBe(false);
  });

  it('blocks billing above remaining PO balance', () => {
    const result = validateBillAgainstPurchaseOrder({
      poStatus: 'Approved',
      poTotalAmount: 1000,
      poBilledAmount: 900,
      billAmount: 200,
      poVendorId: 'v1',
      billVendorId: 'v1',
    });
    expect(result.ok).toBe(false);
  });

  it('computes partially and fully billed statuses', () => {
    expect(computePoBillingStatus(1000, 0)).toBe('Approved');
    expect(computePoBillingStatus(1000, 400)).toBe('Partially Billed');
    expect(computePoBillingStatus(1000, 1000)).toBe('Fully Billed');
  });
});
