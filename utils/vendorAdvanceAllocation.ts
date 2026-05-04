/** Client-side FIFO: apply supplier advances oldest-first across vendor bills oldest-first until each bill is cleared or advances exhausted. */

export type AdvanceRemainRow = { id: string; advanceDate: string; remainingAmount: number };

export type BillDueSlice = { id: string; issueDate: string; dueAmount: number };

export type BillAllocationPlan = {
  adjustments: { advanceId: string; amount: number }[];
  cash: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Returns per-bill plan: allocations from named advances + cash remainder to match due. */
export function allocateFifoAcrossVendorBills(
  advances: AdvanceRemainRow[],
  bills: BillDueSlice[]
): Map<string, BillAllocationPlan> {
  const result = new Map<string, BillAllocationPlan>();
  const remByAdv = new Map<string, number>();
  const sortedAdv = [...advances].sort((a, b) => {
    const d = a.advanceDate.localeCompare(b.advanceDate);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  for (const a of sortedAdv) {
    remByAdv.set(a.id, roundMoney(a.remainingAmount));
  }

  const sortedBills = [...bills].sort((a, b) => {
    const d = a.issueDate.localeCompare(b.issueDate);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  for (const bill of sortedBills) {
    let need = roundMoney(bill.dueAmount);
    const adjAgg = new Map<string, number>();
    if (need <= 0) {
      result.set(bill.id, { adjustments: [], cash: 0 });
      continue;
    }
    for (const adv of sortedAdv) {
      if (need <= 0) break;
      const left = roundMoney(remByAdv.get(adv.id) ?? 0);
      if (left <= 0) continue;
      const take = roundMoney(Math.min(left, need));
      if (take <= 0) continue;
      adjAgg.set(adv.id, roundMoney((adjAgg.get(adv.id) ?? 0) + take));
      remByAdv.set(adv.id, roundMoney(left - take));
      need = roundMoney(need - take);
    }
    const cash = roundMoney(need);
    const adjustments = [...adjAgg.entries()].map(([advanceId, amount]) => ({
      advanceId,
      amount: roundMoney(amount),
    }));
    result.set(bill.id, { adjustments, cash });
  }
  return result;
}
