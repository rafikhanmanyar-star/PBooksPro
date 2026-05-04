import { roundMoney } from '../financial/validation.js';

export type AdvanceRemains = {
  id: string;
  advanceDate: string;
  remainingAmount: number;
};

/**
 * Allocate bill_amount against advances in FIFO order (oldest advance_date then id).
 * Pure — does not validate tenant or touch the database.
 */
export function allocateAdvancesFifo(advances: AdvanceRemains[], billAmount: number): { advanceId: string; amount: number }[] {
  const sorted = [...advances].sort((a, b) => {
    const d = a.advanceDate.localeCompare(b.advanceDate);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  let left = roundMoney(billAmount);
  const out: { advanceId: string; amount: number }[] = [];
  if (left <= 0) return out;
  for (const a of sorted) {
    if (left <= 0) break;
    const rem = roundMoney(a.remainingAmount);
    if (rem <= 0) continue;
    const take = roundMoney(Math.min(left, rem));
    if (take > 0) {
      out.push({ advanceId: a.id, amount: take });
      left = roundMoney(left - take);
    }
  }
  return out;
}
