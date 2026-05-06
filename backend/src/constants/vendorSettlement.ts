/** Reference prefix on Expense transactions that mirror the cash/bank leg of vendor_bill_advance_clearing JE. */
export const VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX = 'VSET:';

export function isVendorSettlementCashMirrorReference(ref: string | null | undefined): boolean {
  const s = typeof ref === 'string' ? ref.trim() : '';
  return s.startsWith(VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX);
}

export function journalEntryIdFromVendorSettlementCashReference(ref: string | null | undefined): string | null {
  const s = typeof ref === 'string' ? ref.trim() : '';
  if (!isVendorSettlementCashMirrorReference(s)) return null;
  const id = s.slice(VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX.length).trim();
  return id || null;
}
