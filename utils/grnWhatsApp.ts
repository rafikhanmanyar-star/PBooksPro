import type { Category, GoodsReceiptLine, POItem } from '../types';
import { CURRENCY } from '../constants';

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });
}

/** Maps purchase-order line ids to expense category display names. */
export function buildPoLineCategoryNameMap(
  items: POItem[] | undefined,
  categories: Category[]
): Map<string, string> {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const map = new Map<string, string>();
  for (const item of items ?? []) {
    if (!item.categoryId) continue;
    const name = categoryById.get(item.categoryId);
    if (name) map.set(item.id, name);
  }
  return map;
}

function resolveGrnLineLabel(
  line: GoodsReceiptLine,
  categoryNameByPoLineId?: ReadonlyMap<string, string> | null
): string {
  const categoryName =
    line.purchaseOrderLineId && categoryNameByPoLineId
      ? categoryNameByPoLineId.get(line.purchaseOrderLineId)
      : undefined;
  return categoryName || line.itemName || line.description || 'Item';
}

export function formatGrnLinesForWhatsApp(
  lines: GoodsReceiptLine[],
  categoryNameByPoLineId?: ReadonlyMap<string, string> | null
): string {
  if (!lines.length) return 'No line items.';
  return lines
    .filter((line) => line.receivedQty > 0)
    .map((line) => {
      const label = resolveGrnLineLabel(line, categoryNameByPoLineId);
      return `• ${label}: ${line.receivedQty} × ${formatMoney(line.unitRate)} = ${formatMoney(line.lineTotal)}`;
    })
    .join('\n');
}

export function sumGrnLineTotal(lines: GoodsReceiptLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + (line.lineTotal || 0), 0) * 100) / 100;
}

export const DEFAULT_GRN_WHATSAPP_TEMPLATE =
  'Dear {contactName},\n\nWe confirm receipt of goods under GRN #{grnNumber} for PO #{poNumber} on {receivedDate}.\n\nProject: {projectName}\nTotal received: {totalAmount}\n\n{lineItems}\n\nThank you.';
