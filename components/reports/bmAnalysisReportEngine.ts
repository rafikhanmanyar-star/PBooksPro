/**
 * BM (Building Maintenance) analysis report — shared between UI (local mode) and API server bundle.
 */

export type BuildingBMData = {
  id: string;
  buildingName: string;
  collected: number;
  receivable: number;
  expenses: number;
  net: number;
};

export type BMDetailKind = 'collected' | 'receivable' | 'expense';

export type BMDetailLine = {
  id: string;
  kind: BMDetailKind;
  date: string;
  label: string;
  amount: number;
  reference?: string;
};

export type BMBuildingDetail = {
  buildingId: string;
  buildingName: string;
  collected: BMDetailLine[];
  receivable: BMDetailLine[];
  expenses: BMDetailLine[];
};

export type BmAnalysisSortKey = 'buildingName' | 'collected' | 'receivable' | 'expenses' | 'net';

export type BmAnalysisFilters = {
  startDate: string;
  endDate: string;
  selectedBuildingId?: string;
  searchQuery?: string;
  sortKey?: BmAnalysisSortKey;
  sortDirection?: 'asc' | 'desc';
};

type TxLike = {
  id: string;
  date: string;
  type: string;
  amount: number;
  categoryId?: string;
  propertyId?: string;
  buildingId?: string;
  contactId?: string;
  billId?: string;
  description?: string;
  reference?: string;
};

type BillLike = {
  id: string;
  issueDate: string;
  amount: number;
  buildingId?: string;
  propertyId?: string;
  projectAgreementId?: string;
  categoryId?: string;
  description?: string;
  billNumber?: string;
  expenseCategoryItems?: { categoryId?: string; netValue?: number }[];
};

type InvoiceLike = {
  id: string;
  issueDate: string;
  invoiceType: string;
  status: string;
  serviceCharges?: number;
  buildingId?: string;
  propertyId?: string;
  contactId?: string;
  invoiceNumber?: string;
};

type CategoryLike = { id: string; name: string; type: string };
type PropertyLike = { id: string; buildingId?: string };
type BuildingLike = { id: string; name: string };
type ContactLike = { id: string; name: string; type: string };
type RentalAgreementLike = { id: string };

export type BmAnalysisStateInput = {
  buildings: BuildingLike[];
  categories: CategoryLike[];
  contacts: ContactLike[];
  properties: PropertyLike[];
  transactions: TxLike[];
  bills: BillLike[];
  invoices: InvoiceLike[];
  rentalAgreements: RentalAgreementLike[];
};

export type BmAnalysisReportResult = {
  reportData: BuildingBMData[];
  bmDetailsByBuilding: Record<string, BMBuildingDetail>;
};

const OWNER_EXPENSE_CATEGORY_NAMES = [
  'Owner Payout',
  'Security Deposit Refund',
  'Broker Fee',
  'Owner Security Payout',
];

export function computeBmAnalysisReport(
  state: BmAnalysisStateInput,
  filters: BmAnalysisFilters
): BmAnalysisReportResult {
  const {
    buildings: allBuildings,
    categories,
    contacts,
    properties,
    transactions,
    bills,
    invoices,
    rentalAgreements,
  } = state;

  const start = new Date(filters.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(filters.endDate);
  end.setHours(23, 59, 59, 999);

  const selectedBuildingId = filters.selectedBuildingId ?? 'all';
  const searchQuery = (filters.searchQuery ?? '').trim().toLowerCase();
  const sortConfig = {
    key: filters.sortKey ?? ('buildingName' as BmAnalysisSortKey),
    direction: filters.sortDirection ?? ('asc' as const),
  };

  const buildingData: Record<string, BuildingBMData> = {};
  const detailsMap: Record<string, BMBuildingDetail> = {};

  allBuildings.forEach((b) => {
    if (selectedBuildingId !== 'all' && b.id !== selectedBuildingId) return;
    buildingData[b.id] = {
      id: b.id,
      buildingName: b.name,
      collected: 0,
      receivable: 0,
      expenses: 0,
      net: 0,
    };
    detailsMap[b.id] = {
      buildingId: b.id,
      buildingName: b.name,
      collected: [],
      receivable: [],
      expenses: [],
    };
  });

  const serviceIncomeCatIds = new Set(
    categories
      .filter((c) => c.type === 'Income' && c.name.toLowerCase().includes('service charge'))
      .map((c) => c.id)
  );

  const getCategory = (id: string | undefined) => categories.find((c) => c.id === id);

  const isOwnerExpense = (catId: string | undefined) => {
    const cat = getCategory(catId);
    if (!cat) return false;
    return OWNER_EXPENSE_CATEGORY_NAMES.some((n) => n.toLowerCase() === cat.name.toLowerCase());
  };

  const isTenant = (contactId: string | undefined) => {
    if (!contactId) return false;
    const c = contacts.find((con) => con.id === contactId);
    return c?.type === 'Tenant';
  };

  const isTenantBill = (bill: BillLike) => {
    if (!bill.projectAgreementId) return false;
    return rentalAgreements.some((ra) => ra.id === bill.projectAgreementId);
  };

  transactions.forEach((tx) => {
    const date = new Date(tx.date);
    if (date < start || date > end) return;

    let buildingId = tx.buildingId;
    if (!buildingId && tx.propertyId) {
      const prop = properties.find((p) => p.id === tx.propertyId);
      if (prop) buildingId = prop.buildingId;
    }

    if (buildingId && buildingData[buildingId]) {
      if (tx.type === 'Income' && tx.categoryId && serviceIncomeCatIds.has(tx.categoryId)) {
        buildingData[buildingId].collected += tx.amount;
        const catName = getCategory(tx.categoryId)?.name;
        detailsMap[buildingId].collected.push({
          id: `tx-income-${tx.id}`,
          kind: 'collected',
          date: tx.date,
          label: tx.description?.trim() || catName || 'Service charge collection',
          amount: tx.amount,
          reference: tx.reference,
        });
      }
    }

    if (tx.type === 'Expense' && !tx.billId) {
      if (tx.buildingId && buildingData[tx.buildingId]) {
        if (tx.propertyId) return;
        if (isTenant(tx.contactId)) return;

        if (!isOwnerExpense(tx.categoryId)) {
          buildingData[tx.buildingId].expenses += tx.amount;
          const catName = getCategory(tx.categoryId)?.name;
          detailsMap[tx.buildingId].expenses.push({
            id: `tx-exp-${tx.id}`,
            kind: 'expense',
            date: tx.date,
            label: tx.description?.trim() || catName || 'Building expense',
            amount: tx.amount,
            reference: tx.reference,
          });
        }
      }
    }
  });

  bills.forEach((bill) => {
    const date = new Date(bill.issueDate);
    if (date < start || date > end) return;

    if (bill.buildingId && buildingData[bill.buildingId]) {
      if (bill.propertyId) return;
      if (isTenantBill(bill)) return;

      if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
        bill.expenseCategoryItems.forEach((item, idx) => {
          if (!item.categoryId) return;
          if (!isOwnerExpense(item.categoryId)) {
            const amt = item.netValue || 0;
            const bId = bill.buildingId ?? '';
            buildingData[bId].expenses += amt;
            const catName = getCategory(item.categoryId)?.name || 'Expense';
            detailsMap[bId].expenses.push({
              id: `bill-${bill.id}-line-${idx}`,
              kind: 'expense',
              date: bill.issueDate,
              label: `${catName}${bill.description ? ` — ${bill.description}` : ''}`,
              amount: amt,
              reference: bill.billNumber,
            });
          }
        });
      } else if (!isOwnerExpense(bill.categoryId)) {
        buildingData[bill.buildingId].expenses += bill.amount;
        const catName = getCategory(bill.categoryId)?.name || 'Expense';
        detailsMap[bill.buildingId].expenses.push({
          id: `bill-${bill.id}`,
          kind: 'expense',
          date: bill.issueDate,
          label: bill.description?.trim() || catName,
          amount: bill.amount,
          reference: bill.billNumber,
        });
      }
    }
  });

  invoices.forEach((inv) => {
    const date = new Date(inv.issueDate);
    if (date < start || date > end) return;

    if (
      inv.invoiceType === 'Rental' &&
      inv.status !== 'Paid' &&
      (inv.serviceCharges || 0) > 0
    ) {
      let buildingId = inv.buildingId;
      if (!buildingId && inv.propertyId) {
        const prop = properties.find((p) => p.id === inv.propertyId);
        if (prop) buildingId = prop.buildingId;
      }

      if (buildingId && buildingData[buildingId]) {
        const sc = inv.serviceCharges || 0;
        buildingData[buildingId].receivable += sc;
        const tenantName = contacts.find((c) => c.id === inv.contactId)?.name;
        detailsMap[buildingId].receivable.push({
          id: `inv-${inv.id}-sc`,
          kind: 'receivable',
          date: inv.issueDate,
          label: tenantName ? `Service charges — ${tenantName}` : 'Outstanding service charges',
          amount: sc,
          reference: inv.invoiceNumber,
        });
      }
    }
  });

  let result = Object.values(buildingData).map((b) => ({
    ...b,
    net: b.collected - b.expenses,
  }));

  if (searchQuery) {
    result = result.filter((b) => b.buildingName.toLowerCase().includes(searchQuery));
  }

  result.sort((a, b) => {
    let valA: string | number = a[sortConfig.key];
    let valB: string | number = b[sortConfig.key];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
    }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return { reportData: result, bmDetailsByBuilding: detailsMap };
}
