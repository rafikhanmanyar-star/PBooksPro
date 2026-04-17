import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Bill, TransactionType, Transaction } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate, parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';
import ARTreeView, { ARTreeNode } from './ARTreeView';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import BillBulkPaymentModal from '../bills/BillBulkPaymentModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import useLocalStorage from '../../hooks/useLocalStorage';
import {
  getExpenseBearerType,
  getPaymentTransactionsForRentalBill,
  resolveExpenseCategoryForBillPayment,
  getEffectiveBillPaymentDisplay,
} from '../../utils/rentalBillPayments';
import { ImportType } from '../../services/importService';

type ViewBy = 'building' | 'property' | 'vendor' | 'bearer';
type StatusFilter = 'all' | 'Unpaid' | 'Paid' | 'Partially Paid' | 'Overdue';
type BillsPaymentsFilter = 'All' | 'Bills' | 'Payments';
type DashUnifiedRow =
  | { kind: 'bill'; bill: Bill }
  | { kind: 'payment'; payment: Transaction; bill: Bill };

const RentalBillsDashboard: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert, showConfirm } = useNotification();
  const { openChat } = useWhatsApp();
  const [whatsAppMenuBillId, setWhatsAppMenuBillId] = useState<string | null>(null);
  const whatsAppMenuRef = useRef<HTMLDivElement>(null);

  const [viewBy, setViewBy] = useLocalStorage<ViewBy>('bills_dash_viewBy', 'building');
  const [statusFilter, setStatusFilter] = useLocalStorage<StatusFilter>('bills_dash_status', 'all');
  const [typeFilter, setTypeFilter] = useLocalStorage<BillsPaymentsFilter>('bills_dash_billsPaymentsFilter', 'Bills');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedNode, setSelectedNode] = useState<ARTreeNode | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
  const [bulkPayUsesUnpaidPool, setBulkPayUsesUnpaidPool] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null }>({ isOpen: false, transaction: null });

  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('bills_dash_sidebar', 320);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (whatsAppMenuRef.current && !whatsAppMenuRef.current.contains(e.target as Node)) {
        setWhatsAppMenuBillId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const baseBills = useMemo(() => state.bills.filter(b => !b.projectId), [state.bills]);

  const filteredBills = useMemo(() => {
    let result = baseBills;

    if (statusFilter !== 'all') {
      result = result.filter(b => getEffectiveBillPaymentDisplay(b, state.transactions).status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => {
        if (b.billNumber?.toLowerCase().includes(q)) return true;
        const vendor = state.vendors?.find(v => v.id === b.vendorId);
        if (vendor?.name?.toLowerCase().includes(q)) return true;
        if (b.description?.toLowerCase().includes(q)) return true;
        if (b.propertyId) {
          const prop = state.properties.find(p => p.id === b.propertyId);
          if (prop?.name?.toLowerCase().includes(q)) return true;
        }
        const prop = b.propertyId ? state.properties.find(p => p.id === b.propertyId) : null;
        const bld = prop ? state.buildings.find(bl => bl.id === prop.buildingId) : b.buildingId ? state.buildings.find(bl => bl.id === b.buildingId) : null;
        if (bld?.name?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    return result;
  }, [baseBills, statusFilter, searchQuery, state.vendors, state.properties, state.buildings, state.transactions]);

  const treeData = useMemo((): ARTreeNode[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calcStats = (bills: Bill[]) => {
      let outstanding = 0;
      let overdue = 0;
      for (const b of bills) {
        const { balance, status } = getEffectiveBillPaymentDisplay(b, state.transactions);
        if (status !== 'Paid') {
          outstanding += balance;
          if (b.dueDate && new Date(b.dueDate) < today && status !== 'Paid' && balance > 0.01) overdue += balance;
        }
      }
      return { outstanding, overdue, invoiceCount: bills.length };
    };

    if (viewBy === 'building') {
      const grouped = new Map<string, Bill[]>();
      for (const b of filteredBills) {
        const bId = b.buildingId || (b.propertyId ? state.properties.find(p => p.id === b.propertyId)?.buildingId : null) || '__unassigned';
        if (!grouped.has(bId)) grouped.set(bId, []);
        grouped.get(bId)!.push(b);
      }

      return Array.from(grouped.entries()).map(([bId, bills]) => {
        const building = state.buildings.find(bl => bl.id === bId);

        const propGrouped = new Map<string, Bill[]>();
        for (const b of bills) {
          // Building-wide bills (no property): group by vendor so the tree shows vendor name instead of "General".
          const groupKey = b.propertyId
            ? b.propertyId
            : `__bw__${b.vendorId ?? '__none'}`;
          if (!propGrouped.has(groupKey)) propGrouped.set(groupKey, []);
          propGrouped.get(groupKey)!.push(b);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([groupKey, pBills]) => {
          const isBuildingWide = groupKey.startsWith('__bw__');
          const prop = !isBuildingWide ? state.properties.find(p => p.id === groupKey) : null;
          const vendorIdFromKey = isBuildingWide ? groupKey.replace('__bw__', '') : null;
          const vendor =
            vendorIdFromKey && vendorIdFromKey !== '__none'
              ? state.vendors?.find(v => v.id === vendorIdFromKey)
              : null;
          const displayName = prop?.name ?? vendor?.name ?? 'General';
          const nodeId =
            isBuildingWide
              ? `bwide|${bId}|${vendorIdFromKey === '__none' ? 'none' : vendorIdFromKey}`
              : groupKey;
          return {
            id: nodeId,
            name: displayName,
            type: 'property' as const,
            ...calcStats(pBills),
          };
        });
        children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        return {
          id: bId === '__unassigned' ? '__building_unassigned' : bId,
          name: building?.name || 'Unassigned',
          type: 'building' as const,
          ...calcStats(bills),
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
        const prop = state.properties.find(p => p.id === pId);

        const vendorGrouped = new Map<string, Bill[]>();
        for (const b of bills) {
          const vId = b.vendorId || '__unassigned';
          if (!vendorGrouped.has(vId)) vendorGrouped.set(vId, []);
          vendorGrouped.get(vId)!.push(b);
        }

        const children: ARTreeNode[] = Array.from(vendorGrouped.entries()).map(([vId, vBills]) => {
          const vendor = state.vendors?.find(v => v.id === vId);
          return {
            id: `vendor-${vId}-${pId}`,
            name: vendor?.name || 'Unknown Vendor',
            type: 'vendor' as const,
            ...calcStats(vBills),
          };
        });

        return {
          id: pId === '__unassigned' ? '__property_unassigned' : pId,
          name: prop?.name || 'General',
          type: 'property' as const,
          ...calcStats(bills),
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
        const vendor = state.vendors?.find(v => v.id === vId);
        return {
          id: vId === '__unassigned' ? '__vendor_unassigned' : vId,
          name: vendor?.name || 'Unknown Vendor',
          type: 'vendor' as const,
          ...calcStats(bills),
        };
      });
    }

    if (viewBy === 'bearer') {
      const grouped = new Map<string, Bill[]>();
      for (const b of filteredBills) {
        const bearer = getExpenseBearerType(b, state);
        if (!grouped.has(bearer)) grouped.set(bearer, []);
        grouped.get(bearer)!.push(b);
      }

      return Array.from(grouped.entries()).map(([bearer, bills]) => {
        const bldGrouped = new Map<string, Bill[]>();
        for (const b of bills) {
          const bId = b.buildingId || (b.propertyId ? state.properties.find(p => p.id === b.propertyId)?.buildingId : null) || '__unassigned';
          if (!bldGrouped.has(bId)) bldGrouped.set(bId, []);
          bldGrouped.get(bId)!.push(b);
        }

        const children: ARTreeNode[] = Array.from(bldGrouped.entries()).map(([bId, bBills]) => {
          const building = state.buildings.find(bl => bl.id === bId);
          return {
            id: `bld-${bId}-bearer-${bearer}`,
            name: building?.name || 'General',
            type: 'building' as const,
            ...calcStats(bBills),
          };
        });

        const labels: Record<string, string> = { owner: 'Owner Expense', building: 'Building Expense', tenant: 'Tenant Expense' };
        return {
          id: `bearer-${bearer}`,
          name: labels[bearer] || bearer,
          type: 'bearer' as const,
          ...calcStats(bills),
          children: children.length > 0 ? children : undefined,
        };
      });
    }

    return [];
  }, [filteredBills, viewBy, state.buildings, state.properties, state.vendors, state.rentalAgreements, state.transactions]);

  useEffect(() => { setSelectedNode(null); }, [viewBy, statusFilter]);

  const nodeBills = useMemo(() => {
    if (!selectedNode) return filteredBills;
    const nodeId = selectedNode.id;

    return filteredBills.filter(b => {
      const propBuildingId = b.propertyId ? state.properties.find(p => p.id === b.propertyId)?.buildingId : null;
      const effectiveBuildingId = b.buildingId || propBuildingId || '__unassigned';
      const bearer = getExpenseBearerType(b, state);

      if (nodeId.startsWith('vendor-')) {
        const vendorId = nodeId.replace('vendor-', '').split('-')[0];
        return b.vendorId === vendorId || (!b.vendorId && vendorId === '__unassigned');
      }
      if (nodeId.startsWith('bld-')) {
        const parts = nodeId.replace('bld-', '').split('-bearer-');
        const bId = parts[0];
        const br = parts[1];
        return effectiveBuildingId === bId && bearer === br;
      }
      if (nodeId.startsWith('bearer-')) {
        return bearer === nodeId.replace('bearer-', '');
      }
      if (nodeId.startsWith('bwide|')) {
        const parts = nodeId.split('|');
        const bid = parts[1];
        const vKey = parts[2];
        if (b.propertyId) return false;
        if (effectiveBuildingId !== bid) return false;
        if (vKey === 'none') return !b.vendorId;
        return b.vendorId === vKey;
      }
      if (nodeId.startsWith('prop-unassigned')) return !b.propertyId;

      switch (selectedNode.type) {
        case 'building':
          if (nodeId.includes('__unassigned')) return effectiveBuildingId === '__unassigned';
          return effectiveBuildingId === nodeId;
        case 'property':
          if (nodeId.includes('__unassigned')) return !b.propertyId;
          return b.propertyId === nodeId;
        case 'vendor':
          if (nodeId.includes('__unassigned')) return !b.vendorId;
          return b.vendorId === nodeId;
        default: return true;
      }
    });
  }, [selectedNode, filteredBills, state.properties, state.rentalAgreements]);

  const sortedBills = useMemo(() => {
    const sorted = [...nodeBills];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortConfig.key) {
        case 'billNumber': cmp = (a.billNumber || '').localeCompare(b.billNumber || ''); break;
        case 'date': cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime(); break;
        case 'vendor': {
          const nA = state.vendors?.find(v => v.id === a.vendorId)?.name || '';
          const nB = state.vendors?.find(v => v.id === b.vendorId)?.name || '';
          cmp = nA.localeCompare(nB); break;
        }
        case 'property': {
          const pA = a.propertyId ? state.properties.find(p => p.id === a.propertyId)?.name || '' : (a.buildingId ? 'Building-wide' : '');
          const pB = b.propertyId ? state.properties.find(p => p.id === b.propertyId)?.name || '' : (b.buildingId ? 'Building-wide' : '');
          cmp = pA.localeCompare(pB); break;
        }
        case 'amount': cmp = a.amount - b.amount; break;
        case 'balance': {
          const balA = getEffectiveBillPaymentDisplay(a, state.transactions).balance;
          const balB = getEffectiveBillPaymentDisplay(b, state.transactions).balance;
          cmp = balA - balB;
          break;
        }
        case 'status': {
          const sA = getEffectiveBillPaymentDisplay(a, state.transactions).status;
          const sB = getEffectiveBillPaymentDisplay(b, state.transactions).status;
          cmp = sA.localeCompare(sB);
          break;
        }
        default: cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [nodeBills, sortConfig, state.vendors, state.properties, state.transactions]);

  const accountMap = useMemo(() => new Map(state.accounts.map(a => [a.id, a])), [state.accounts]);

  /** Payments for bills in scope: linked billId expenses plus orphan matches (same helper as rental bill detail). */
  const paymentRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const billMatchesQuickSearch = (bill: Bill): boolean => {
      if (!q) return true;
      if (bill.billNumber?.toLowerCase().includes(q)) return true;
      const vendor = state.vendors?.find(v => v.id === bill.vendorId);
      if (vendor?.name?.toLowerCase().includes(q)) return true;
      if (bill.description?.toLowerCase().includes(q)) return true;
      if (bill.propertyId) {
        const prop = state.properties.find(p => p.id === bill.propertyId);
        if (prop?.name?.toLowerCase().includes(q)) return true;
      }
      const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
      const bld = prop ? state.buildings.find(bl => bl.id === prop.buildingId) : bill.buildingId ? state.buildings.find(bl => bl.id === bill.buildingId) : null;
      if (bld?.name?.toLowerCase().includes(q)) return true;
      return false;
    };

    const seenTx = new Set<string>();
    const rows: { payment: Transaction; bill: Bill }[] = [];
    for (const bill of nodeBills) {
      const txs = getPaymentTransactionsForRentalBill(state.transactions, bill, state.categories, state.properties);
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
        case 'billNumber': cmp = (a.bill.billNumber || '').localeCompare(b.bill.billNumber || ''); break;
        case 'date': cmp = new Date(a.payment.date).getTime() - new Date(b.payment.date).getTime(); break;
        case 'vendor': {
          const nA = state.vendors?.find(v => v.id === a.bill.vendorId)?.name || '';
          const nB = state.vendors?.find(v => v.id === b.bill.vendorId)?.name || '';
          cmp = nA.localeCompare(nB); break;
        }
        case 'property': {
          const pA = a.bill.propertyId ? state.properties.find(p => p.id === a.bill.propertyId)?.name || '' : (a.bill.buildingId ? 'Building-wide' : '');
          const pB = b.bill.propertyId ? state.properties.find(p => p.id === b.bill.propertyId)?.name || '' : (b.bill.buildingId ? 'Building-wide' : '');
          cmp = pA.localeCompare(pB); break;
        }
        case 'amount': cmp = a.payment.amount - b.payment.amount; break;
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
        default: cmp = new Date(a.payment.date).getTime() - new Date(b.payment.date).getTime();
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [nodeBills, state.transactions, state.categories, state.properties, state.buildings, state.vendors, sortConfig, searchQuery]);

  const unpaidBillsForBulk = useMemo(
    () => nodeBills.filter(b => getEffectiveBillPaymentDisplay(b, state.transactions).balance > 0.01),
    [nodeBills, state.transactions]
  );

  const unifiedDashRows = useMemo(() => {
    const rows: DashUnifiedRow[] = [];
    sortedBills.forEach(b => rows.push({ kind: 'bill', bill: b }));
    paymentRows.forEach(({ payment, bill }) => rows.push({ kind: 'payment', payment, bill }));
    const vendorName = (bill: Bill) => state.vendors?.find(v => v.id === bill.vendorId)?.name || '';
    const propLabel = (bill: Bill) =>
      bill.propertyId ? state.properties.find(p => p.id === bill.propertyId)?.name || '' : bill.buildingId ? 'Building-wide' : '';
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
          cmp = (a.kind === 'bill' ? a.bill.amount : a.payment.amount) - (b.kind === 'bill' ? b.bill.amount : b.payment.amount);
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
  }, [sortedBills, paymentRows, sortConfig, state.vendors, state.properties, state.transactions]);

  // Resize
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const newWidth = e.clientX - containerLeft;
    if (newWidth > 200 && newWidth < 600) setSidebarWidth(newWidth);
  }, [setSidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleUp = () => { setIsResizing(false); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('blur', handleUp);
    document.addEventListener('visibilitychange', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('blur', handleUp);
      document.removeEventListener('visibilitychange', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove]);

  const handleSortClick = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };
  const SortArrow = ({ column }: { column: string }) => (
    <span className="ml-0.5 text-[9px] text-app-muted">{sortConfig.key === column ? (sortConfig.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
  );

  const statusColor = (status: string) => {
    const pill = 'border px-1.5 py-0.5 rounded text-[10px] font-semibold';
    switch (status) {
      case 'Paid': return `${pill} border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success`;
      case 'Overdue': return `${pill} border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-ds-danger`;
      case 'Partially Paid': return `${pill} border-ds-warning/35 bg-app-toolbar text-ds-warning`;
      case 'Unpaid': return `${pill} border-app-border bg-app-toolbar text-app-muted`;
      default: return `${pill} border-app-border bg-app-toolbar text-app-muted`;
    }
  };

  const bearerBadge = (bill: Bill) => {
    const b = getExpenseBearerType(bill, state);
    const styles: Record<string, string> = {
      owner: 'border-primary/30 bg-app-toolbar text-primary',
      building: 'border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success',
      tenant: 'border-ds-warning/35 bg-app-toolbar text-ds-warning',
    };
    const labels: Record<string, string> = { owner: 'Owner', building: 'Bldg', tenant: 'Tenant' };
    return <span className={`px-1 py-0.5 rounded text-[9px] font-semibold border ${styles[b] || 'border-app-border bg-app-toolbar text-app-muted'}`}>{labels[b] || b}</span>;
  };

  const handleRecordPayment = (bill: Bill) => { setPaymentBill(bill); setIsPaymentModalOpen(true); };

  const handleDuplicateBill = async (data: Partial<Bill>) => {
    const agreed = await showConfirm(
      'A new bill will open with a copy of the current details. You can change anything before saving.\n\nAfter you save the new bill (or cancel), this bill will no longer be open for editing.\n\nContinue?',
      { title: 'Duplicate bill', confirmLabel: 'Continue', cancelLabel: 'Cancel' }
    );
    if (!agreed) return;
    const { id: _id, paidAmount: _pa, status: _st, ...rest } = data as Bill;
    setDuplicateBillData({ ...rest, paidAmount: 0, status: undefined });
    setBillToEdit(null);
    setIsCreateModalOpen(true);
  };

  const handleEdit = (bill: Bill) => {
    setBillToEdit(bill);
    setDuplicateBillData(null);
    setIsCreateModalOpen(true);
  };

  const getWhatsAppOptions = (bill: Bill) => {
    const opts: { id: 'vendor' | 'owner' | 'tenant'; label: string }[] = [];
    const vendor = state.vendors?.find(v => v.id === bill.vendorId);
    if (vendor?.contactNo) opts.push({ id: 'vendor', label: 'Send to Vendor' });
    const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
    const owner = prop?.ownerId ? state.contacts.find(c => c.id === prop.ownerId) : null;
    if (owner?.contactNo && getExpenseBearerType(bill, state) === 'owner') opts.push({ id: 'owner', label: 'Send to Owner' });
    const ra = bill.projectAgreementId ? state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId) : null;
    const tenant = ra?.contactId ? state.contacts.find(c => c.id === ra.contactId) : null;
    if (tenant?.contactNo && getExpenseBearerType(bill, state) === 'tenant') opts.push({ id: 'tenant', label: 'Send to Tenant' });
    return opts;
  };

  const handleSendWhatsApp = (e: React.MouseEvent, bill: Bill, recipient: 'vendor' | 'owner' | 'tenant') => {
    e.stopPropagation();
    setWhatsAppMenuBillId(null);
    let contact: { name: string; contactNo?: string } | null = null;
    let message = '';

    if (recipient === 'vendor') {
      const vendor = state.vendors?.find(v => v.id === bill.vendorId);
      if (!vendor?.contactNo) { showAlert('Vendor does not have a phone number saved.'); return; }
      contact = vendor;
      message = WhatsAppService.generateBillPayment((state.whatsAppTemplates as any)?.billPayment, vendor, bill.billNumber, bill.paidAmount);
    } else if (recipient === 'owner') {
      const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
      const owner = prop?.ownerId ? state.contacts.find(c => c.id === prop.ownerId) : null;
      if (!owner?.contactNo) { showAlert('Owner does not have a phone number saved.'); return; }
      contact = owner;
      const billToOwner = (state.whatsAppTemplates as any)?.billToOwner || (state.whatsAppTemplates as any)?.billPayment;
      message = WhatsAppService.replaceTemplateVariables(billToOwner, { contactName: owner.name, billNumber: bill.billNumber, amount: `${CURRENCY} ${bill.amount.toLocaleString()}` });
    } else if (recipient === 'tenant') {
      const ra = bill.projectAgreementId ? state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId) : null;
      const tenant = ra?.contactId ? state.contacts.find(c => c.id === ra.contactId) : null;
      if (!tenant?.contactNo) { showAlert('Tenant does not have a phone number saved.'); return; }
      contact = tenant;
      const billToTenant = (state.whatsAppTemplates as any)?.billToTenant || (state.whatsAppTemplates as any)?.billPayment;
      message = WhatsAppService.replaceTemplateVariables(billToTenant, { contactName: tenant.name, billNumber: bill.billNumber, amount: `${CURRENCY} ${bill.amount.toLocaleString()}`, note: 'This amount will be deducted from your security deposit.' });
    }
    if (contact && message) {
      sendOrOpenWhatsApp(
        { contact, message, phoneNumber: contact.contactNo ?? undefined },
        () => (state as any).whatsAppMode,
        openChat
      );
    }
  };

  const paymentTransactionData = useMemo(() => {
    if (!paymentBill) return { id: '', type: TransactionType.EXPENSE, amount: 0, date: toLocalDateString(new Date()), accountId: '' } as any;
    let tenantId: string | undefined;
    if (paymentBill.projectAgreementId) {
      const ra = state.rentalAgreements.find(ra => ra.id === paymentBill.projectAgreementId);
      if (ra) tenantId = ra.contactId;
    }
    const categoryId = resolveExpenseCategoryForBillPayment(paymentBill, state.categories, state.rentalAgreements);
    const due = getEffectiveBillPaymentDisplay(paymentBill, state.transactions).balance;
    return {
      id: '', type: TransactionType.EXPENSE,
      amount: due,
      date: paymentBill.issueDate
        ? parseStoredDateToYyyyMmDdInput(paymentBill.issueDate)
        : toLocalDateString(new Date()),
      accountId: '', billId: paymentBill.id,
      contactId: tenantId || paymentBill.contactId,
      buildingId: paymentBill.buildingId, propertyId: paymentBill.propertyId,
      categoryId,
      description: paymentBill.description || `Payment for Bill #${paymentBill.billNumber}`,
    } as any;
  }, [paymentBill, state.rentalAgreements, state.categories, state.transactions]);

  const selectedBillsList = useMemo(() => state.bills.filter(b => selectedBillIds.has(b.id)), [state.bills, selectedBillIds]);
  const toggleSelection = useCallback((id: string) => {
    setSelectedBillIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const selectClass = 'ds-input-field px-2 py-1 text-xs cursor-pointer min-w-[100px]';

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Compact Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-app-card border-b border-app-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-app-muted uppercase">View</label>
          <select value={viewBy} onChange={e => setViewBy(e.target.value as ViewBy)} className={selectClass} aria-label="View by">
            <option value="building">Building</option>
            <option value="property">Property</option>
            <option value="vendor">Vendor</option>
            <option value="bearer">Expense Bearer</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-app-muted uppercase">Show</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as BillsPaymentsFilter)} className={selectClass} aria-label="Bills or payments">
            <option value="All">All</option>
            <option value="Bills">Bills</option>
            <option value="Payments">Payments</option>
          </select>
        </div>

        <div className="w-px h-5 bg-app-border" />

        <div className="flex items-center gap-1 flex-wrap">
          {['All', 'Unpaid', 'Paid', 'Partially Paid', 'Overdue'].map(s => (
            <button
              type="button"
              key={s}
              onClick={() => setStatusFilter(s === 'All' ? 'all' : s as StatusFilter)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                (s === 'All' && statusFilter === 'all') || statusFilter === s
                  ? 'bg-primary text-ds-on-primary' : 'bg-app-toolbar text-app-muted hover:bg-app-toolbar/80 hover:text-app-text'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-app-border" />

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-app-muted">
            <div className="w-3.5 h-3.5">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder={typeFilter === 'Payments' ? 'Search bill #, vendor, payment note...' : typeFilter === 'All' ? 'Search bill #, vendor, property, payment note...' : 'Search bill #, vendor, property...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ds-input-field pl-7 pr-2 py-1 w-full text-xs placeholder:text-app-muted"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button onClick={() => { setBillToEdit(null); setDuplicateBillData(null); setIsCreateModalOpen(true); }} size="sm" className="text-xs">
            <div className="w-3.5 h-3.5 mr-1">{ICONS.plus}</div>
            New Bill
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.RENTAL_BILLS });
              dispatch({ type: 'SET_PAGE', payload: 'import' });
            }}
            size="sm"
            className="text-xs"
          >
            <div className="w-3.5 h-3.5 mr-1">{ICONS.download}</div>
            Bulk Import
          </Button>
          {typeFilter !== 'Payments' && selectedBillIds.size > 0 && (
            <Button variant="secondary" onClick={() => { setBulkPayUsesUnpaidPool(false); setIsBulkPayModalOpen(true); }} size="sm" className="text-xs">
              Pay Selected ({selectedBillIds.size})
            </Button>
          )}
          {(typeFilter === 'Payments' || typeFilter === 'All') && unpaidBillsForBulk.length > 0 && (
            <Button variant="secondary" onClick={() => { setBulkPayUsesUnpaidPool(true); setIsBulkPayModalOpen(true); }} size="sm" className="text-xs">
              Bulk pay bills ({unpaidBillsForBulk.length})
            </Button>
          )}
        </div>
      </div>

      {/* Split Layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel: Tree */}
        <div className="flex-shrink-0 border-r border-app-border overflow-hidden hidden md:flex flex-col bg-app-card" style={{ width: `${sidebarWidth}px` }}>
          <div className="px-2 py-1.5 bg-app-toolbar border-b border-app-border flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">Accounts Payable</span>
            <span className="text-[10px] text-app-muted">{treeData.length} groups</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ARTreeView
              treeData={treeData}
              selectedNodeId={selectedNode?.id || null}
              onNodeSelect={setSelectedNode}
              searchQuery={searchQuery}
              amountLabel="A/P"
              overdueLabel="overdue"
              emptyText="No payables found"
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors hidden md:block flex-shrink-0"
          onMouseDown={e => { e.preventDefault(); setIsResizing(true); }}
        />

        {/* Right Panel: Bill List */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-app-toolbar border-b border-app-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-app-text truncate">
                {selectedNode ? selectedNode.name : 'All Bills'}
              </span>
              {selectedNode && (
                <button type="button" onClick={() => setSelectedNode(null)} className="text-[10px] text-app-muted hover:text-app-text px-1.5 py-0.5 rounded hover:bg-app-toolbar/80">Clear</button>
              )}
            </div>
            <span className="text-[10px] text-app-muted tabular-nums flex-shrink-0">
              {typeFilter === 'Bills' ? (
                <>
                  {sortedBills.length} bill{sortedBills.length !== 1 ? 's' : ''}
                  {selectedNode && ` · ${CURRENCY} ${selectedNode.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} payable`}
                </>
              ) : typeFilter === 'Payments' ? (
                <>
                  {paymentRows.length} payment{paymentRows.length !== 1 ? 's' : ''}
                  {selectedNode && ` · ${CURRENCY} ${paymentRows.reduce((s, r) => s + r.payment.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} total`}
                </>
              ) : (
                <>
                  {sortedBills.length} bill{sortedBills.length !== 1 ? 's' : ''} · {paymentRows.length} payment{paymentRows.length !== 1 ? 's' : ''}
                  {selectedNode && ` · ${CURRENCY} ${paymentRows.reduce((s, r) => s + r.payment.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} paid`}
                </>
              )}
            </span>
          </div>

          {/* Mobile dropdown */}
          <div className="md:hidden px-3 py-2 bg-app-card border-b border-app-border">
            <select
              value={selectedNode?.id || ''}
              onChange={e => {
                const id = e.target.value;
                if (!id) { setSelectedNode(null); return; }
                const findNode = (nodes: ARTreeNode[]): ARTreeNode | null => {
                  for (const n of nodes) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children); if (f) return f; } } return null;
                };
                setSelectedNode(findNode(treeData));
              }}
              className="ds-input-field w-full px-2 py-1.5 text-sm"
              aria-label="Select bill node"
            >
              <option value="">All Bills</option>
              {treeData.map(n => <option key={n.id} value={n.id}>{n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            {typeFilter === 'All' ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider border-b border-app-border">
                  <th className="w-8 px-2 py-1.5 text-center">
                    <input type="checkbox" checked={sortedBills.length > 0 && selectedBillIds.size > 0 && selectedBillIds.size === sortedBills.length}
                      onChange={() => { selectedBillIds.size === sortedBills.length ? setSelectedBillIds(new Set()) : setSelectedBillIds(new Set(sortedBills.map(b => b.id))); }}
                      className="w-3.5 h-3.5 rounded border-app-border"
                      aria-label="Select all bills"
                      title="Select all bills" />
                  </th>
                  <th className="px-2 py-1.5 text-left w-14">Type</th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('date')}>Date <SortArrow column="date" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('billNumber')}>Bill # <SortArrow column="billNumber" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('vendor')}>Vendor <SortArrow column="vendor" /></th>
                  <th className="px-2 py-1.5 text-center">Bearer</th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('property')}>Property <SortArrow column="property" /></th>
                  <th className="px-2 py-1.5 text-left max-w-[100px]">Note</th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('amount')}>Amount <SortArrow column="amount" /></th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('balance')}>Balance <SortArrow column="balance" /></th>
                  <th className="px-2 py-1.5 text-center cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('status')}>Status <SortArrow column="status" /></th>
                  <th className="px-2 py-1.5 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {unifiedDashRows.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-app-muted italic">No bills or payments in this view.</td></tr>
                ) : unifiedDashRows.map(row => {
                  if (row.kind === 'bill') {
                    const bill = row.bill;
                    const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                    const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
                    const { balance, status: effStatus } = getEffectiveBillPaymentDisplay(bill, state.transactions);
                    const isChecked = selectedBillIds.has(bill.id);
                    const whatsAppOpts = getWhatsAppOptions(bill);
                    return (
                      <tr
                        key={`all-bill-${bill.id}`}
                        onClick={() => handleEdit(bill)}
                        className={`border-b border-app-border cursor-pointer transition-colors ${isChecked ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-app-toolbar/60'}`}
                      >
                        <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleSelection(bill.id)} className="w-3.5 h-3.5 rounded border-app-border" aria-label={`Select bill ${bill.billNumber}`} title={`Select bill ${bill.billNumber}`} />
                        </td>
                        <td className="px-2 py-1.5"><span className="inline-flex px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-100 text-blue-800">Bill</span></td>
                        <td className="px-2 py-1.5 text-app-text tabular-nums">{formatDate(bill.issueDate)}</td>
                        <td className="px-2 py-1.5 font-medium text-primary">{bill.billNumber}</td>
                        <td className="px-2 py-1.5 text-app-text truncate max-w-[130px]" title={vendor?.name}>{vendor?.name || '—'}</td>
                        <td className="px-2 py-1.5 text-center">{bearerBadge(bill)}</td>
                        <td className="px-2 py-1.5 text-app-muted truncate max-w-[120px]">{prop?.name || (bill.buildingId ? 'Building-wide' : '—')}</td>
                        <td className="px-2 py-1.5 text-app-muted truncate max-w-[100px]" title={bill.description || ''}>{bill.description || '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-app-text">{bill.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {balance > 0 ? balance.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor(effStatus)}`}>{effStatus}</span>
                        </td>
                        <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {whatsAppOpts.length > 0 && (
                              <div className="relative" ref={whatsAppMenuBillId === bill.id ? whatsAppMenuRef : null}>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === bill.id ? null : bill.id); }} className="p-1 rounded text-green-600 hover:bg-green-50" title="WhatsApp"><span className="w-3.5 h-3.5 inline-block">{ICONS.whatsapp}</span></button>
                                {whatsAppMenuBillId === bill.id && (
                                  <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-lg shadow-ds-card z-20 min-w-[140px]">
                                    {whatsAppOpts.map(opt => (
                                      <button key={opt.id} type="button" onClick={(e) => handleSendWhatsApp(e, bill, opt.id)} className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60">{opt.label}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleRecordPayment(bill); }} className="p-1 rounded hover:bg-app-toolbar/60 text-app-text" title="Pay"><span className="w-3.5 h-3.5 inline-block">{ICONS.dollarSign}</span></button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(bill); }} className="p-1 rounded hover:bg-app-toolbar/60 text-app-muted" title="Edit"><span className="w-3.5 h-3.5 inline-block">{ICONS.edit}</span></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  const { payment, bill } = row;
                  const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                  const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
                  const payAccount = payment.accountId ? accountMap.get(payment.accountId) : undefined;
                  const whatsAppOpts = getWhatsAppOptions(bill);
                  const menuKey = `all-dash-pay-${payment.id}`;
                  return (
                    <tr
                      key={`all-pay-${payment.id}`}
                      onClick={() => setTransactionToEdit(payment)}
                      className="border-b border-app-border cursor-pointer hover:bg-ds-success/10 transition-colors"
                    >
                      <td className="px-2 py-1.5" onClick={e => e.stopPropagation()} />
                      <td className="px-2 py-1.5"><span className="inline-flex px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">Pay</span></td>
                      <td className="px-2 py-1.5 text-app-text tabular-nums">{formatDate(payment.date)}</td>
                      <td className="px-2 py-1.5 font-medium text-primary">{bill.billNumber}</td>
                      <td className="px-2 py-1.5 text-app-text truncate max-w-[120px]" title={vendor?.name}>{vendor?.name || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{bearerBadge(bill)}</td>
                      <td className="px-2 py-1.5 text-app-muted truncate max-w-[100px]">{prop?.name || (bill.buildingId ? 'Building-wide' : '—')}</td>
                      <td className="px-2 py-1.5 text-app-text truncate max-w-[100px]" title={payment.description || ''}>{payment.description || '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{payment.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium italic text-emerald-700">
                        {CURRENCY} {payment.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="text-[10px] font-medium text-app-muted uppercase tracking-tight">{payAccount?.name || '—'}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-0.5 flex-wrap">
                          {whatsAppOpts.length > 0 && (
                            <div className="relative" ref={whatsAppMenuBillId === menuKey ? whatsAppMenuRef : null}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === menuKey ? null : menuKey); }} className="p-1 rounded text-green-600 hover:bg-green-50" title="WhatsApp"><span className="w-3.5 h-3.5 inline-block">{ICONS.whatsapp}</span></button>
                              {whatsAppMenuBillId === menuKey && (
                                <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-lg shadow-ds-card z-20 min-w-[140px]">
                                  {whatsAppOpts.map(opt => (
                                    <button key={opt.id} type="button" onClick={(e) => { handleSendWhatsApp(e, bill, opt.id); setWhatsAppMenuBillId(null); }} className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60">{opt.label}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); setTransactionToEdit(payment); }} className="p-1 rounded hover:bg-app-toolbar/60 text-app-text" title="Edit"><span className="w-3.5 h-3.5 inline-block">{ICONS.edit}</span></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setWarningModalState({ isOpen: true, transaction: payment }); }} className="p-1 rounded hover:bg-rose-50 text-rose-600" title="Delete"><span className="w-3.5 h-3.5 inline-block">{ICONS.trash}</span></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            ) : typeFilter === 'Bills' ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider border-b border-app-border">
                  <th className="w-8 px-2 py-1.5 text-center">
                    <input type="checkbox" checked={sortedBills.length > 0 && selectedBillIds.size > 0 && selectedBillIds.size === sortedBills.length}
                      onChange={() => { selectedBillIds.size === sortedBills.length ? setSelectedBillIds(new Set()) : setSelectedBillIds(new Set(sortedBills.map(b => b.id))); }}
                      className="w-3.5 h-3.5 rounded border-app-border"
                      aria-label="Select all bills"
                      title="Select all bills" />
                  </th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('billNumber')}>Bill # <SortArrow column="billNumber" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('date')}>Date <SortArrow column="date" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('vendor')}>Vendor <SortArrow column="vendor" /></th>
                  <th className="px-2 py-1.5 text-center">Bearer</th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('property')}>Property <SortArrow column="property" /></th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('amount')}>Amount <SortArrow column="amount" /></th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('balance')}>Balance <SortArrow column="balance" /></th>
                  <th className="px-2 py-1.5 text-center cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('status')}>Status <SortArrow column="status" /></th>
                  <th className="px-2 py-1.5 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedBills.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-app-muted italic">No bills found</td></tr>
                ) : sortedBills.map(bill => {
                  const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                  const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
                  const { balance, status: effStatus } = getEffectiveBillPaymentDisplay(bill, state.transactions);
                  const isChecked = selectedBillIds.has(bill.id);
                  const whatsAppOpts = getWhatsAppOptions(bill);

                  return (
                    <tr
                      key={bill.id}
                      onClick={() => handleEdit(bill)}
                      className={`border-b border-app-border cursor-pointer transition-colors ${isChecked ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-app-toolbar/60'}`}
                    >
                      <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleSelection(bill.id)} className="w-3.5 h-3.5 rounded border-app-border" aria-label={`Select bill ${bill.billNumber}`} title={`Select bill ${bill.billNumber}`} />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-primary">{bill.billNumber}</td>
                      <td className="px-2 py-1.5 text-app-text tabular-nums">{formatDate(bill.issueDate)}</td>
                      <td className="px-2 py-1.5 text-app-text truncate max-w-[130px]" title={vendor?.name}>{vendor?.name || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{bearerBadge(bill)}</td>
                      <td className="px-2 py-1.5 text-app-muted truncate max-w-[120px]">{prop?.name || (bill.buildingId ? 'Building-wide' : '—')}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-app-text">{bill.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {balance > 0 ? balance.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor(effStatus)}`}>{effStatus}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {whatsAppOpts.length > 0 && (
                            <div className="relative" ref={whatsAppMenuBillId === bill.id ? whatsAppMenuRef : null}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === bill.id ? null : bill.id); }} className="p-1 rounded text-green-600 hover:bg-green-50" title="WhatsApp"><span className="w-3.5 h-3.5 inline-block">{ICONS.whatsapp}</span></button>
                              {whatsAppMenuBillId === bill.id && (
                                <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-lg shadow-ds-card z-20 min-w-[140px]">
                                  {whatsAppOpts.map(opt => (
                                    <button key={opt.id} type="button" onClick={(e) => handleSendWhatsApp(e, bill, opt.id)} className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60">{opt.label}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleRecordPayment(bill); }} className="p-1 rounded hover:bg-app-toolbar/60 text-app-text" title="Pay"><span className="w-3.5 h-3.5 inline-block">{ICONS.dollarSign}</span></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(bill); }} className="p-1 rounded hover:bg-app-toolbar/60 text-app-muted" title="Edit"><span className="w-3.5 h-3.5 inline-block">{ICONS.edit}</span></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider border-b border-app-border">
                  <th className="px-2 py-1.5 text-left w-14">Type</th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('date')}>Payment date <SortArrow column="date" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('billNumber')}>Bill # <SortArrow column="billNumber" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('vendor')}>Vendor <SortArrow column="vendor" /></th>
                  <th className="px-2 py-1.5 text-center">Bearer</th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('property')}>Property <SortArrow column="property" /></th>
                  <th className="px-2 py-1.5 text-left max-w-[140px]">Note</th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('amount')}>Amount <SortArrow column="amount" /></th>
                  <th className="px-2 py-1.5 text-left">Account</th>
                  <th className="px-2 py-1.5 text-center cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('status')}>Bill status <SortArrow column="status" /></th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-app-toolbar/60" onClick={() => handleSortClick('balance')}>Bill balance <SortArrow column="balance" /></th>
                  <th className="px-2 py-1.5 text-center w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-app-muted italic">No linked payments in this view. Payments must be recorded with a bill link; use Bills tab to pay, or Bulk pay bills.</td></tr>
                ) : paymentRows.map(row => {
                  const { payment, bill } = row;
                  const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                  const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
                  const { balance: billBal, status: billEffStatus } = getEffectiveBillPaymentDisplay(bill, state.transactions);
                  const account = payment.accountId ? accountMap.get(payment.accountId) : undefined;
                  const whatsAppOpts = getWhatsAppOptions(bill);
                  const menuKey = `dash-pay-${payment.id}`;
                  return (
                    <tr
                      key={payment.id}
                      onClick={() => setTransactionToEdit(payment)}
                      className="border-b border-app-border cursor-pointer hover:bg-ds-success/10 transition-colors"
                    >
                      <td className="px-2 py-1.5"><span className="inline-flex px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">Pay</span></td>
                      <td className="px-2 py-1.5 text-app-text tabular-nums">{formatDate(payment.date)}</td>
                      <td className="px-2 py-1.5 font-medium text-primary">{bill.billNumber}</td>
                      <td className="px-2 py-1.5 text-app-text truncate max-w-[120px]" title={vendor?.name}>{vendor?.name || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{bearerBadge(bill)}</td>
                      <td className="px-2 py-1.5 text-app-muted truncate max-w-[100px]">{prop?.name || (bill.buildingId ? 'Building-wide' : '—')}</td>
                      <td className="px-2 py-1.5 text-app-text truncate max-w-[140px]" title={payment.description || ''}>{payment.description || '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{payment.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-1.5 text-app-muted truncate max-w-[100px]" title={account?.name}>{account?.name || '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor(billEffStatus)}`}>{billEffStatus}</span>
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${billBal > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {billBal > 0 ? billBal.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-0.5 flex-wrap">
                          {whatsAppOpts.length > 0 && (
                            <div className="relative" ref={whatsAppMenuBillId === menuKey ? whatsAppMenuRef : null}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === menuKey ? null : menuKey); }} className="p-1 rounded text-green-600 hover:bg-green-50" title="WhatsApp"><span className="w-3.5 h-3.5 inline-block">{ICONS.whatsapp}</span></button>
                              {whatsAppMenuBillId === menuKey && (
                                <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-lg shadow-ds-card z-20 min-w-[140px]">
                                  {whatsAppOpts.map(opt => (
                                    <button key={opt.id} type="button" onClick={(e) => { handleSendWhatsApp(e, bill, opt.id); setWhatsAppMenuBillId(null); }} className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60">{opt.label}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); setTransactionToEdit(payment); }} className="p-1 rounded hover:bg-app-toolbar/60 text-app-text" title="Edit"><span className="w-3.5 h-3.5 inline-block">{ICONS.edit}</span></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setWarningModalState({ isOpen: true, transaction: payment }); }} className="p-1 rounded hover:bg-rose-50 text-rose-600" title="Delete"><span className="w-3.5 h-3.5 inline-block">{ICONS.trash}</span></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 bg-app-toolbar/40 border-t border-app-border flex items-center justify-between text-xs text-app-muted flex-shrink-0">
            {typeFilter === 'Bills' ? (
              <>
                <span>{sortedBills.length} bills</span>
                <div className="flex gap-4 tabular-nums">
                  <span>Total: <strong className="text-app-text">{CURRENCY} {sortedBills.reduce((s, b) => s + b.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                  <span>Payable: <strong className="text-rose-600">{CURRENCY} {sortedBills.reduce((s, b) => s + getEffectiveBillPaymentDisplay(b, state.transactions).balance, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                </div>
              </>
            ) : typeFilter === 'Payments' ? (
              <>
                <span>{paymentRows.length} payments</span>
                <div className="flex gap-4 tabular-nums">
                  <span>Payments: <strong className="text-emerald-700">{CURRENCY} {paymentRows.reduce((s, r) => s + r.payment.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                  <span>Unpaid bills (bulk): <strong className="text-app-text">{unpaidBillsForBulk.length}</strong></span>
                </div>
              </>
            ) : (
              <>
                <span>{sortedBills.length} bills · {paymentRows.length} payments</span>
                <div className="flex gap-4 tabular-nums flex-wrap justify-end">
                  <span>Bill total: <strong className="text-app-text">{CURRENCY} {sortedBills.reduce((s, b) => s + b.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                  <span>Payments: <strong className="text-emerald-700">{CURRENCY} {paymentRows.reduce((s, r) => s + r.payment.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                  <span>Unpaid (bulk): <strong className="text-app-text">{unpaidBillsForBulk.length}</strong></span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }}
        title={billToEdit ? 'Edit Bill' : duplicateBillData ? 'Duplicate Bill' : 'Record New Bill'}
        size="lg"
      >
        <InvoiceBillForm
          key={billToEdit?.id ?? (duplicateBillData ? 'duplicate-bill' : 'new-bill')}
          onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }}
          type="bill"
          rentalContext={true}
          itemToEdit={billToEdit || undefined}
          initialData={duplicateBillData || undefined}
          onDuplicate={handleDuplicateBill}
        />
      </Modal>

      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={paymentBill ? `Pay Bill #${paymentBill.billNumber}` : 'Pay Bill'}>
        <TransactionForm
          key={paymentBill ? `pay-${paymentBill.id}` : 'pay-none'}
          onClose={() => setIsPaymentModalOpen(false)}
          transactionTypeForNew={TransactionType.EXPENSE}
          transactionToEdit={paymentTransactionData}
          onShowDeleteWarning={() => {}}
        />
      </Modal>

      <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Payment">
        <TransactionForm onClose={() => setTransactionToEdit(null)} transactionToEdit={transactionToEdit} onShowDeleteWarning={(tx) => { setTransactionToEdit(null); setWarningModalState({ isOpen: true, transaction: tx }); }} />
      </Modal>

      <LinkedTransactionWarningModal isOpen={warningModalState.isOpen} onClose={() => setWarningModalState({ isOpen: false, transaction: null })} onConfirm={() => {
        if (warningModalState.transaction) dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id });
        setWarningModalState({ isOpen: false, transaction: null });
        showToast('Payment deleted successfully');
      }} action="delete" linkedItemName="this bill" />

      <BillBulkPaymentModal
        isOpen={isBulkPayModalOpen}
        onClose={() => { setIsBulkPayModalOpen(false); setBulkPayUsesUnpaidPool(false); }}
        selectedBills={bulkPayUsesUnpaidPool ? unpaidBillsForBulk : selectedBillsList}
        onPaymentComplete={() => { setSelectedBillIds(new Set()); setIsBulkPayModalOpen(false); setBulkPayUsesUnpaidPool(false); }}
      />
    </div>
  );
};

export default RentalBillsDashboard;
