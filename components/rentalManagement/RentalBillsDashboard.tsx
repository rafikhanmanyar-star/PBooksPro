import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Bill, TransactionType, Transaction, ExpenseBearerType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import ARTreeView, { ARTreeNode } from './ARTreeView';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import BillBulkPaymentModal from '../bills/BillBulkPaymentModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import useLocalStorage from '../../hooks/useLocalStorage';

function getExpenseBearerType(bill: Bill, state: { rentalAgreements: { id: string }[] }): ExpenseBearerType {
  if (bill.expenseBearerType) return bill.expenseBearerType;
  if (bill.projectAgreementId && state.rentalAgreements?.some(ra => ra.id === bill.projectAgreementId)) return 'tenant';
  if (bill.propertyId) return 'owner';
  if (bill.buildingId) return 'building';
  return 'building';
}

type ViewBy = 'building' | 'property' | 'vendor' | 'bearer';
type StatusFilter = 'all' | 'Unpaid' | 'Paid' | 'Partially Paid' | 'Overdue';

const RentalBillsDashboard: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useNotification();

  const [viewBy, setViewBy] = useLocalStorage<ViewBy>('bills_dash_viewBy', 'building');
  const [statusFilter, setStatusFilter] = useLocalStorage<StatusFilter>('bills_dash_status', 'all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedNode, setSelectedNode] = useState<ARTreeNode | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null }>({ isOpen: false, transaction: null });

  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('bills_dash_sidebar', 320);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const baseBills = useMemo(() => state.bills.filter(b => !b.projectId), [state.bills]);

  const filteredBills = useMemo(() => {
    let result = baseBills;

    if (statusFilter !== 'all') result = result.filter(b => b.status === statusFilter);

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
  }, [baseBills, statusFilter, searchQuery, state.vendors, state.properties, state.buildings]);

  const treeData = useMemo((): ARTreeNode[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calcStats = (bills: Bill[]) => {
      let outstanding = 0;
      let overdue = 0;
      for (const b of bills) {
        const remaining = Math.max(0, b.amount - b.paidAmount);
        if (b.status !== 'Paid') {
          outstanding += remaining;
          if (b.dueDate && new Date(b.dueDate) < today && b.status !== 'Paid') overdue += remaining;
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
          const pId = b.propertyId || '__unassigned';
          if (!propGrouped.has(pId)) propGrouped.set(pId, []);
          propGrouped.get(pId)!.push(b);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([pId, pBills]) => {
          const prop = state.properties.find(p => p.id === pId);
          return {
            id: pId === '__unassigned' ? `prop-unassigned-${bId}` : pId,
            name: prop?.name || 'General',
            type: 'property' as const,
            ...calcStats(pBills),
          };
        });

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
  }, [filteredBills, viewBy, state.buildings, state.properties, state.vendors, state.rentalAgreements]);

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
        case 'amount': cmp = a.amount - b.amount; break;
        case 'balance': cmp = (a.amount - a.paidAmount) - (b.amount - b.paidAmount); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        default: cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [nodeBills, sortConfig, state.vendors]);

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
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
  }, [isResizing, handleMouseMove]);

  const handleSortClick = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };
  const SortArrow = ({ column }: { column: string }) => (
    <span className="ml-0.5 text-[9px] opacity-50">{sortConfig.key === column ? (sortConfig.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
  );

  const statusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-emerald-100 text-emerald-700';
      case 'Overdue': return 'bg-rose-100 text-rose-700';
      case 'Partially Paid': return 'bg-amber-100 text-amber-700';
      case 'Unpaid': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const bearerBadge = (bill: Bill) => {
    const b = getExpenseBearerType(bill, state);
    const styles: Record<string, string> = { owner: 'bg-indigo-100 text-indigo-700', building: 'bg-emerald-100 text-emerald-700', tenant: 'bg-amber-100 text-amber-700' };
    const labels: Record<string, string> = { owner: 'Owner', building: 'Bldg', tenant: 'Tenant' };
    return <span className={`px-1 py-0.5 rounded text-[9px] font-semibold ${styles[b] || ''}`}>{labels[b] || b}</span>;
  };

  const handleRecordPayment = (bill: Bill) => { setPaymentBill(bill); setIsPaymentModalOpen(true); };
  const handleEdit = (bill: Bill) => { setBillToEdit(bill); setIsCreateModalOpen(true); };

  const paymentTransactionData = useMemo(() => {
    if (!paymentBill) return { id: '', type: TransactionType.EXPENSE, amount: 0, date: new Date().toISOString().split('T')[0], accountId: '' } as any;
    return {
      id: '', type: TransactionType.EXPENSE,
      amount: paymentBill.amount - paymentBill.paidAmount,
      date: paymentBill.issueDate ? new Date(paymentBill.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      accountId: '', billId: paymentBill.id,
      contactId: paymentBill.contactId,
      buildingId: paymentBill.buildingId, propertyId: paymentBill.propertyId,
      categoryId: paymentBill.categoryId,
      description: paymentBill.description || `Payment for Bill #${paymentBill.billNumber}`,
    } as any;
  }, [paymentBill]);

  const selectedBillsList = useMemo(() => state.bills.filter(b => selectedBillIds.has(b.id)), [state.bills, selectedBillIds]);
  const toggleSelection = useCallback((id: string) => {
    setSelectedBillIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const selectClass = 'px-2 py-1 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-accent/50 focus:border-accent cursor-pointer';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/50">
      {/* Compact Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-slate-500 uppercase">View</label>
          <select value={viewBy} onChange={e => setViewBy(e.target.value as ViewBy)} className={selectClass}>
            <option value="building">Building</option>
            <option value="property">Property</option>
            <option value="vendor">Vendor</option>
            <option value="bearer">Expense Bearer</option>
          </select>
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1">
          {['All', 'Unpaid', 'Paid', 'Partially Paid', 'Overdue'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === 'All' ? 'all' : s as StatusFilter)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                (s === 'All' && statusFilter === 'all') || statusFilter === s
                  ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-400">
            <div className="w-3.5 h-3.5">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder="Search bill #, vendor, property..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-1 w-full text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-accent/50 focus:border-accent"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button onClick={() => { setBillToEdit(null); setIsCreateModalOpen(true); }} size="sm" className="text-xs">
            <div className="w-3.5 h-3.5 mr-1">{ICONS.plus}</div>
            New Bill
          </Button>
          {selectedBillIds.size > 0 && (
            <Button variant="secondary" onClick={() => setIsBulkPayModalOpen(true)} size="sm" className="text-xs">
              Pay Selected ({selectedBillIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Split Layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel: Tree */}
        <div className="flex-shrink-0 border-r border-slate-200 overflow-hidden hidden md:flex flex-col" style={{ width: `${sidebarWidth}px` }}>
          <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Accounts Payable</span>
            <span className="text-[10px] text-slate-400">{treeData.length} groups</span>
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
          className="w-1.5 cursor-col-resize hover:bg-indigo-200 active:bg-indigo-300 transition-colors hidden md:block flex-shrink-0"
          onMouseDown={e => { e.preventDefault(); setIsResizing(true); }}
        />

        {/* Right Panel: Bill List */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-700 truncate">
                {selectedNode ? selectedNode.name : 'All Bills'}
              </span>
              {selectedNode && (
                <button onClick={() => setSelectedNode(null)} className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-200">Clear</button>
              )}
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
              {sortedBills.length} bill{sortedBills.length !== 1 ? 's' : ''}
              {selectedNode && ` · ${CURRENCY} ${selectedNode.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} payable`}
            </span>
          </div>

          {/* Mobile dropdown */}
          <div className="md:hidden px-3 py-2 bg-white border-b border-slate-200">
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
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
            >
              <option value="">All Bills</option>
              {treeData.map(n => <option key={n.id} value={n.id}>{n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="w-8 px-2 py-1.5 text-center">
                    <input type="checkbox" checked={selectedBillIds.size > 0 && selectedBillIds.size === sortedBills.length}
                      onChange={() => { selectedBillIds.size === sortedBills.length ? setSelectedBillIds(new Set()) : setSelectedBillIds(new Set(sortedBills.map(b => b.id))); }}
                      className="w-3.5 h-3.5 rounded border-slate-300" />
                  </th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('billNumber')}>Bill # <SortArrow column="billNumber" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('date')}>Date <SortArrow column="date" /></th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('vendor')}>Vendor <SortArrow column="vendor" /></th>
                  <th className="px-2 py-1.5 text-center">Bearer</th>
                  <th className="px-2 py-1.5 text-left">Property</th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('amount')}>Amount <SortArrow column="amount" /></th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('balance')}>Balance <SortArrow column="balance" /></th>
                  <th className="px-2 py-1.5 text-center cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('status')}>Status <SortArrow column="status" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedBills.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic">No bills found</td></tr>
                ) : sortedBills.map(bill => {
                  const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                  const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
                  const balance = Math.max(0, bill.amount - bill.paidAmount);
                  const isChecked = selectedBillIds.has(bill.id);

                  return (
                    <tr
                      key={bill.id}
                      onClick={() => handleEdit(bill)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleSelection(bill.id)} className="w-3.5 h-3.5 rounded border-slate-300" />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-indigo-600">{bill.billNumber}</td>
                      <td className="px-2 py-1.5 text-slate-600 tabular-nums">{formatDate(bill.issueDate)}</td>
                      <td className="px-2 py-1.5 text-slate-700 truncate max-w-[130px]" title={vendor?.name}>{vendor?.name || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{bearerBadge(bill)}</td>
                      <td className="px-2 py-1.5 text-slate-500 truncate max-w-[120px]">{prop?.name || (bill.buildingId ? 'Building-wide' : '—')}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{bill.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {balance > 0 ? balance.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor(bill.status)}`}>{bill.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
            <span>{sortedBills.length} bills</span>
            <div className="flex gap-4 tabular-nums">
              <span>Total: <strong className="text-slate-700">{CURRENCY} {sortedBills.reduce((s, b) => s + b.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
              <span>Payable: <strong className="text-rose-600">{CURRENCY} {sortedBills.reduce((s, b) => s + Math.max(0, b.amount - b.paidAmount), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={billToEdit ? 'Edit Bill' : 'Record New Bill'} size="xl">
        <InvoiceBillForm onClose={() => setIsCreateModalOpen(false)} type="bill" rentalContext={true} itemToEdit={billToEdit || undefined} />
      </Modal>

      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={paymentBill ? `Pay Bill #${paymentBill.billNumber}` : 'Pay Bill'}>
        <TransactionForm onClose={() => setIsPaymentModalOpen(false)} transactionTypeForNew={TransactionType.EXPENSE} transactionToEdit={paymentTransactionData} onShowDeleteWarning={() => {}} />
      </Modal>

      <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Payment">
        <TransactionForm onClose={() => setTransactionToEdit(null)} transactionToEdit={transactionToEdit} onShowDeleteWarning={(tx) => { setTransactionToEdit(null); setWarningModalState({ isOpen: true, transaction: tx }); }} />
      </Modal>

      <LinkedTransactionWarningModal isOpen={warningModalState.isOpen} onClose={() => setWarningModalState({ isOpen: false, transaction: null })} onConfirm={() => {
        if (warningModalState.transaction) dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id });
        setWarningModalState({ isOpen: false, transaction: null });
        showToast('Payment deleted successfully');
      }} action="delete" linkedItemName="this bill" />

      <BillBulkPaymentModal isOpen={isBulkPayModalOpen} onClose={() => setIsBulkPayModalOpen(false)} selectedBills={selectedBillsList} onPaymentComplete={() => { setSelectedBillIds(new Set()); setIsBulkPayModalOpen(false); }} />
    </div>
  );
};

export default RentalBillsDashboard;
