import type { RentalAgreement } from '../types';
import {
  reconcileChangedLike,
  reconcileRentalAgreementsListLike,
} from '../backend/src/rentalAgreementReconcile';

export function reconcileRentalAgreementsList(agreements: RentalAgreement[]): RentalAgreement[] {
  return reconcileRentalAgreementsListLike(agreements);
}

export function rentalAgreementsReconcileChanged(before: RentalAgreement[], after: RentalAgreement[]): boolean {
  return reconcileChangedLike(before, after);
}
