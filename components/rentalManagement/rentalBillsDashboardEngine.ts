import type { Bill, Building, Category, Property, RentalAgreement, Transaction, Vendor } from '../../types';
import {
  getEffectiveBillPaymentDisplay,
  getExpenseBearerType,
  getPaymentTransactionsForRentalBill,
} from '../../utils/rentalBillPayments';

export type RentalBillsDashboardTreeNode = {
  id: string;
  name: string;
  type: 'building' | 'property' | 'vendor' | 'bearer';
  outstanding: number;
  overdue: number;
  invoiceCount: number;
  children?: RentalBillsDashboardTreeNode[];
};

export type RentalBillsDashboardRow =
  | { kind: 'bill'; bill: Bill }
  | { kind: 'payment'; payment: Transaction; bill: Bill };

export type ViewBy = 'building' | 'property' | 'vendor' | 'bearer';
export type StatusFilter = 'all' | 'Unpaid' | 'Paid' | 'Partially Paid' | 'Overdue';
export type BillsPaymentsFilter = 'All' | 'Bills' | 'Payments';
export type TabFilter = 'all' | 'unpaid' | 'overdue';

export type RentalBillsDashboardInput = {
  bills: Bill[];
  transactions: Transaction[];
  properties: Property[];
  buildings: Building[];
  vendors: Vendor[];
  categories: Category[];
  rentalAgreements: RentalAgreement[];
};

export type RentalBillsDashboardFilters = {
  viewBy: ViewBy;
  statusFilter: StatusFilter;
  searchQuery: string;
  tabFilter: TabFilter;
  typeFilter: BillsPaymentsFilter;
  selectedNodeId: string | null;
  sortConfig: { key: string; dir: 'asc' | 'desc' };
  page: number;
  pageSize: number;
};

export type RentalBillsDashboardResult = {
  tree: RentalBillsDashboardTreeNode[];
  summary: {
    totalOutstanding: number;
    overdueBills: number;
    paidThisMonth: number;
    paidBillsCount: number;
    changePercent: number;
  };
  rows: RentalBillsDashboardRow[];
  totalRows: number;
  /** Full bill list for the current table view (before pagination). */
  sortedBills: Bill[];
  /** Full payment list for the current table view (before pagination). */
  paymentRows: { payment: Transaction; bill: Bill }[];
  /** Node-scoped bills with remaining balance (bulk pay pool). */
  unpaidBills: Bill[];
};

type EngineState = RentalBillsDashboardInput;

const DEFAULT_PAGE_SIZE = 20;

function calcStats(bills: Bill[], transactions: Transaction[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let outstanding = 0;
  let overdue = 0;
  for (const b of bills) {
    const { balance, status } = getEffectiveBillPaymentDisplay(b, transactions);
    if (status !== 'Paid') {
      outstanding += balance;
      if (b.dueDate && new Date(b.dueDate) < today && status !== 'Paid' && balance > 0.01) {
        overdue += balance;
      }
    }
  }
  return { outstanding, overdue, invoiceCount: bills.length };
}

function filterBillsBySearch(
  bills: Bill[],
  searchQuery: string,
  state: EngineState
): Bill[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return bills;
  return bills.filter((b) => {
    if (b.billNumber?.toLowerCase().includes(q)) return true;
    const vendor = state.vendors?.find((v) => v.id === b.vendorId);
    if (vendor?.name?.toLowerCase().includes(q)) return true;
    if (b.description?.toLowerCase().includes(q)) return true;
    if (b.propertyId) {
      const prop = state.properties.find((p) => p.id === b.propertyId);
      if (prop?.name?.toLowerCase().includes(q)) return true;
    }
    const prop = b.propertyId ? state.properties.find((p) => p.id === b.propertyId) : null;
    const bld = prop
      ? state.buildings.find((bl) => bl.id === prop.buildingId)
      : b.buildingId
        ? state.buildings.find((bl) => bl.id === b.buildingId)
        : null;
    if (bld?.name?.toLowerCase().includes(q)) return true;
    return false;
  });
}

function filterBillsByStatus(
  bills: Bill[],
  statusFilter: StatusFilter,
  transactions: Transaction[]
): Bill[] {
  if (statusFilter === 'all') return bills;
  return bills.filter(
    (b) => getEffectiveBillPaymentDisplay(b, transactions).status === statusFilter
  );
}

function resolveSelectedNodeType(
  nodeId: string,
  viewBy: ViewBy,
  state: EngineState
): RentalBillsDashboardTreeNode['type'] {
  if (nodeId.startsWith('vendor-')) return 'vendor';
  if (nodeId.startsWith('bld-')) return 'building';
  if (nodeId.startsWith('bearer-')) return 'bearer';
  if (nodeId.startsWith('bwide|')) return 'property';
  if (nodeId === '__building_unassigned') return 'building';
  if (nodeId === '__property_unassigned') return 'property';
  if (nodeId === '__vendor_unassigned') return 'vendor';
  if (viewBy === 'vendor') return 'vendor';
  if (viewBy === 'property') return 'property';
  if (viewBy === 'bearer') return 'bearer';
  if (state.properties.some((p) => p.id === nodeId) && !state.buildings.some((b) => b.id === nodeId)) {
    return 'property';
  }
  return 'building';
}

function filterBillsByNode(
  bills: Bill[],
  selectedNodeId: string | null,
  viewBy: ViewBy,
  state: EngineState
): Bill[] {
  if (!selectedNodeId) return bills;
  const selectedNodeType = resolveSelectedNodeType(selectedNodeId, viewBy, state);

  return bills.filter((b) => {
    const propBuildingId = b.propertyId
      ? state.properties.find((p) => p.id === b.propertyId)?.buildingId
      : null;
    const effectiveBuildingId = b.buildingId || propBuildingId || '__unassigned';
    const bearer = getExpenseBearerType(b, state);

    if (selectedNodeId.startsWith('vendor-')) {
      const vendorId = selectedNodeId.replace('vendor-', '').split('-')[0];
      return b.vendorId === vendorId || (!b.vendorId && vendorId === '__unassigned');
    }
    if (selectedNodeId.startsWith('bld-')) {
      const parts = selectedNodeId.replace('bld-', '').split('-bearer-');
      const bId = parts[0];
      const br = parts[1];
      return effectiveBuildingId === bId && bearer === br;
    }
    if (selectedNodeId.startsWith('bearer-')) {
      return bearer === selectedNodeId.replace('bearer-', '');
    }
    if (selectedNodeId.startsWith('bwide|')) {
      const parts = selectedNodeId.split('|');
      const bid = parts[1];
      const vKey = parts[2];
      if (b.propertyId) return false;
      if (effectiveBuildingId !== bid) return false;
      if (vKey === 'none') return !b.vendorId;
      return b.vendorId === vKey;
    }
    if (selectedNodeId.startsWith('prop-unassigned')) return !b.propertyId;

    switch (selectedNodeType) {
      case 'building':
        if (selectedNodeId.includes('__unassigned')) return effectiveBuildingId === '__unassigned';
        return effectiveBuildingId === selectedNodeId;
      case 'property':
        if (selectedNodeId.includes('__unassigned')) return !b.propertyId;
        return b.propertyId === selectedNodeId;
      case 'vendor':
        if (selectedNodeId.includes('__unassigned')) return !b.vendorId;
        return b.vendorId === selectedNodeId;
      default:
        return true;
    }
  });
}

function buildTree(
  filteredBills: Bill[],
  viewBy: ViewBy,
  state: EngineState
): RentalBillsDashboardTreeNode[] {
  const { transactions, properties, buildings, vendors, rentalAgreements } = state;

  if (viewBy === 'building') {
    const grouped = new Map<string, Bill[]>();
    for (const b of filteredBills) {
      const bId =
        b.buildingId ||
        (b.propertyId ? properties.find((p) => p.id === b.propertyId)?.buildingId : null) ||
        '__unassigned';
      if (!grouped.has(bId)) grouped.set(bId, []);
      grouped.get(bId)!.push(b);
    }

    return Array.from(grouped.entries()).map(([bId, bills]) => {
      const building = buildings.find((bl) => bl.id === bId);
      const propGrouped = new Map<string, Bill[]>();
      for (const b of bills) {
        const groupKey = b.propertyId ? b.propertyId : `__bw__${b.vendorId ?? '__none'}`;
        if (!propGrouped.has(groupKey)) propGrouped.set(groupKey, []);
        propGrouped.get(groupKey)!.push(b);
      }

      const children: RentalBillsDashboardTreeNode[] = Array.from(propGrouped.entries()).map(
        ([groupKey, pBills]) => {
          const isBuildingWide = groupKey.startsWith('__bw__');
          const prop = !isBuildingWide ? properties.find((p) => p.id === groupKey) : null;
          const vendorIdFromKey = isBuildingWide ? groupKey.replace('__bw__', '') : null;
          const vendor =
            vendorIdFromKey && vendorIdFromKey !== '__none'
              ? vendors?.find((v) => v.id === vendorIdFromKey)
              : null;
          const displayName = prop?.name ?? vendor?.name ?? 'General';
          const nodeId = isBuildingWide
            ? `bwide|${bId}|${vendorIdFromKey === '__none' ? 'none' : vendorIdFromKey}`
            : groupKey;
          return {
            id: nodeId,
            name: displayName,
            type: 'property' as const,
            ...calcStats(pBills, transactions),
          };
        }
      );
      children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      return {
        id: bId === '__unassigned' ? '__building_unassigned' : bId,
        name: building?.name || 'Unassigned',
        type: 'building' as const,
        ...calcStats(bills, transactions),
        children: children.length > 0 ? children : undefined,
      };
    });
  }

  if (viewBy === 'property') {
    const grouped = new Map<string, Bill[]>();
    for (const b of filteredBills) {
      const pId = b.propertyId || '__unassigned';
      if (!grouped.has(pId)) grouped.set(pId, []);
      grouped.get(pId)!.push(b);
    }

    return Array.from(grouped.entries()).map(([pId, bills]) => {
      const prop = properties.find((p) => p.id === pId);
      const vendorGrouped = new Map<string, Bill[]>();
      for (const b of bills) {
        const vId = b.vendorId || '__unassigned';
        if (!vendorGrouped.has(vId)) vendorGrouped.set(vId, []);
        vendorGrouped.get(vId)!.push(b);
      }

      const children: RentalBillsDashboardTreeNode[] = Array.from(vendorGrouped.entries()).map(
        ([vId, vBills]) => {
          const vendor = vendors?.find((v) => v.id === vId);
          return {
            id: `vendor-${vId}-${pId}`,
            name: vendor?.name || 'Unknown Vendor',
            type: 'vendor' as const,
            ...calcStats(vBills, transactions),
          };
        }
      );

      return {
        id: pId === '__unassigned' ? '__property_unassigned' : pId,
        name: prop?.name || 'General',
        type: 'property' as const,
        ...calcStats(bills, transactions),
        children: children.length > 0 ? children : undefined,
      };
    });
  }

  if (viewBy === 'vendor') {
    const grouped = new Map<string, Bill[]>();
    for (const b of filteredBills) {
      const vId = b.vendorId || '__unassigned';
      if (!grouped.has(vId)) grouped.set(vId, []);
      grouped.get(vId)!.push(b);
    }

    return Array.from(grouped.entries()).map(([vId, bills]) => {
      const vendor = vendors?.find((v) => v.id === vId);
      return {
        id: vId === '__unassigned' ? '__vendor_unassigned' : vId,
        name: vendor?.name || 'Unknown Vendor',
        type: 'vendor' as const,
        ...calcStats(bills, transactions),
      };
    });
  }

  if (viewBy === 'bearer') {
    const grouped = new Map<string, Bill[]>();
    for (const b of filteredBills) {
      const bearer = getExpenseBearerType(b, { rentalAgreements });
      if (!grouped.has(bearer)) grouped.set(bearer, []);
      grouped.get(bearer)!.push(b);
    }

    return Array.from(grouped.entries()).map(([bearer, bills]) => {
      const bldGrouped = new Map<string, Bill[]>();
      for (const b of bills) {
        const bId =
          b.buildingId ||
          (b.propertyId ? properties.find((p) => p.id === b.propertyId)?.buildingId : null) ||
          '__unassigned';
        if (!bldGrouped.has(bId)) bldGrouped.set(bId, []);
        bldGrouped.get(bId)!.push(b);
      }

      const children: RentalBillsDashboardTreeNode[] = Array.from(bldGrouped.entries()).map(
        ([bId, bBills]) => {
          const building = buildings.find((bl) => bl.id === bId);
          return {
            id: `bld-${bId}-bearer-${bearer}`,
            name: building?.name || 'General',
            type: 'building' as const,
            ...calcStats(bBills, transactions),
          };
        }
      );

      const labels: Record<string, string> = {
        owner: 'Owner Expense',
        building: 'Building Expense',
        tenant: 'Tenant Expense',
      };
      return {
        id: `bearer-${bearer}`,
        name: labels[bearer] || bearer,
        type: 'bearer' as const,
        ...calcStats(bills, transactions),
        children: children.length > 0 ? children : undefined,
      };
    });
  }

  return [];
}

function computeSummary(nodeBills: Bill[], transactions: Transaction[], categories: Category[], properties: Property[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let totalOutstanding = 0;
  let overdueBills = 0;
  let paidThisMonth = 0;
  let paidBillsCount = 0;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  for (const b of nodeBills) {
    const { balance, status } = getEffectiveBillPaymentDisplay(b, transactions);
    if (status !== 'Paid') {
      totalOutstanding += balance;
      if (b.dueDate && new Date(b.dueDate) < today && balance > 0.01) overdueBills++;
    }
    if (status === 'Paid') {
      const paidTxs = getPaymentTransactionsForRentalBill(transactions, b, categories, properties);
      for (const tx of paidTxs) {
        if (new Date(tx.date) >= monthStart) {
          paidThisMonth += tx.amount;
        }
      }
      paidBillsCount++;
    }
  }

  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  let lastMonthOutstanding = 0;
  for (const b of nodeBills) {
    const issueDate = new Date(b.issueDate);
    if (issueDate <= lastMonthEnd) {
      const { balance, status } = getEffectiveBillPaymentDisplay(b, transactions);
      if (status !== 'Paid') lastMonthOutstanding += balance;
    }
  }
  const changePercent =
    lastMonthOutstanding > 0
      ? Math.round(((totalOutstanding - lastMonthOutstanding) / lastMonthOutstanding) * 100)
      : 0;

  return { totalOutstanding, overdueBills, paidThisMonth, paidBillsCount, changePercent };
}

function sortBills(
  bills: Bill[],
  sortConfig: RentalBillsDashboardFilters['sortConfig'],
  state: EngineState
): Bill[] {
  const sorted = [...bills];
  const { transactions, vendors, properties } = state;
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortConfig.key) {
      case 'billNumber':
        cmp = (a.billNumber || '').localeCompare(b.billNumber || '');
        break;
      case 'date':
        cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
        break;
      case 'vendor': {
        const nA = vendors?.find((v) => v.id === a.vendorId)?.name || '';
        const nB = vendors?.find((v) => v.id === b.vendorId)?.name || '';
        cmp = nA.localeCompare(nB);
        break;
      }
      case 'property': {
        const pA = a.propertyId
          ? properties.find((p) => p.id === a.propertyId)?.name || ''
          : a.buildingId
            ? 'Building-wide'
            : '';
        const pB = b.propertyId
          ? properties.find((p) => p.id === b.propertyId)?.name || ''
          : b.buildingId
            ? 'Building-wide'
            : '';
        cmp = pA.localeCompare(pB);
        break;
      }
      case 'amount':
        cmp = a.amount - b.amount;
        break;
      case 'balance': {
        const balA = getEffectiveBillPaymentDisplay(a, transactions).balance;
        const balB = getEffectiveBillPaymentDisplay(b, transactions).balance;
        cmp = balA - balB;
        break;
      }
      case 'status': {
        const sA = getEffectiveBillPaymentDisplay(a, transactions).status;
        const sB = getEffectiveBillPaymentDisplay(b, transactions).status;
        cmp = sA.localeCompare(sB);
        break;
      }
      default:
        cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
    }
    return sortConfig.dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function buildPaymentRows(
  nodeBills: Bill[],
  searchQuery: string,
  sortConfig: RentalBillsDashboardFilters['sortConfig'],
  state: EngineState
): { payment: Transaction; bill: Bill }[] {
  const q = searchQuery.trim().toLowerCase();
  const billMatchesQuickSearch = (bill: Bill): boolean => {
    if (!q) return true;
    if (bill.billNumber?.toLowerCase().includes(q)) return true;
    const vendor = state.vendors?.find((v) => v.id === bill.vendorId);
    if (vendor?.name?.toLowerCase().includes(q)) return true;
    if (bill.description?.toLowerCase().includes(q)) return true;
    if (bill.propertyId) {
      const prop = state.properties.find((p) => p.id === bill.propertyId);
      if (prop?.name?.toLowerCase().includes(q)) return true;
    }
    const prop = bill.propertyId ? state.properties.find((p) => p.id === bill.propertyId) : null;
    const bld = prop
      ? state.buildings.find((bl) => bl.id === prop.buildingId)
      : bill.buildingId
        ? state.buildings.find((bl) => bl.id === bill.buildingId)
        : null;
    if (bld?.name?.toLowerCase().includes(q)) return true;
    return false;
  };

  const seenTx = new Set<string>();
  const rows: { payment: Transaction; bill: Bill }[] = [];
  for (const bill of nodeBills) {
    const txs = getPaymentTransactionsForRentalBill(
      state.transactions,
      bill,
      state.categories,
      state.properties
    );
    for (const tx of txs) {
      if (seenTx.has(tx.id)) continue;
      seenTx.add(tx.id);
      if (q && !billMatchesQuickSearch(bill) && !tx.description?.toLowerCase().includes(q)) continue;
      rows.push({ payment: tx, bill });
    }
  }

  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortConfig.key) {
      case 'billNumber':
        cmp = (a.bill.billNumber || '').localeCompare(b.bill.billNumber || '');
        break;
      case 'date':
        cmp = new Date(a.payment.date).getTime() - new Date(b.payment.date).getTime();
        break;
      case 'vendor': {
        const nA = state.vendors?.find((v) => v.id === a.bill.vendorId)?.name || '';
        const nB = state.vendors?.find((v) => v.id === b.bill.vendorId)?.name || '';
        cmp = nA.localeCompare(nB);
        break;
      }
      case 'property': {
        const pA = a.bill.propertyId
          ? state.properties.find((p) => p.id === a.bill.propertyId)?.name || ''
          : a.bill.buildingId
            ? 'Building-wide'
            : '';
        const pB = b.bill.propertyId
          ? state.properties.find((p) => p.id === b.bill.propertyId)?.name || ''
          : b.bill.buildingId
            ? 'Building-wide'
            : '';
        cmp = pA.localeCompare(pB);
        break;
      }
      case 'amount':
        cmp = a.payment.amount - b.payment.amount;
        break;
      case 'balance': {
        const balA = getEffectiveBillPaymentDisplay(a.bill, state.transactions).balance;
        const balB = getEffectiveBillPaymentDisplay(b.bill, state.transactions).balance;
        cmp = balA - balB;
        break;
      }
      case 'status': {
        const sA = getEffectiveBillPaymentDisplay(a.bill, state.transactions).status;
        const sB = getEffectiveBillPaymentDisplay(b.bill, state.transactions).status;
        cmp = sA.localeCompare(sB);
        break;
      }
      default:
        cmp = new Date(a.payment.date).getTime() - new Date(b.payment.date).getTime();
    }
    return sortConfig.dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function buildUnifiedRows(
  sortedBills: Bill[],
  paymentRows: { payment: Transaction; bill: Bill }[],
  sortConfig: RentalBillsDashboardFilters['sortConfig'],
  state: EngineState
): RentalBillsDashboardRow[] {
  const rows: RentalBillsDashboardRow[] = [];
  sortedBills.forEach((b) => rows.push({ kind: 'bill', bill: b }));
  paymentRows.forEach(({ payment, bill }) => rows.push({ kind: 'payment', payment, bill }));

  const vendorName = (bill: Bill) => state.vendors?.find((v) => v.id === bill.vendorId)?.name || '';
  const propLabel = (bill: Bill) =>
    bill.propertyId
      ? state.properties.find((p) => p.id === bill.propertyId)?.name || ''
      : bill.buildingId
        ? 'Building-wide'
        : '';

  rows.sort((a, b) => {
    const billA = a.kind === 'bill' ? a.bill : a.bill;
    const billB = b.kind === 'bill' ? b.bill : b.bill;
    let cmp = 0;
    switch (sortConfig.key) {
      case 'billNumber':
        cmp = (billA.billNumber || '').localeCompare(billB.billNumber || '');
        break;
      case 'date': {
        const tA = new Date(a.kind === 'bill' ? a.bill.issueDate : a.payment.date).getTime();
        const tB = new Date(b.kind === 'bill' ? b.bill.issueDate : b.payment.date).getTime();
        cmp = tA - tB;
        break;
      }
      case 'vendor':
        cmp = vendorName(billA).localeCompare(vendorName(billB));
        break;
      case 'property':
        cmp = propLabel(billA).localeCompare(propLabel(billB));
        break;
      case 'amount':
        cmp =
          (a.kind === 'bill' ? a.bill.amount : a.payment.amount) -
          (b.kind === 'bill' ? b.bill.amount : b.payment.amount);
        break;
      case 'balance': {
        const balA = getEffectiveBillPaymentDisplay(billA, state.transactions).balance;
        const balB = getEffectiveBillPaymentDisplay(billB, state.transactions).balance;
        cmp = balA - balB;
        break;
      }
      case 'status': {
        const sA = getEffectiveBillPaymentDisplay(billA, state.transactions).status;
        const sB = getEffectiveBillPaymentDisplay(billB, state.transactions).status;
        cmp = sA.localeCompare(sB);
        break;
      }
      default: {
        const tA = new Date(a.kind === 'bill' ? a.bill.issueDate : a.payment.date).getTime();
        const tB = new Date(b.kind === 'bill' ? b.bill.issueDate : b.payment.date).getTime();
        cmp = tA - tB;
      }
    }
    return sortConfig.dir === 'asc' ? cmp : -cmp;
  });
  return rows;
}

export function computeRentalBillsDashboard(
  input: RentalBillsDashboardInput,
  filters: RentalBillsDashboardFilters
): RentalBillsDashboardResult {
  const pageSize = filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
  const page = filters.page > 0 ? filters.page : 1;

  const baseBills = input.bills.filter((b) => !b.projectId);
  let filteredBills = filterBillsByStatus(baseBills, filters.statusFilter, input.transactions);
  filteredBills = filterBillsBySearch(filteredBills, filters.searchQuery, input);

  const tree = buildTree(filteredBills, filters.viewBy, input);
  const nodeBills = filterBillsByNode(filteredBills, filters.selectedNodeId, filters.viewBy, input);

  const summary = computeSummary(
    nodeBills,
    input.transactions,
    input.categories,
    input.properties
  );

  let tabFilteredBills = nodeBills;
  if (filters.tabFilter !== 'all') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    tabFilteredBills = nodeBills.filter((b) => {
      const { balance, status } = getEffectiveBillPaymentDisplay(b, input.transactions);
      if (filters.tabFilter === 'unpaid') return status !== 'Paid' && balance > 0.01;
      if (filters.tabFilter === 'overdue') {
        return b.dueDate && new Date(b.dueDate) < today && status !== 'Paid' && balance > 0.01;
      }
      return true;
    });
  }

  const sortedBills = sortBills(tabFilteredBills, filters.sortConfig, input);
  const paymentRows = buildPaymentRows(nodeBills, filters.searchQuery, filters.sortConfig, input);

  let allRows: RentalBillsDashboardRow[];
  if (filters.typeFilter === 'Bills') {
    allRows = sortedBills.map((bill) => ({ kind: 'bill' as const, bill }));
  } else if (filters.typeFilter === 'Payments') {
    allRows = paymentRows.map(({ payment, bill }) => ({ kind: 'payment' as const, payment, bill }));
  } else {
    allRows = buildUnifiedRows(sortedBills, paymentRows, filters.sortConfig, input);
  }

  const totalRows = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const rows = allRows.slice(start, start + pageSize);
  const unpaidBills = nodeBills.filter(
    (b) => getEffectiveBillPaymentDisplay(b, input.transactions).balance > 0.01
  );

  return { tree, summary, rows, totalRows, sortedBills, paymentRows, unpaidBills };
}
