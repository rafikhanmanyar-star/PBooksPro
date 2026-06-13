import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getContractBilledTotal,
  getContractRemainingBillable,
  validateContractBillAmount,
} from './contractBillingCore.js';

describe('contractBillingCore', () => {
  it('sums billed amounts for a contract', () => {
    const bills = [
      { id: 'b1', contractId: 'c1', amount: 2000 },
      { id: 'b2', contractId: 'c1', amount: 1500 },
      { id: 'b3', contractId: 'c2', amount: 9000 },
    ];
    assert.equal(getContractBilledTotal(bills, 'c1'), 3500);
    assert.equal(getContractBilledTotal(bills, 'c1', 'b1'), 1500);
  });

  it('calculates remaining billable value', () => {
    assert.equal(getContractRemainingBillable(6000, 2500), 3500);
    assert.equal(getContractRemainingBillable(6000, 7000), 0);
  });

  it('flags bill amounts that exceed remaining contract value', () => {
    const result = validateContractBillAmount({
      contractValue: 6000,
      alreadyBilled: 0,
      billAmount: 25000,
      contractNumber: 'CONT-003',
      currencyLabel: 'PKR',
    });
    assert.equal(result.exceeds, true);
    assert.equal(result.remaining, 6000);
    assert.match(result.message ?? '', /remaining contract value/i);
  });

  it('allows bill amounts within remaining contract value', () => {
    const result = validateContractBillAmount({
      contractValue: 6000,
      alreadyBilled: 4000,
      billAmount: 2000,
    });
    assert.equal(result.exceeds, false);
    assert.equal(result.remaining, 2000);
  });
});
