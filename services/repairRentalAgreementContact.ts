import type { RentalAgreement } from '../types';

/**
 * Finds agreements with no tenant contact but a previous_agreement_id pointing at a row that has contactId.
 * Used to fix local state after the property-transfer bug (wrong field name on create).
 */
export function computeRentalAgreementContactRepairs(
  agreements: RentalAgreement[]
): Array<{ agreement: RentalAgreement; contactId: string }> {
  const byId = new Map(agreements.map((a) => [a.id, a]));
  const out: Array<{ agreement: RentalAgreement; contactId: string }> = [];
  for (const r of agreements) {
    const empty = !r.contactId || !String(r.contactId).trim();
    if (!empty || !r.previousAgreementId) continue;
    const prev = byId.get(r.previousAgreementId);
    const cid = prev?.contactId;
    if (!cid || !String(cid).trim()) continue;
    out.push({ agreement: r, contactId: String(cid).trim() });
  }
  return out;
}
