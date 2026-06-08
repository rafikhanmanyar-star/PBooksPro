/**
 * Vendor ledger report — shared between UI (local mode) and API server bundle.
 */

export type VendorLedgerRow = {
  id: string;
  date: string;
  vendorName: string;
  particulars: string;
  buildingName?: string;
  billAmount: number;
  paidAmount: number;
  balance: number;
  billId?: string;
  transactionId?: string;
  vendorId?: string;
  sortTie?: number;
};

export type VendorLedgerContext = 'Rental' | 'Project';

export type VendorLedgerFilters = {
  startDate: string;
  endDate: string;
  selectedVendorId?: string;
  selectedBuildingId?: string;
  searchQuery?: string;
  context?: VendorLedgerContext;
  dateSortDesc?: boolean;
};

type VendorLike = { id: string; name: string };
type BuildingLike = { id: string; name: string };
type PropertyLike = { id: string; buildingId?: string };
type BillLike = {
  id: string;
  issueDate: string;
  amount: number;
  paidAmount: number;
  vendorId?: string;
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
  billNumber?: string;
  description?: string;
};
type TxLike = {
  id: string;
  date: string;
  type: string;
  amount: number;
  vendorId?: string;
  billId?: string;
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
  description?: string;
};

export type VendorLedgerStateInput = {
  vendors: VendorLike[];
  buildings: BuildingLike[];
  properties: PropertyLike[];
  bills: BillLike[];
  transactions: TxLike[];
};

export type VendorLedgerReportResult = {
  rows: VendorLedgerRow[];
  totals: { bill: number; paid: number };
  closingBalance: number;
};

const MONEY_EPS = 0.015;

function ledgerAmountPaidViaTransactionsForBill(transactions: TxLike[], billId: string): number {
  const raw = transactions
    .filter(
      (tx) => tx.billId === billId && (tx.type === 'Expense' || tx.type === 'Income')
    )
    .reduce((s, tx) => s + tx.amount, 0);
  return Math.round(raw * 100) / 100;
}

function prepaidAppliedToBillNotInTransactions(bill: BillLike, transactions: TxLike[]): number {
  const txPaid = ledgerAmountPaidViaTransactionsForBill(transactions, bill.id);
  return Math.max(0, Math.round((bill.paidAmount - txPaid) * 100) / 100);
}

function prepaidClearingDisplayDateForBill(bill: BillLike, transactions: TxLike[]): string {
  const linked = transactions
    .filter(
      (tx) => tx.billId === bill.id && (tx.type === 'Expense' || tx.type === 'Income')
    )
    .map((tx) => tx.date)
    .filter(Boolean)
    .sort();
  return linked.length > 0 ? linked[linked.length - 1]! : bill.issueDate;
}

export function computeVendorLedgerReport(
  state: VendorLedgerStateInput,
  filters: VendorLedgerFilters
): VendorLedgerReportResult {
  const { vendors, buildings: allBuildings, properties, bills, transactions } = state;

  const start = new Date(filters.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(filters.endDate);
  end.setHours(23, 59, 59, 999);

  const selectedVendorId = filters.selectedVendorId ?? 'all';
  const selectedBuildingId = filters.selectedBuildingId ?? 'all';
  const searchQuery = (filters.searchQuery ?? '').trim().toLowerCase();
  const context = filters.context;

  const items: {
    date: string;
    vendorId: string;
    particulars: string;
    bill: number;
    paid: number;
    buildingName: string;
    billId?: string;
    transactionId?: string;
    sortTie: number;
  }[] = [];

  const getBuildingName = (buildingId?: string, propertyId?: string) => {
    if (buildingId) return allBuildings.find((b) => b.id === buildingId)?.name || '';
    if (propertyId) {
      const prop = properties.find((p) => p.id === propertyId);
      return allBuildings.find((b) => b.id === prop?.buildingId)?.name || '';
    }
    return '';
  };

  const getBuildingId = (buildingId?: string, propertyId?: string) => {
    if (buildingId) return buildingId;
    if (propertyId) {
      const prop = properties.find((p) => p.id === propertyId);
      return prop?.buildingId;
    }
    return undefined;
  };

  const billsMap = new Map<string, BillLike>();
  bills.forEach((bill) => {
    billsMap.set(bill.id, bill);
  });

  billsMap.forEach((bill) => {
    const date = new Date(bill.issueDate);
    if (date >= start && date <= end) {
      const vendorId = bill.vendorId;
      if (!vendorId) return;
      if (selectedVendorId !== 'all' && vendorId !== selectedVendorId) return;
      if (context === 'Project' && !bill.projectId) return;
      if (context === 'Rental' && (bill.projectId || (!bill.buildingId && !bill.propertyId))) return;

      const bId = getBuildingId(bill.buildingId, bill.propertyId);
      if (selectedBuildingId !== 'all' && bId !== selectedBuildingId) return;

      items.push({
        date: bill.issueDate,
        vendorId,
        particulars: `Bill #${bill.billNumber} (${bill.description || '-'})`,
        bill: bill.amount,
        paid: 0,
        buildingName: getBuildingName(bill.buildingId, bill.propertyId),
        billId: bill.id,
        sortTie: 0,
      });
    }
  });

  billsMap.forEach((bill) => {
    const vendorId = bill.vendorId;
    if (!vendorId) return;
    if (selectedVendorId !== 'all' && vendorId !== selectedVendorId) return;
    if (context === 'Project' && !bill.projectId) return;
    if (context === 'Rental' && (bill.projectId || (!bill.buildingId && !bill.propertyId))) return;
    const bId = getBuildingId(bill.buildingId, bill.propertyId);
    if (selectedBuildingId !== 'all' && bId !== selectedBuildingId) return;

    const prepaid = prepaidAppliedToBillNotInTransactions(bill, transactions);
    if (prepaid <= MONEY_EPS) return;

    const rowDate = prepaidClearingDisplayDateForBill(bill, transactions);
    const d = new Date(rowDate);
    if (d < start || d > end) return;

    items.push({
      date: rowDate,
      vendorId,
      particulars: `Supplier prepaid applied — Bill #${bill.billNumber}`,
      bill: 0,
      paid: prepaid,
      buildingName: getBuildingName(bill.buildingId, bill.propertyId),
      billId: bill.id,
      sortTie: 1,
    });
  });

  transactions.forEach((tx) => {
    if (tx.type === 'Expense') {
      let vendorId: string | undefined = tx.vendorId;
      if (tx.billId) {
        const bill = bills.find((b) => b.id === tx.billId);
        if (bill) vendorId = bill.vendorId;
      }
      if (!vendorId) return;
      if (selectedVendorId !== 'all' && vendorId !== selectedVendorId) return;

      const vendor = vendors.find((v) => v.id === vendorId);
      if (vendor) {
        const date = new Date(tx.date);
        if (date >= start && date <= end) {
          if (context === 'Project' && !tx.projectId) return;
          if (context === 'Rental' && tx.projectId) return;

          const bId = getBuildingId(tx.buildingId, tx.propertyId);
          if (selectedBuildingId !== 'all' && bId !== selectedBuildingId) return;

          items.push({
            date: tx.date,
            vendorId,
            particulars: tx.description || 'Payment',
            bill: 0,
            paid: tx.amount,
            buildingName: getBuildingName(tx.buildingId, tx.propertyId),
            transactionId: tx.id,
            sortTie: 2,
          });
        }
      }
    }
  });

  let rows: VendorLedgerRow[] = [];

  items.forEach((item, index) => {
    const vendorName = vendors.find((v) => v.id === item.vendorId)?.name || 'Unknown';
    rows.push({
      id: `${item.vendorId}-${index}`,
      date: item.date,
      vendorName,
      particulars: item.particulars,
      billAmount: item.bill,
      paidAmount: item.paid,
      balance: 0,
      buildingName: item.buildingName,
      billId: item.billId,
      transactionId: item.transactionId,
      vendorId: item.vendorId,
      sortTie: item.sortTie,
    });
  });

  rows.sort((a, b) => {
    if (selectedVendorId === 'all') {
      const vendorCompare = a.vendorName.localeCompare(b.vendorName);
      if (vendorCompare !== 0) return vendorCompare;
    }
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tA - tB;
    const ta = a.sortTie ?? 0;
    const tb = b.sortTie ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.particulars).localeCompare(String(b.particulars));
  });

  let runningBalance = 0;
  let currentVendor = '';

  rows.forEach((row) => {
    if (selectedVendorId === 'all' && row.vendorId !== currentVendor) {
      currentVendor = row.vendorId!;
      runningBalance = 0;
    }
    runningBalance += row.billAmount - row.paidAmount;
    row.balance = runningBalance;
  });

  if (searchQuery) {
    rows = rows.filter(
      (r) =>
        r.vendorName.toLowerCase().includes(searchQuery) ||
        r.particulars.toLowerCase().includes(searchQuery) ||
        (r.buildingName && r.buildingName.toLowerCase().includes(searchQuery))
    );
  }

  if (filters.dateSortDesc) {
    rows = [...rows].reverse();
  }

  const totals = rows.reduce(
    (acc, curr) => ({
      bill: acc.bill + curr.billAmount,
      paid: acc.paid + curr.paidAmount,
    }),
    { bill: 0, paid: 0 }
  );

  const closingBalance =
    selectedVendorId !== 'all' && rows.length > 0 ? rows[rows.length - 1].balance : 0;

  return { rows, totals, closingBalance };
}
