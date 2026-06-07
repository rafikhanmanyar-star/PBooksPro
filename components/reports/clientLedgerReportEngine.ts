/**
 * Client (project owner) ledger report — shared between UI (local mode) and API server bundle.
 */

export type ClientLedgerTreeSelection =
  | { kind: 'all' }
  | { kind: 'owner'; ownerId: string }
  | { kind: 'unit'; unitId: string };

export type ClientLedgerItem = {
  id: string;
  date: string;
  ownerName: string;
  unitName: string;
  projectName: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
};

export type ClientAgreementSummary = {
  id: string;
  ownerName: string;
  projectName: string;
  unitNames: string;
  listPrice: number;
  discounts: { label: string; amount: number }[];
  sellingPrice: number;
  totalReceived: number;
  remainingAmount: number;
};

export type ClientLedgerSortKey = keyof Omit<ClientLedgerItem, 'id'>;

export type ClientLedgerFilters = {
  startDate: string;
  endDate: string;
  selection: ClientLedgerTreeSelection;
  sortKey?: ClientLedgerSortKey;
  sortDirection?: 'asc' | 'desc';
};

type ContactLike = { id: string; name: string; type: string };
type ProjectLike = { id: string; name: string };
type UnitLike = { id: string; name: string };
type InvoiceLike = {
  id: string;
  issueDate: string;
  amount: number;
  invoiceNumber?: string;
  invoiceType: string;
  contactId?: string;
  unitId?: string;
  projectId?: string;
  agreementId?: string;
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
  projectId?: string;
  unitId?: string;
  agreementId?: string;
};
type CategoryLike = { id: string; name: string; isRental?: boolean };
type ProjectAgreementLike = {
  id: string;
  clientId: string;
  projectId: string;
  unitIds?: string[];
  status: string;
  agreementNumber?: string;
  listPrice: number;
  sellingPrice: number;
  customerDiscount?: number;
  floorDiscount?: number;
  lumpSumDiscount?: number;
  miscDiscount?: number;
  cancellationDetails?: { date: string; penaltyAmount: number };
};

export type ClientLedgerStateInput = {
  contacts: ContactLike[];
  projects: ProjectLike[];
  units: UnitLike[];
  invoices: InvoiceLike[];
  transactions: TxLike[];
  categories: CategoryLike[];
  projectAgreements: ProjectAgreementLike[];
};

export type ClientLedgerReportResult = {
  rows: ClientLedgerItem[];
  agreementSummaries: ClientAgreementSummary[];
  totals: { debit: number; credit: number };
  closingBalance: number;
};

function invoiceMatchesUnit(
  inv: { id: string; unitId?: string | null; agreementId?: string | null },
  unitId: string,
  agreementUnitMap: Map<string, Set<string>>
): boolean {
  if (inv.unitId === unitId) return true;
  if (inv.agreementId) {
    const set = agreementUnitMap.get(inv.agreementId);
    return set?.has(unitId) ?? false;
  }
  return false;
}

function transactionMatchesUnit(
  tx: TxLike,
  unitId: string,
  agreementUnitMap: Map<string, Set<string>>,
  invoices: InvoiceLike[]
): boolean {
  if (tx.unitId === unitId) return true;
  if (tx.invoiceId) {
    const inv = invoices.find((i) => i.id === tx.invoiceId);
    if (inv) return invoiceMatchesUnit(inv, unitId, agreementUnitMap);
  }
  if (tx.agreementId) {
    return agreementUnitMap.get(tx.agreementId)?.has(unitId) ?? false;
  }
  return false;
}

function buildAgreementUnitMap(projectAgreements: ProjectAgreementLike[]) {
  const m = new Map<string, Set<string>>();
  projectAgreements.forEach((pa) => {
    m.set(pa.id, new Set(pa.unitIds || []));
  });
  return m;
}

function computeAgreementSummaries(
  state: ClientLedgerStateInput,
  selection: ClientLedgerTreeSelection,
  agreementUnitMap: Map<string, Set<string>>
): ClientAgreementSummary[] {
  const { contacts, projects, units, invoices, transactions, projectAgreements } = state;

  const agreements = projectAgreements.filter((pa) => {
    if (selection.kind === 'all') return true;
    if (selection.kind === 'owner') return pa.clientId === selection.ownerId;
    return pa.unitIds?.includes(selection.unitId) ?? false;
  });

  return agreements.map((pa) => {
    const owner = contacts.find((c) => c.id === pa.clientId);
    const project = projects.find((p) => p.id === pa.projectId);
    const agreementUnits = units.filter((u) => pa.unitIds?.includes(u.id) ?? false);
    const unitLabel =
      selection.kind === 'unit'
        ? agreementUnits.find((u) => u.id === selection.unitId)?.name ||
          units.find((u) => u.id === selection.unitId)?.name ||
          agreementUnits.map((u) => u.name).join(', ')
        : agreementUnits.map((u) => u.name).join(', ');

    let agreementInvoices = invoices.filter(
      (inv) =>
        inv.agreementId === pa.id &&
        inv.invoiceType === 'Installment' &&
        (selection.kind === 'all' || inv.contactId === pa.clientId)
    );
    if (selection.kind === 'owner') {
      agreementInvoices = agreementInvoices.filter((inv) => inv.contactId === selection.ownerId);
    } else if (selection.kind === 'unit') {
      agreementInvoices = agreementInvoices.filter((inv) =>
        invoiceMatchesUnit(inv, selection.unitId, agreementUnitMap)
      );
    }

    const agreementInvoiceIds = new Set(agreementInvoices.map((inv) => inv.id));

    const totalReceived = transactions
      .filter((tx) => {
        if (tx.type !== 'Income') return false;
        if (!tx.invoiceId) return false;
        if (!agreementInvoiceIds.has(tx.invoiceId)) return false;
        const inv = invoices.find((i) => i.id === tx.invoiceId);
        if (!inv || inv.invoiceType !== 'Installment') return false;
        if (selection.kind === 'owner' && tx.contactId !== selection.ownerId) return false;
        if (selection.kind === 'unit' && tx.invoiceId) {
          const inv2 = invoices.find((i) => i.id === tx.invoiceId);
          if (inv2 && !invoiceMatchesUnit(inv2, selection.unitId, agreementUnitMap)) return false;
        }
        return true;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const discounts = [
      { label: 'Customer Discount', amount: pa.customerDiscount ?? 0 },
      { label: 'Floor Discount', amount: pa.floorDiscount ?? 0 },
      { label: 'Lump Sum Discount', amount: pa.lumpSumDiscount ?? 0 },
      { label: 'Misc Discount', amount: pa.miscDiscount ?? 0 },
    ].filter((d) => d.amount > 0);

    return {
      id: pa.id,
      ownerName: owner?.name || 'Unknown',
      projectName: project?.name || 'Unknown',
      unitNames: unitLabel,
      listPrice: pa.listPrice,
      discounts,
      sellingPrice: pa.sellingPrice,
      totalReceived,
      remainingAmount: pa.sellingPrice - totalReceived,
    };
  });
}

export function computeClientLedgerReport(
  state: ClientLedgerStateInput,
  filters: ClientLedgerFilters
): ClientLedgerReportResult {
  const { contacts, projects, units, invoices, transactions, categories, projectAgreements } = state;
  const selection = filters.selection;
  const agreementUnitMap = buildAgreementUnitMap(projectAgreements);

  const agreementSummaries = computeAgreementSummaries(state, selection, agreementUnitMap);

  const start = new Date(filters.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(filters.endDate);
  end.setHours(23, 59, 59, 999);

  const owners = contacts.filter((c) => c.type === 'Client' || c.type === 'Owner');

  const rentalCategoryIds = new Set(categories.filter((c) => c.isRental).map((c) => c.id));
  const brokerCommissionExpenseCategoryIds = new Set(
    ['Broker Fee', 'Rebate Amount']
      .map((n) => categories.find((c) => c.name === n)?.id)
      .filter((id): id is string => Boolean(id))
  );

  let ownerInvoices = invoices.filter((inv) => inv.invoiceType === 'Installment');

  if (selection.kind === 'owner') {
    ownerInvoices = ownerInvoices.filter((inv) => inv.contactId === selection.ownerId);
  } else if (selection.kind === 'unit') {
    ownerInvoices = ownerInvoices.filter((inv) =>
      invoiceMatchesUnit(inv, selection.unitId, agreementUnitMap)
    );
  }

  let ownerPayments = transactions.filter(
    (tx) => tx.type === 'Income' && tx.invoiceId
  );
  ownerPayments = ownerPayments.filter((tx) => {
    const inv = invoices.find((i) => i.id === tx.invoiceId);
    return inv && inv.invoiceType === 'Installment';
  });

  let ownerRefunds = transactions.filter((tx) => tx.type === 'Expense' && tx.contactId);
  ownerRefunds = ownerRefunds.filter((tx) => !tx.categoryId || !rentalCategoryIds.has(tx.categoryId));
  ownerRefunds = ownerRefunds.filter(
    (tx) => !tx.categoryId || !brokerCommissionExpenseCategoryIds.has(tx.categoryId)
  );

  if (selection.kind === 'all') {
    const ownerIds = new Set(owners.map((c) => c.id));
    ownerPayments = ownerPayments.filter((tx) => tx.contactId && ownerIds.has(tx.contactId));
    ownerRefunds = ownerRefunds.filter((tx) => tx.contactId && ownerIds.has(tx.contactId));
  } else if (selection.kind === 'owner') {
    ownerPayments = ownerPayments.filter((tx) => tx.contactId === selection.ownerId);
    ownerRefunds = ownerRefunds.filter((tx) => tx.contactId === selection.ownerId);
  } else {
    ownerPayments = ownerPayments.filter((tx) =>
      transactionMatchesUnit(tx, selection.unitId, agreementUnitMap, invoices)
    );
    ownerRefunds = ownerRefunds.filter((tx) =>
      transactionMatchesUnit(tx, selection.unitId, agreementUnitMap, invoices)
    );
  }

  const rawItems: Omit<ClientLedgerItem, 'id' | 'balance'>[] = [];

  const getContext = (invoiceId?: string, projectId?: string) => {
    let unitName = '-';
    let projectName = '-';

    if (projectId) {
      projectName = projects.find((p) => p.id === projectId)?.name || '-';
    }

    if (invoiceId) {
      const inv = invoices.find((i) => i.id === invoiceId);
      if (inv) {
        if (inv.unitId) unitName = units.find((u) => u.id === inv.unitId)?.name || '-';
        if (projectName === '-' && inv.projectId) {
          projectName = projects.find((p) => p.id === inv.projectId)?.name || '-';
        }
      }
    }

    return { unitName, projectName };
  };

  ownerInvoices.forEach((inv) => {
    const invDate = new Date(inv.issueDate);
    if (invDate >= start && invDate <= end) {
      const owner = contacts.find((c) => c.id === inv.contactId);
      const { unitName, projectName } = getContext(inv.id, inv.projectId);
      rawItems.push({
        date: inv.issueDate,
        ownerName: owner?.name || 'Unknown',
        unitName,
        projectName,
        particulars: `Invoice #${inv.invoiceNumber}`,
        debit: inv.amount,
        credit: 0,
      });
    }
  });

  ownerPayments.forEach((tx) => {
    const txDate = new Date(tx.date);
    if (txDate >= start && txDate <= end) {
      const owner = contacts.find((c) => c.id === tx.contactId);
      const { unitName, projectName } = getContext(tx.invoiceId, tx.projectId);
      rawItems.push({
        date: tx.date,
        ownerName: owner?.name || 'Unknown',
        unitName,
        projectName,
        particulars: tx.description || 'Payment Received',
        debit: 0,
        credit: tx.amount,
      });
    }
  });

  ownerRefunds.forEach((tx) => {
    const txDate = new Date(tx.date);
    if (txDate >= start && txDate <= end) {
      const owner = contacts.find((c) => c.id === tx.contactId);
      const { unitName, projectName } = getContext(tx.invoiceId, tx.projectId);
      rawItems.push({
        date: tx.date,
        ownerName: owner?.name || 'Unknown',
        unitName,
        projectName,
        particulars: tx.description || 'Refund/Payout Given',
        debit: tx.amount,
        credit: 0,
      });
    }
  });

  projectAgreements.forEach((pa) => {
    if (
      pa.status === 'Cancelled' &&
      pa.cancellationDetails &&
      pa.cancellationDetails.penaltyAmount > 0
    ) {
      const paMatches =
        selection.kind === 'all' ||
        (selection.kind === 'owner' && pa.clientId === selection.ownerId) ||
        (selection.kind === 'unit' && (pa.unitIds?.includes(selection.unitId) ?? false));
      if (paMatches) {
        const cancelDate = new Date(pa.cancellationDetails.date);
        if (cancelDate >= start && cancelDate <= end) {
          const owner = contacts.find((c) => c.id === pa.clientId);
          const project = projects.find((p) => p.id === pa.projectId);
          const unitNamesStr =
            selection.kind === 'unit'
              ? units.find((u) => u.id === selection.unitId)?.name || '-'
              : units.filter((u) => pa.unitIds?.includes(u.id) ?? false).map((u) => u.name).join(', ');

          rawItems.push({
            date: pa.cancellationDetails.date,
            ownerName: owner?.name || 'Unknown',
            unitName: unitNamesStr || '-',
            projectName: project?.name || '-',
            particulars: `Cancellation Penalty - Agreement #${pa.agreementNumber}`,
            debit: pa.cancellationDetails.penaltyAmount,
            credit: 0,
          });
        }
      }
    }
  });

  rawItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (filters.sortKey && filters.sortDirection) {
    const key = filters.sortKey;
    const dir = filters.sortDirection;
    rawItems.sort((a, b) => {
      const valA = a[key];
      const valB = b[key];
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  let runningBalance = 0;
  const rows: ClientLedgerItem[] = rawItems.map((item, index) => {
    runningBalance += item.debit - item.credit;
    return { ...item, id: `${item.date}-${index}`, balance: runningBalance };
  });

  const totals = rows.reduce(
    (acc, item) => {
      acc.debit += item.debit;
      acc.credit += item.credit;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  const closingBalance =
    selection.kind !== 'all' && rows.length > 0 ? rows[rows.length - 1].balance : 0;

  return { rows, agreementSummaries, totals, closingBalance };
}
