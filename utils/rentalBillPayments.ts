import { Bill, Category, Property, RentalAgreement, Transaction, TransactionType } from '../types';

/**
 * Primary expense category on a bill: top-level categoryId, else first line in expenseCategoryItems
 * (bills with line-item categories often omit bill.categoryId).
 */
export function getPrimaryBillExpenseCategoryId(bill: Bill): string | undefined {
  if (bill.categoryId) return bill.categoryId;
  const first = bill.expenseCategoryItems?.[0];
  return first?.categoryId;
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
  bill.expenseCategoryItems?.forEach(item => {
    if (item.categoryId) ids.add(item.categoryId);
  });
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

/**
 * Linked bill payments plus expenses that look like this bill's payment (same category family,
 * rental scope, no other bill link) — e.g. recorded from Transactions without "Link to Bill".
 */
export function getPaymentTransactionsForRentalBill(
  transactions: Transaction[],
  bill: Bill,
  categories: Category[],
  properties: Property[]
): Transaction[] {
  const billIdStr = String(bill.id);
  const linked = transactions.filter(
    t =>
      t.type === TransactionType.EXPENSE &&
      String(t.billId ?? (t as any).bill_id ?? '') === billIdStr
  );
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

/** Sum EXPENSE transactions linked to this bill (billId). */
export function sumLinkedExpensePaymentsForBill(transactions: Transaction[], billId: string): number {
  const id = String(billId);
  let s = 0;
  for (const t of transactions) {
    if (t.type !== TransactionType.EXPENSE) continue;
    const bid = String(t.billId ?? (t as any).bill_id ?? '');
    if (bid !== id) continue;
    s += typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount)) || 0;
  }
  return s;
}

/**
 * Bill row paid/balance/status from linked payment transactions (source of truth when bill.paidAmount is stale).
 */
export function getEffectiveBillPaymentDisplay(
  bill: Bill,
  transactions: Transaction[]
): { paidAmount: number; balance: number; status: string } {
  const paid = sumLinkedExpensePaymentsForBill(transactions, bill.id);
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
