/**
 * Rental agreement renewal chain reconciliation (one Active per chain, broker fee on first row only).
 */
import assert from 'node:assert';
import { reconcileRentalAgreementsList } from '../services/rentalAgreementReconcile';
import { RentalAgreementStatus } from '../types';
import type { RentalAgreement } from '../types';

function ra(
  partial: Omit<RentalAgreement, 'agreementNumber' | 'monthlyRent' | 'rentDueDate'> &
    Partial<Pick<RentalAgreement, 'agreementNumber' | 'monthlyRent' | 'rentDueDate'>>
): RentalAgreement {
  return {
    agreementNumber: partial.agreementNumber ?? 'AGR-1',
    monthlyRent: partial.monthlyRent ?? 1000,
    rentDueDate: partial.rentDueDate ?? 1,
    ...partial,
  };
}

function run() {
  const contact = 't1';
  const prop = 'p1';

  const five: RentalAgreement[] = [
    ra({
      id: 'a1',
      contactId: contact,
      propertyId: prop,
      startDate: '2022-01-15',
      endDate: '2023-01-31',
      status: RentalAgreementStatus.RENEWED,
      brokerFee: 45000,
      agreementNumber: 'AGR-0043',
    }),
    ra({
      id: 'a2',
      contactId: contact,
      propertyId: prop,
      startDate: '2023-02-01',
      endDate: '2024-03-15',
      status: RentalAgreementStatus.ACTIVE,
      brokerFee: 45000,
      agreementNumber: 'AGR-0044',
    }),
    ra({
      id: 'a3',
      contactId: contact,
      propertyId: prop,
      startDate: '2024-02-01',
      endDate: '2025-03-15',
      status: RentalAgreementStatus.ACTIVE,
      brokerFee: 45000,
      agreementNumber: 'AGR-0045',
    }),
    ra({
      id: 'a4',
      contactId: contact,
      propertyId: prop,
      startDate: '2025-02-01',
      endDate: '2026-03-15',
      status: RentalAgreementStatus.ACTIVE,
      brokerFee: 45000,
      agreementNumber: 'AGR-0046',
    }),
    ra({
      id: 'a5',
      contactId: contact,
      propertyId: prop,
      startDate: '2026-02-01',
      endDate: '2027-01-31',
      status: RentalAgreementStatus.ACTIVE,
      brokerFee: 45000,
      agreementNumber: 'AGR-0047',
    }),
  ];

  const out = reconcileRentalAgreementsList(five);
  const byId = new Map(out.map((x) => [x.id, x]));

  assert.strictEqual(byId.get('a5')?.status, RentalAgreementStatus.ACTIVE);
  assert.strictEqual(byId.get('a1')?.status, RentalAgreementStatus.RENEWED);
  assert.strictEqual(byId.get('a2')?.status, RentalAgreementStatus.RENEWED);
  assert.strictEqual(byId.get('a3')?.status, RentalAgreementStatus.RENEWED);
  assert.strictEqual(byId.get('a4')?.status, RentalAgreementStatus.RENEWED);

  assert.strictEqual(byId.get('a1')?.previousAgreementId, undefined);
  assert.strictEqual(byId.get('a2')?.previousAgreementId, 'a1');
  assert.strictEqual(byId.get('a3')?.previousAgreementId, 'a2');
  assert.strictEqual(byId.get('a4')?.previousAgreementId, 'a3');
  assert.strictEqual(byId.get('a5')?.previousAgreementId, 'a4');

  assert.strictEqual(byId.get('a1')?.brokerFee, 45000);
  assert.strictEqual(byId.get('a2')?.brokerFee, 0);
  assert.strictEqual(byId.get('a3')?.brokerFee, 0);
  assert.strictEqual(byId.get('a4')?.brokerFee, 0);
  assert.strictEqual(byId.get('a5')?.brokerFee, 0);

  // Lone Renewed row must not be flipped to Active (renewal before successor exists in the list).
  const loneRenewed = reconcileRentalAgreementsList([
    ra({
      id: 'solo',
      contactId: contact,
      propertyId: prop,
      startDate: '2025-02-01',
      endDate: '2026-01-31',
      status: RentalAgreementStatus.RENEWED,
      agreementNumber: 'AGR-0104',
    }),
  ]);
  assert.strictEqual(loneRenewed[0]?.status, RentalAgreementStatus.RENEWED);

  console.log('rentalAgreementReconcile.test.ts: OK');
}

run();
