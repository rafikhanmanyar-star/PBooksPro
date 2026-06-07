/**
 * Tenant ledger report — shared between UI (local mode) and API server bundle.
 */

export type TenantLedgerItem = {
  id: string;
  date: string;
  tenantName: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  entityType: 'invoice' | 'transaction';
  entityId: string;
};

export type TenantLedgerSortKey = 'date';

export type TenantLedgerFilters = {
  startDate: string;
  endDate: string;
  selectedTenantId?: string;
  searchQuery?: string;
  groupBy?: '' | 'tenant';
  sortKey?: TenantLedgerSortKey | null;
  sortDirection?: 'asc' | 'desc' | null;
};

type ContactLike = { id: string; name: string; type: string };
type InvoiceLike = {
  id: string;
  issueDate: string;
  amount: number;
  description?: string;
  invoiceNumber?: string;
  invoiceType: string;
  contactId?: string;
};
type TxLike = {
  id: string;
  date: string;
  type: string;
  amount: number;
  contactId?: string;
  categoryId?: string;
  description?: string;
  invoiceId?: string;
};
type CategoryLike = { id: string; name: string };

export type TenantLedgerStateInput = {
  contacts: ContactLike[];
  invoices: InvoiceLike[];
  transactions: TxLike[];
  categories: CategoryLike[];
};

export type TenantLedgerReportResult = {
  rows: TenantLedgerItem[];
  totals: { debit: number; credit: number };
  closingBalance: number;
};

const SEC_REFUND_CATEGORY_NAMES = ['Security Deposit Refund', 'Owner Security Payout'];

export function computeTenantLedgerReport(
  state: TenantLedgerStateInput,
  filters: TenantLedgerFilters
): TenantLedgerReportResult {
  const { contacts, invoices, transactions, categories } = state;

  const start = new Date(filters.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(filters.endDate);
  end.setHours(23, 59, 59, 999);

  const selectedTenantId = filters.selectedTenantId ?? 'all';
  const searchQuery = (filters.searchQuery ?? '').trim().toLowerCase();
  const groupBy = filters.groupBy ?? '';
  const sortConfig =
    filters.sortKey === 'date' && filters.sortDirection === 'desc'
      ? { key: 'date' as const, direction: 'desc' as const }
      : null;

  const tenants = contacts.filter((c) => c.type === 'Tenant');

  let tenantInvoices = invoices.filter(
    (inv) => inv.invoiceType === 'Rental' || inv.invoiceType === 'Service Charge'
  );
  if (selectedTenantId !== 'all') {
    tenantInvoices = tenantInvoices.filter((inv) => inv.contactId === selectedTenantId);
  }

  let tenantTransactions = transactions.filter(
    (tx) => (tx.type === 'Income' || tx.type === 'Expense') && tx.contactId
  );
  if (selectedTenantId !== 'all') {
    tenantTransactions = tenantTransactions.filter((tx) => tx.contactId === selectedTenantId);
  } else {
    const tenantIds = new Set(tenants.map((t) => t.id));
    tenantTransactions = tenantTransactions.filter((tx) => {
      if (tenantIds.has(tx.contactId!)) return true;
      if (tx.invoiceId) {
        const inv = invoices.find((i) => i.id === tx.invoiceId);
        return inv && (inv.invoiceType === 'Rental' || inv.invoiceType === 'Service Charge');
      }
      return false;
    });
  }

  const ledgerItems: Omit<TenantLedgerItem, 'id' | 'balance'>[] = [];

  tenantInvoices.forEach((inv) => {
    const invDate = new Date(inv.issueDate);
    if (invDate >= start && invDate <= end) {
      const tenant = contacts.find((c) => c.id === inv.contactId);
      ledgerItems.push({
        date: inv.issueDate,
        tenantName: tenant?.name || 'Unknown/Deleted Tenant',
        particulars: `${inv.description || 'Monthly Rent'} – Unit ${inv.invoiceNumber}`,
        debit: inv.amount,
        credit: 0,
        entityType: 'invoice',
        entityId: inv.id,
      });
    }
  });

  const isSecRefundCategory = (categoryId: string | undefined) => {
    if (!categoryId) return false;
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? SEC_REFUND_CATEGORY_NAMES.includes(cat.name) : false;
  };

  tenantTransactions.forEach((tx) => {
    const txDate = new Date(tx.date);
    if (txDate >= start && txDate <= end) {
      const tenant = contacts.find((c) => c.id === tx.contactId);
      const tenantName = tenant?.name || 'Unknown/Deleted Tenant';
      const isExpense = tx.type === 'Expense';
      const isSecRefund = isExpense && isSecRefundCategory(tx.categoryId);

      if (isSecRefund) {
        ledgerItems.push({
          date: tx.date,
          tenantName,
          particulars: 'Owner security debit',
          debit: tx.amount,
          credit: 0,
          entityType: 'transaction',
          entityId: `${tx.id}-release`,
        });
        ledgerItems.push({
          date: tx.date,
          tenantName,
          particulars: tx.description || 'Security Deposit Refund',
          debit: 0,
          credit: tx.amount,
          entityType: 'transaction',
          entityId: tx.id,
        });
      } else {
        ledgerItems.push({
          date: tx.date,
          tenantName,
          particulars:
            tx.description ||
            (isExpense ? 'Charge Paid by Owner' : `Rent Payment – Ref #${tx.id.slice(-5)}`),
          debit: isExpense ? tx.amount : 0,
          credit: !isExpense ? tx.amount : 0,
          entityType: 'transaction',
          entityId: tx.id,
        });
      }
    }
  });

  ledgerItems.sort((a, b) => {
    if (groupBy === 'tenant') {
      if (a.tenantName < b.tenantName) return -1;
      if (a.tenantName > b.tenantName) return 1;
    }
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tA - tB;
    return b.debit - b.credit - (a.debit - a.credit);
  });

  let runningBalance = 0;
  let currentTenantName = '';
  let finalItems: TenantLedgerItem[] = ledgerItems.map((item, index) => {
    if (groupBy === 'tenant' && item.tenantName !== currentTenantName) {
      currentTenantName = item.tenantName;
      runningBalance = 0;
    }
    runningBalance += item.debit - item.credit;
    return { ...item, id: `${item.date}-${index}`, balance: runningBalance };
  });

  if (searchQuery) {
    finalItems = finalItems.filter(
      (item) =>
        item.particulars.toLowerCase().includes(searchQuery) ||
        item.tenantName.toLowerCase().includes(searchQuery)
    );
  }

  if (sortConfig?.key === 'date' && sortConfig.direction === 'desc') {
    finalItems = [...finalItems].reverse();
  }

  const totals = finalItems.reduce(
    (acc, item) => {
      acc.debit += item.debit;
      acc.credit += item.credit;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  const closingBalance =
    selectedTenantId !== 'all' && finalItems.length > 0
      ? finalItems[finalItems.length - 1].balance
      : 0;

  return { rows: finalItems, totals, closingBalance };
}
