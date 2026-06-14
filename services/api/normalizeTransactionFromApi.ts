import type { Transaction } from '../../types';
import { toDateOnly } from '../../utils/dateUtils';

function normalizeTransactionDate(raw: Record<string, unknown>): string {
  const candidates = [raw.date, raw.transaction_date, raw.transactionDate, raw.created_at, raw.createdAt];
  for (const candidate of candidates) {
    if (candidate == null || String(candidate).trim() === '') continue;
    return toDateOnly(candidate as string | Date);
  }
  return toDateOnly(new Date());
}

/** Normalizes a transaction row from GET /transactions, bulk state, or incremental sync. */
export function normalizeTransactionFromApi(t: Record<string, unknown>): Transaction {
  const raw = t as Record<string, any>;
  return {
    id: String(raw.id),
    type: raw.type as Transaction['type'],
    subtype: raw.subtype || undefined,
    amount: typeof raw.amount === 'number' ? raw.amount : parseFloat(String(raw.amount ?? '0')) || 0,
    date: normalizeTransactionDate(raw),
    description: raw.description || undefined,
    accountId: String(raw.account_id || raw.accountId || ''),
    fromAccountId: raw.from_account_id || raw.fromAccountId || undefined,
    toAccountId: raw.to_account_id || raw.toAccountId || undefined,
    categoryId: raw.category_id || raw.categoryId || undefined,
    contactId: raw.contact_id || raw.contactId || undefined,
    vendorId: raw.vendor_id || raw.vendorId || undefined,
    projectId: raw.project_id || raw.projectId || undefined,
    buildingId: raw.building_id || raw.buildingId || undefined,
    propertyId: raw.property_id || raw.propertyId || undefined,
    unitId: raw.unit_id || raw.unitId || undefined,
    invoiceId: raw.invoice_id || raw.invoiceId || undefined,
    billId: raw.bill_id || raw.billId || undefined,
    contractId: raw.contract_id || raw.contractId || undefined,
    agreementId: raw.agreement_id || raw.agreementId || undefined,
    batchId: raw.batch_id || raw.batchId || undefined,
    projectAssetId: raw.project_asset_id || raw.projectAssetId || undefined,
    ownerId: raw.owner_id || raw.ownerId || undefined,
    isSystem: raw.is_system === true || raw.is_system === 1 || raw.isSystem === true || false,
    userId: raw.user_id || raw.userId || undefined,
    payslipId: raw.payslip_id || raw.payslipId || undefined,
    reference: raw.reference || undefined,
    children: raw.children || undefined,
    version:
      typeof raw.version === 'number'
        ? raw.version
        : raw.version != null
          ? parseInt(String(raw.version), 10)
          : undefined,
  };
}
