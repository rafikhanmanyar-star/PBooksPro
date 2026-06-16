import type { GoodsReceiptLine } from '../types';
import { CURRENCY } from '../constants';

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });
}

export function formatGrnLinesForWhatsApp(lines: GoodsReceiptLine[]): string {
  if (!lines.length) return 'No line items.';
  return lines
    .filter((line) => line.receivedQty > 0)
    .map((line) => {
      const label = line.itemName || line.description || 'Item';
      return `• ${label}: ${line.receivedQty} × ${formatMoney(line.unitRate)} = ${formatMoney(line.lineTotal)}`;
    })
    .join('\n');
}

export function sumGrnLineTotal(lines: GoodsReceiptLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + (line.lineTotal || 0), 0) * 100) / 100;
}

export const DEFAULT_GRN_WHATSAPP_TEMPLATE =
  'Dear {contactName},\n\nWe confirm receipt of goods under GRN #{grnNumber} for PO #{poNumber} on {receivedDate}.\n\nProject: {projectName}\nTotal received: {totalAmount}\n\n{lineItems}\n\nThank you.';
