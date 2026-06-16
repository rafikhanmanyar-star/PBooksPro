import type { ContractExpenseCategoryItem } from '../types';
import type { BillPoLine } from '../types';
import type { PoBillingContext } from '../services/purchaseOrdersApi';

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Default bill lines from billable PO quantities (after GRN). */
export function buildDefaultPoBillLinesFromContext(ctx: PoBillingContext): BillPoLine[] {
  const lines: BillPoLine[] = [];
  for (const poLine of ctx.lines) {
    if (poLine.billableQty <= 0) continue;
    lines.push({
      purchaseOrderLineId: poLine.id,
      billedQty: poLine.billableQty,
      unitRate: poLine.unitRate,
      lineTotal: roundMoney(poLine.billableQty * poLine.unitRate),
    });
  }
  return lines;
}

/** Mirror PO line categories onto bill expense category rows (qty/rate from PO bill lines). */
export function buildExpenseCategoryItemsFromPo(
  ctx: PoBillingContext,
  poBillLines: BillPoLine[]
): ContractExpenseCategoryItem[] {
  return ctx.lines
    .filter((line) => !!line.categoryId)
    .map((poLine) => {
      const draft = poBillLines.find((b) => b.purchaseOrderLineId === poLine.id);
      const qty = draft?.billedQty ?? 0;
      const rate = draft?.unitRate ?? poLine.unitRate;
      const netValue = draft?.lineTotal ?? roundMoney(qty * rate);
      return {
        id: `po_ec_${poLine.id}`,
        categoryId: poLine.categoryId!,
        unit: 'quantity' as const,
        quantity: qty,
        pricePerUnit: rate,
        netValue,
      };
    });
}

export function sumExpenseCategoryNet(items: ContractExpenseCategoryItem[]): number {
  return roundMoney(items.reduce((sum, item) => sum + (item.netValue || 0), 0));
}
