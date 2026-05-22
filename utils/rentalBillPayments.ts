import {
  Bill,
  Category,
  type ContractExpenseCategoryItem,
  ExpenseBearerType,
  Property,
  RentalAgreement,
  Transaction,
  TransactionType,
} from '../types';

/**
 * `expenseCategoryItems` should be an array, but PostgreSQL JSON / API layers may return a single object or other shape.
 * Always normalize before `.forEach` / spread to avoid runtime "forEach is not a function".
 */
export function getBillExpenseCategoryItemsArray(
  bill: Pick<Bill, 'expenseCategoryItems'>
): ContractExpenseCategoryItem[] {
  const raw = bill.expenseCategoryItems as unknown;
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as ContractExpenseCategoryItem[];
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (
      'categoryId' in o ||
      'netValue' in o ||
      'pricePerUnit' in o ||
      'quantity' in o ||
      'unit' in o ||
      'amount' in o
    ) {
      return [raw as ContractExpenseCategoryItem];
    }
  }
  return [];
}

/** Who bears the rental bill cost: persisted flag or inferred from property / agreement / building. */
export function getExpenseBearerType(
  bill: Bill,
  state: { rentalAgreements: { id: string }[] }
): ExpenseBearerType {
  if (bill.expenseBearerType) return bill.expenseBearerType;
  if (bill.projectAgreementId && state.rentalAgreements?.some(ra => ra.id === bill.projectAgreementId))
    return 'tenant';
  if (bill.propertyId) return 'owner';
  if (bill.buildingId) return 'building';
  return 'building';
}

/**
 * Tenant-allocation bills are funded by the tenant/security path; they must not reduce owner rental income
 * in Owner Rental Income summaries (see OwnerPayoutsReport, owner breakdown balances).
 */
export function billAffectsOwnerRentalIncomeLedger(
  bill: Bill,
  state: { rentalAgreements: { id: string }[] }
): boolean {
  return getExpenseBearerType(bill, state) !== 'tenant';
}

/**
 * Primary expense category on a bill: top-level categoryId, else first line in expenseCategoryItems
 * (bills with line-item categories often omit bill.categoryId).
 */
export function getPrimaryBillExpenseCategoryId(bill: Bill): string | undefined {
  if (bill.categoryId) return bill.categoryId;
  const lineItems = getBillExpenseCategoryItemsArray(bill);
  return lineItems[0]?.categoryId;
}

/**
 * Expense category for a rental bill payment: use "(Tenant)" variant when the bill is tenant-allocated.
 */
export function resolveExpenseCategoryForBillPayment(
  bill: Bill,
  categories: Category[],
  rentalAgreements: RentalAgreement[]
): string | undefined {
  const baseId = getPrimaryBillExpenseCategoryId(bill);
  if (!baseId) return undefined;
  let tenantId: string | undefined;
  if (bill.projectAgreementId) {
    const ra = rentalAgreements.find(r => r.id === bill.projectAgreementId);
    if (ra) tenantId = ra.contactId;
  }
  if (tenantId) {
    const orig = categories.find(c => c.id === baseId);
    if (orig) {
      const tenantCat = categories.find(
        c => c.name === `${orig.name} (Tenant)` && c.type === TransactionType.EXPENSE
      );
      return tenantCat?.id || baseId;
    }
  }
  return baseId;
}

function expandBillCategoryIds(bill: Bill, categories: Category[]): Set<string> {
  const ids = new Set<string>();
  const primary = getPrimaryBillExpenseCategoryId(bill);
  if (primary) ids.add(primary);
  for (const item of getBillExpenseCategoryItemsArray(bill)) {
    if (item.categoryId) ids.add(item.categoryId);
  }
  if (ids.size === 0) return ids;

  const snapshot = [...ids];
  for (const cid of snapshot) {
    const orig = categories.find(c => c.id === cid);
    if (orig) {
      const tenant = categories.find(
        c => c.name === `${orig.name} (Tenant)` && c.type === TransactionType.EXPENSE
      );
      if (tenant) ids.add(tenant.id);
    }
    const cat = categories.find(c => c.id === cid);
    if (cat?.name?.trim().endsWith('(Tenant)')) {
      const baseName = cat.name.replace(/\s*\(Tenant\)\s*$/i, '').trim();
      const base = categories.find(c => c.name === baseName && c.type === TransactionType.EXPENSE);
      if (base) ids.add(base.id);
    }
  }
  return ids;
}

function txReferencesBillNumber(tx: Transaction, billNumber: string): boolean {
  if (!billNumber) return false;
  const d = tx.description || '';
  const escaped = billNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:Bill\\s*#?\\s*${escaped}|\\(Bill\\s*#${escaped}\\))`, 'i').test(d);
}

/** Orphan payment may have lost category_id (migration) while bill still has category — allow match by description. */
function orphanCategoryMatches(
  t: Transaction,
  bill: Bill,
  categoryIds: Set<string>
): boolean {
  if (categoryIds.size === 0) return true;
  if (t.categoryId && categoryIds.has(t.categoryId)) return true;
  if (!t.categoryId && txReferencesBillNumber(t, bill.billNumber)) return true;
  return false;
}

/** True when this INCOME row is the ledger payment for a bill paid from tenant security (see OwnerPayoutModal). */
export function isBillPaymentFromSecurityDepositIncome(tx: Transaction): boolean {
  if (tx.type !== TransactionType.INCOME) return false;
  const d = tx.description || '';
  return /bill payment \(from security deposit\)/i.test(d);
}

/** Ledger rows that settle the vendor bill balance, not owner reimbursement income linked for rental reporting. */
export function isBillSettlementLedgerTransaction(tx: Transaction): boolean {
  if (tx.type === TransactionType.EXPENSE) return true;
  return isBillPaymentFromSecurityDepositIncome(tx);
}

/**
 * Companion EXPENSE created with the income row when paying a bill from security (no bill_id on this line).
 */
export function findSecurityDepositAppliedExpenseForBillPayment(
  incomeTx: Transaction,
  bill: Bill,
  transactions: Transaction[]
): Transaction | undefined {
  const bn = bill.billNumber?.trim();
  if (!bn) return undefined;
  const escaped = bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const descRe = new RegExp(`Security deposit applied — Bill\\s*${escaped}\\b`, 'i');
  const incAmt =
    typeof incomeTx.amount === 'number' ? incomeTx.amount : parseFloat(String(incomeTx.amount)) || 0;
  const incDay = (incomeTx.date || '').slice(0, 10);
  const billIdStr = bill.id ? String(bill.id) : '';
  const incomeBillIdStr = incomeTx.billId ? String(incomeTx.billId) : '';

  const byBillId =
    billIdStr &&
    incomeBillIdStr === billIdStr &&
    transactions.find((t) => {
      if (t.type !== TransactionType.EXPENSE) return false;
      const tbid = String(t.billId ?? '');
      if (tbid !== billIdStr) return false;
      const a = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount)) || 0;
      if (Math.abs(a - incAmt) > 0.02) return false;
      if ((t.date || '').slice(0, 10) !== incDay) return false;
      if (incomeTx.contactId && t.contactId && incomeTx.contactId !== t.contactId) return false;
      return true;
    });
  if (byBillId) return byBillId;

  return transactions.find((t) => {
    if (t.type !== TransactionType.EXPENSE) return false;
    if (!descRe.test(t.description || '')) return false;
    const a = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount)) || 0;
    if (Math.abs(a - incAmt) > 0.02) return false;
    if ((t.date || '').slice(0, 10) !== incDay) return false;
    if (incomeTx.contactId && t.contactId && incomeTx.contactId !== t.contactId) return false;
    return true;
  });
}

/**
 * Ledger transaction IDs to remove when deleting a rental bill so bill paid amount and security liability stay coherent.
 * Includes INCOME/EXPENSE rows with bill_id, plus paired “Security deposit applied” expense for security-deposit settlements.
 */
export function getBillLinkedLedgerTransactionIdsForCascadeDelete(bill: Bill, transactions: Transaction[]): string[] {
  const billIdStr = String(bill.id);
  const ids = new Set<string>();
  for (const t of transactions) {
    const bid = String(t.billId ?? (t as { bill_id?: string }).bill_id ?? '');
    if (bid !== billIdStr) continue;
    if (t.type === TransactionType.EXPENSE || t.type === TransactionType.INCOME) ids.add(t.id);
  }
  for (const t of transactions) {
    if (!ids.has(t.id)) continue;
    if (t.type !== TransactionType.INCOME || !isBillPaymentFromSecurityDepositIncome(t)) continue;
    const pair = findSecurityDepositAppliedExpenseForBillPayment(t, bill, transactions);
    if (pair) ids.add(pair.id);
  }
  return [...ids];
}

/**
 * Linked bill payments (EXPENSE cash payments **and** INCOME rows for security-deposit settlements with bill_id)
 * plus orphan EXPENSEs that match this bill without bill_id.
 */
export function getPaymentTransactionsForRentalBill(
  transactions: Transaction[],
  bill: Bill,
  categories: Category[],
  properties: Property[]
): Transaction[] {
  const billIdStr = String(bill.id);
  const linked = transactions.filter((t) => {
    const bid = String(t.billId ?? (t as { bill_id?: string }).bill_id ?? '');
    if (bid !== billIdStr) return false;
    return isBillSettlementLedgerTransaction(t);
  });
  const linkedIds = new Set(linked.map(t => t.id));
  const categoryIds = expandBillCategoryIds(bill, categories);

  const orphans = transactions.filter(t => {
    if (t.type !== TransactionType.EXPENSE) return false;
    if (linkedIds.has(t.id)) return false;
    const bid = String(t.billId ?? (t as any).bill_id ?? '');
    if (bid) return false;
    if (!orphanCategoryMatches(t, bill, categoryIds)) return false;
    if (t.projectId || bill.projectId) {
      if (t.projectId !== bill.projectId) return false;
    }
    if (bill.projectId) return false;
    if (t.projectId) return false;

    if (txReferencesBillNumber(t, bill.billNumber)) return true;

    if (bill.propertyId) {
      if (t.propertyId === bill.propertyId) return true;
      const prop = properties.find(p => p.id === bill.propertyId);
      if (prop?.buildingId && t.buildingId === prop.buildingId && !t.propertyId) return true;
      return false;
    }
    if (bill.buildingId && !bill.propertyId) {
      return t.buildingId === bill.buildingId;
    }
    return false;
  });

  return [...linked, ...orphans].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/** Sum bill-settlement ledger rows linked to this bill (includes security-deposit bill payments as Income). */
export function sumLinkedExpensePaymentsForBill(transactions: Transaction[], billId: string): number {
  const id = String(billId);
  let s = 0;
  for (const t of transactions) {
    if (!isBillSettlementLedgerTransaction(t)) continue;
    const bid = String(t.billId ?? (t as any).bill_id ?? '');
    if (bid !== id) continue;
    s += typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount)) || 0;
  }
  return s;
}

/**
 * Bill paid/balance/status for UI.
 * Uses the **maximum** of (a) sum of linked Income/Expense payments on this client and (b) `bill.paidAmount`
 * from PostgreSQL (maintained by `recalculateBillPaymentAggregates`). That way every session matches the DB even when
 * this client has not yet loaded every payment transaction (multi-user / incremental sync).
 */
export function getEffectiveBillPaymentDisplay(
  bill: Bill,
  transactions: Transaction[]
): { paidAmount: number; balance: number; status: string } {
  const txPaid = sumLinkedExpensePaymentsForBill(transactions, bill.id);
  const storedPaid =
    typeof bill.paidAmount === 'number' ? bill.paidAmount : parseFloat(String(bill.paidAmount ?? 0)) || 0;
  const paid = Math.max(txPaid, storedPaid);
  const amount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount)) || 0;
  const threshold = 0.01;
  const balance = Math.max(0, amount - paid);

  if (balance <= threshold) {
    return { paidAmount: paid, balance: 0, status: 'Paid' };
  }
  if (paid > threshold) {
    const due = bill.dueDate ? new Date(bill.dueDate) : null;
    if (due) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      if (due < today) return { paidAmount: paid, balance, status: 'Overdue' };
    }
    return { paidAmount: paid, balance, status: 'Partially Paid' };
  }
  const due = bill.dueDate ? new Date(bill.dueDate) : null;
  if (due) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    if (due < today) return { paidAmount: paid, balance, status: 'Overdue' };
  }
  return { paidAmount: paid, balance, status: 'Unpaid' };
}
