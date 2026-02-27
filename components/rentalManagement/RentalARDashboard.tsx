import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, InvoiceStatus, InvoiceType, Transaction, TransactionType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import ARTreeView, { ARTreeNode } from './ARTreeView';
import InvoiceDetailView from '../invoices/InvoiceDetailView';
import RentalPaymentModal from '../invoices/RentalPaymentModal';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import BulkPaymentModal from '../invoices/BulkPaymentModal';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useDebounce } from '../../hooks/useDebounce';

const RENTAL_INVOICE_TYPES = [InvoiceType.RENTAL, InvoiceType.SECURITY_DEPOSIT];

type ViewBy = 'building' | 'property' | 'tenant' | 'owner';
type AgingFilter = 'all' | 'overdue' | '0-30' | '31-60' | '61-90' | '90+';

interface RentalARDashboardProps {
  onCreateRentalClick?: () => void;
  onCreateSecurityClick?: () => void;
}

function isOverdueByAging(dueDate: string, aging: AgingFilter): boolean {
  if (aging === 'all') return true;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

  switch (aging) {
    case 'overdue': return daysOverdue > 0;
    case '0-30': return daysOverdue >= 0 && daysOverdue <= 30;
    case '31-60': return daysOverdue >= 31 && daysOverdue <= 60;
    case '61-90': return daysOverdue >= 61 && daysOverdue <= 90;
    case '90+': return daysOverdue > 90;
    default: return true;
  }
}

const RentalARDashboard: React.FC<RentalARDashboardProps> = ({
  onCreateRentalClick,
  onCreateSecurityClick,
}) => {
  const { state, dispatch } = useAppContext();
  const { showConfirm, showToast, showAlert } = useNotification();

  // Filters
  const [viewBy, setViewBy] = useLocalStorage<ViewBy>('ar_dashboard_viewBy', 'building');
  const [agingFilter, setAgingFilter] = useLocalStorage<AgingFilter>('ar_dashboard_aging', 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Selection
  const [selectedNode, setSelectedNode] = useState<ARTreeNode | null>(null);

  // Invoice interaction state
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [paymentDeleteModal, setPaymentDeleteModal] = useState<{ isOpen: boolean; transaction: Transaction | null }>({ isOpen: false, transaction: null });

  // Sidebar resize
  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('ar_dashboard_sidebar', 340);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort state for invoice list
  const [invoiceSort, setInvoiceSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  // Base rental invoices
  const rentalInvoices = useMemo(() =>
    state.invoices.filter(inv => RENTAL_INVOICE_TYPES.includes(inv.invoiceType)),
    [state.invoices]
  );

  // Filtered invoices (aging + search applied)
  const filteredInvoices = useMemo(() => {
    let result = rentalInvoices;

    if (agingFilter !== 'all') {
      result = result.filter(inv => {
        if (inv.status === InvoiceStatus.PAID) return false;
        return isOverdueByAging(inv.dueDate, agingFilter);
      });
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(inv => {
        if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
        const contact = state.contacts.find(c => c.id === inv.contactId);
        if (contact?.name?.toLowerCase().includes(q)) return true;
        if (inv.propertyId) {
          const prop = state.properties.find(p => p.id === inv.propertyId);
          if (prop?.name?.toLowerCase().includes(q)) return true;
          if (prop?.buildingId) {
            const bld = state.buildings.find(b => b.id === prop.buildingId);
            if (bld?.name?.toLowerCase().includes(q)) return true;
          }
        }
        const prop = inv.propertyId ? state.properties.find(p => p.id === inv.propertyId) : null;
        if (prop?.ownerId) {
          const owner = state.contacts.find(c => c.id === prop.ownerId);
          if (owner?.name?.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    return result;
  }, [rentalInvoices, agingFilter, debouncedSearch, state.contacts, state.properties, state.buildings]);

  // Build tree from filtered invoices
  const treeData = useMemo((): ARTreeNode[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const toNum = (v: unknown): number => (typeof v === 'number' && !isNaN(v)) ? v : (parseFloat(String(v ?? 0)) || 0);
    const calcStats = (invoices: Invoice[]) => {
      let outstanding = 0;
      let overdue = 0;
      let count = 0;
      for (const inv of invoices) {
        count++;
        const amt = toNum(inv.amount);
        const paid = toNum(inv.paidAmount);
        const remaining = Math.max(0, amt - paid);
        if (inv.status !== InvoiceStatus.PAID) {
          outstanding += remaining;
          if (new Date(inv.dueDate) < today) {
            overdue += remaining;
          }
        }
      }
      return { outstanding, overdue, invoiceCount: count };
    };

    const getPropertyBuildingId = (propertyId?: string) => {
      if (!propertyId) return null;
      return state.properties.find(p => p.id === propertyId)?.buildingId || null;
    };

    const getPropertyOwnerId = (propertyId?: string) => {
      if (!propertyId) return null;
      return state.properties.find(p => p.id === propertyId)?.ownerId || null;
    };

    if (viewBy === 'building') {
      const grouped = new Map<string, Invoice[]>();
      for (const inv of filteredInvoices) {
        const buildingId = inv.buildingId || getPropertyBuildingId(inv.propertyId) || '__unassigned';
        if (!grouped.has(buildingId)) grouped.set(buildingId, []);
        grouped.get(buildingId)!.push(inv);
      }

      return Array.from(grouped.entries()).map(([buildingId, invs]) => {
        const building = state.buildings.find(b => b.id === buildingId);
        const stats = calcStats(invs);

        // Children: Properties within this building
        const propGrouped = new Map<string, Invoice[]>();
        for (const inv of invs) {
          const propId = inv.propertyId || '__unassigned';
          if (!propGrouped.has(propId)) propGrouped.set(propId, []);
          propGrouped.get(propId)!.push(inv);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([propId, propInvs]) => {
          const prop = state.properties.find(p => p.id === propId);
          const propStats = calcStats(propInvs);

          // Sub-children: Tenants within this property
          const tenantGrouped = new Map<string, Invoice[]>();
          for (const inv of propInvs) {
            if (!tenantGrouped.has(inv.contactId)) tenantGrouped.set(inv.contactId, []);
            tenantGrouped.get(inv.contactId)!.push(inv);
          }

          const tenantChildren: ARTreeNode[] = Array.from(tenantGrouped.entries()).map(([contactId, tInvs]) => {
            const contact = state.contacts.find(c => c.id === contactId);
            return {
              id: `tenant-${contactId}-${propId}`,
              name: contact?.name || 'Unknown Tenant',
              type: 'tenant' as const,
              ...calcStats(tInvs),
            };
          });

          return {
            id: propId === '__unassigned' ? `prop-unassigned-${buildingId}` : propId,
            name: prop?.name || 'Unassigned Property',
            type: 'property' as const,
            ...propStats,
            children: tenantChildren.length > 0 ? tenantChildren : undefined,
          };
        });

        return {
          id: buildingId === '__unassigned' ? '__building_unassigned' : buildingId,
          name: building?.name || 'Unassigned Building',
          type: 'building' as const,
          ...stats,
          children: children.length > 0 ? children : undefined,
        };
      });
    }

    if (viewBy === 'property') {
      const grouped = new Map<string, Invoice[]>();
      for (const inv of filteredInvoices) {
        const propId = inv.propertyId || '__unassigned';
        if (!grouped.has(propId)) grouped.set(propId, []);
        grouped.get(propId)!.push(inv);
      }

      return Array.from(grouped.entries()).map(([propId, invs]) => {
        const prop = state.properties.find(p => p.id === propId);
        const stats = calcStats(invs);

        const tenantGrouped = new Map<string, Invoice[]>();
        for (const inv of invs) {
          if (!tenantGrouped.has(inv.contactId)) tenantGrouped.set(inv.contactId, []);
          tenantGrouped.get(inv.contactId)!.push(inv);
        }

        const children: ARTreeNode[] = Array.from(tenantGrouped.entries()).map(([contactId, tInvs]) => {
          const contact = state.contacts.find(c => c.id === contactId);
          return {
            id: `tenant-${contactId}-${propId}`,
            name: contact?.name || 'Unknown Tenant',
            type: 'tenant' as const,
            ...calcStats(tInvs),
          };
        });

        return {
          id: propId === '__unassigned' ? '__property_unassigned' : propId,
          name: prop?.name || 'Unassigned Property',
          type: 'property' as const,
          ...stats,
          children: children.length > 0 ? children : undefined,
        };
      });
    }

    if (viewBy === 'tenant') {
      const grouped = new Map<string, Invoice[]>();
      for (const inv of filteredInvoices) {
        if (!grouped.has(inv.contactId)) grouped.set(inv.contactId, []);
        grouped.get(inv.contactId)!.push(inv);
      }

      return Array.from(grouped.entries()).map(([contactId, invs]) => {
        const contact = state.contacts.find(c => c.id === contactId);
        return {
          id: contactId,
          name: contact?.name || 'Unknown Tenant',
          type: 'tenant' as const,
          ...calcStats(invs),
        };
      });
    }

    if (viewBy === 'owner') {
      const grouped = new Map<string, Invoice[]>();
      for (const inv of filteredInvoices) {
        const ownerId = getPropertyOwnerId(inv.propertyId) || '__unassigned';
        if (!grouped.has(ownerId)) grouped.set(ownerId, []);
        grouped.get(ownerId)!.push(inv);
      }

      return Array.from(grouped.entries()).map(([ownerId, invs]) => {
        const owner = state.contacts.find(c => c.id === ownerId);

        // Children: Buildings for this owner
        const buildingGrouped = new Map<string, Invoice[]>();
        for (const inv of invs) {
          const bId = inv.buildingId || getPropertyBuildingId(inv.propertyId) || '__unassigned';
          if (!buildingGrouped.has(bId)) buildingGrouped.set(bId, []);
          buildingGrouped.get(bId)!.push(inv);
        }

        const children: ARTreeNode[] = Array.from(buildingGrouped.entries()).map(([bId, bInvs]) => {
          const building = state.buildings.find(b => b.id === bId);

          const propGrouped = new Map<string, Invoice[]>();
          for (const inv of bInvs) {
            const pId = inv.propertyId || '__unassigned';
            if (!propGrouped.has(pId)) propGrouped.set(pId, []);
            propGrouped.get(pId)!.push(inv);
          }

          const propChildren: ARTreeNode[] = Array.from(propGrouped.entries()).map(([pId, pInvs]) => {
            const prop = state.properties.find(p => p.id === pId);

            const tenantGrouped = new Map<string, Invoice[]>();
            for (const inv of pInvs) {
              if (!tenantGrouped.has(inv.contactId)) tenantGrouped.set(inv.contactId, []);
              tenantGrouped.get(inv.contactId)!.push(inv);
            }

            const tenantChildren: ARTreeNode[] = Array.from(tenantGrouped.entries()).map(([cId, tInvs]) => {
              const contact = state.contacts.find(c => c.id === cId);
              return {
                id: `tenant-${cId}-${pId}-${bId}`,
                name: contact?.name || 'Unknown Tenant',
                type: 'tenant' as const,
                ...calcStats(tInvs),
              };
            });

            return {
              id: pId === '__unassigned' ? `prop-unassigned-${bId}-${ownerId}` : `${pId}-owner-${ownerId}`,
              name: prop?.name || 'Unassigned Property',
              type: 'property' as const,
              ...calcStats(pInvs),
              children: tenantChildren.length > 0 ? tenantChildren : undefined,
            };
          });

          return {
            id: bId === '__unassigned' ? `bld-unassigned-${ownerId}` : `${bId}-owner-${ownerId}`,
            name: building?.name || 'Unassigned Building',
            type: 'building' as const,
            ...calcStats(bInvs),
            children: propChildren.length > 0 ? propChildren : undefined,
          };
        });

        return {
          id: ownerId === '__unassigned' ? '__owner_unassigned' : ownerId,
          name: owner?.name || 'Unassigned Owner',
          type: 'owner' as const,
          ...calcStats(invs),
          children: children.length > 0 ? children : undefined,
        };
      });
    }

    return [];
  }, [filteredInvoices, viewBy, state.buildings, state.properties, state.contacts]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedNode(null);
  }, [viewBy, agingFilter]);

  // Invoices for selected node
  const selectedNodeInvoices = useMemo(() => {
    if (!selectedNode) return filteredInvoices;

    const nodeId = selectedNode.id;

    return filteredInvoices.filter(inv => {
      const propBuildingId = inv.propertyId
        ? state.properties.find(p => p.id === inv.propertyId)?.buildingId
        : null;
      const propOwnerId = inv.propertyId
        ? state.properties.find(p => p.id === inv.propertyId)?.ownerId
        : null;

      // Handle compound IDs (e.g., "tenant-xxx-propId-bldId")
      if (nodeId.startsWith('tenant-')) {
        const parts = nodeId.replace('tenant-', '').split('-');
        const contactId = parts[0];
        return inv.contactId === contactId;
      }

      switch (selectedNode.type) {
        case 'building':
          if (nodeId.includes('__unassigned')) return !inv.buildingId && !propBuildingId;
          return inv.buildingId === nodeId || propBuildingId === nodeId;
        case 'property':
          if (nodeId.includes('__unassigned')) return !inv.propertyId;
          // Strip owner suffix for compound IDs
          const cleanPropId = nodeId.includes('-owner-') ? nodeId.split('-owner-')[0] : nodeId;
          return inv.propertyId === cleanPropId;
        case 'tenant':
          return inv.contactId === nodeId;
        case 'owner':
          if (nodeId.includes('__unassigned')) return !propOwnerId;
          return propOwnerId === nodeId;
        default:
          return true;
      }
    });
  }, [selectedNode, filteredInvoices, state.properties]);

  // Sorted invoices for the list
  const sortedInvoices = useMemo(() => {
    const sorted = [...selectedNodeInvoices];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (invoiceSort.key) {
        case 'invoiceNumber':
          cmp = (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
          break;
        case 'date':
          cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
          break;
        case 'tenant': {
          const nameA = state.contacts.find(c => c.id === a.contactId)?.name || '';
          const nameB = state.contacts.find(c => c.id === b.contactId)?.name || '';
          cmp = nameA.localeCompare(nameB);
          break;
        }
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'due':
          cmp = (a.amount - a.paidAmount) - (b.amount - b.paidAmount);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        default:
          cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
      }
      return invoiceSort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [selectedNodeInvoices, invoiceSort, state.contacts]);

  // Resize logic
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const newWidth = e.clientX - containerLeft;
    if (newWidth > 200 && newWidth < 600) {
      setSidebarWidth(newWidth);
    }
  }, [setSidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove]);

  // Invoice action handlers
  const handleInvoiceClick = useCallback((invoice: Invoice) => {
    setViewInvoice(invoice);
  }, []);

  const handleRecordPayment = useCallback((invoice: Invoice) => {
    setViewInvoice(null);
    setPaymentInvoice(invoice);
    setIsPaymentModalOpen(true);
  }, []);

  const handleEditInvoice = useCallback((invoice: Invoice) => {
    setInvoiceToEdit(invoice);
    setViewInvoice(null);
  }, []);

  const handleDeleteInvoice = useCallback(async (invoice: Invoice) => {
    if (invoice.paidAmount > 0) {
      await showAlert('This invoice has payments. Delete payments first.', { title: 'Cannot Delete' });
      return;
    }
    const ok = await showConfirm(`Delete Invoice #${invoice.invoiceNumber}?`, {
      title: 'Delete Invoice',
      confirmLabel: 'Delete',
    });
    if (ok) {
      dispatch({ type: 'DELETE_INVOICE', payload: invoice.id });
      setViewInvoice(null);
      showToast('Invoice deleted.');
    }
  }, [dispatch, showAlert, showConfirm, showToast]);

  const handleConfirmPaymentDelete = useCallback(() => {
    const { transaction } = paymentDeleteModal;
    if (transaction) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
      showToast('Payment deleted. Invoice status updated.');
    }
    setPaymentDeleteModal({ isOpen: false, transaction: null });
    setTransactionToEdit(null);
  }, [paymentDeleteModal, dispatch, showToast]);

  const getLinkedItemName = useCallback((tx: Transaction | null): string => {
    if (!tx) return '';
    if (tx.invoiceId) return 'an Invoice';
    if (tx.billId) return 'a Bill';
    return 'linked item';
  }, []);

  const selectedInvoicesList = useMemo(
    () => state.invoices.filter(inv => selectedInvoiceIds.has(inv.id)),
    [state.invoices, selectedInvoiceIds]
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSortClick = (key: string) => {
    setInvoiceSort(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortArrow = ({ column }: { column: string }) => (
    <span className="ml-0.5 text-[9px] opacity-50">
      {invoiceSort.key === column ? (invoiceSort.dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  const statusColor = (status: string) => {
    switch (status) {
      case InvoiceStatus.PAID: return 'bg-emerald-100 text-emerald-700';
      case InvoiceStatus.OVERDUE: return 'bg-rose-100 text-rose-700';
      case InvoiceStatus.PARTIALLY_PAID: return 'bg-amber-100 text-amber-700';
      case InvoiceStatus.UNPAID: return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const selectClass = 'px-2 py-1 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-accent/50 focus:border-accent cursor-pointer';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/50">
      {/* Compact Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-slate-500 uppercase">View</label>
          <select
            value={viewBy}
            onChange={e => setViewBy(e.target.value as ViewBy)}
            className={selectClass}
          >
            <option value="building">Building</option>
            <option value="property">Property</option>
            <option value="tenant">Tenant</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-slate-500 uppercase">Aging</label>
          <select
            value={agingFilter}
            onChange={e => setAgingFilter(e.target.value as AgingFilter)}
            className={selectClass}
          >
            <option value="all">All</option>
            <option value="overdue">Only Overdue</option>
            <option value="0-30">0–30 days</option>
            <option value="31-60">31–60 days</option>
            <option value="61-90">61–90 days</option>
            <option value="90+">90+ days</option>
          </select>
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-400">
            <div className="w-3.5 h-3.5">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder="Search tenant, invoice, unit, owner..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-1 w-full text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-accent/50 focus:border-accent"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {onCreateRentalClick && (
            <Button onClick={onCreateRentalClick} size="sm" className="text-xs">
              <div className="w-3.5 h-3.5 mr-1">{ICONS.plus}</div>
              Invoice
            </Button>
          )}
          {onCreateSecurityClick && (
            <Button variant="secondary" onClick={onCreateSecurityClick} size="sm" className="text-xs">
              Security Dep.
            </Button>
          )}
          {selectedInvoiceIds.size > 0 && (
            <Button
              variant="secondary"
              onClick={() => setIsBulkPayModalOpen(true)}
              size="sm"
              className="text-xs"
            >
              Bulk Pay ({selectedInvoiceIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Split Layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel: AR Tree */}
        <div
          className="flex-shrink-0 border-r border-slate-200 overflow-hidden hidden md:flex flex-col"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Accounts Receivable
            </span>
            <span className="text-[10px] text-slate-400">
              {treeData.length} {viewBy === 'building' ? 'buildings' : viewBy === 'property' ? 'properties' : viewBy === 'tenant' ? 'tenants' : 'owners'}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ARTreeView
              treeData={treeData}
              selectedNodeId={selectedNode?.id || null}
              onNodeSelect={setSelectedNode}
              searchQuery={searchQuery}
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1.5 cursor-col-resize hover:bg-indigo-200 active:bg-indigo-300 transition-colors hidden md:block flex-shrink-0"
          onMouseDown={e => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />

        {/* Right Panel: Invoice List */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Panel Header */}
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-700 truncate">
                {selectedNode ? selectedNode.name : 'All Invoices'}
              </span>
              {selectedNode && (
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
              {sortedInvoices.length} invoice{sortedInvoices.length !== 1 ? 's' : ''}
              {selectedNode && ` · ${CURRENCY} ${selectedNode.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} outstanding`}
            </span>
          </div>

          {/* Mobile: Tree selector dropdown */}
          <div className="md:hidden px-3 py-2 bg-white border-b border-slate-200">
            <select
              value={selectedNode?.id || ''}
              onChange={e => {
                const id = e.target.value;
                if (!id) { setSelectedNode(null); return; }
                const findNode = (nodes: ARTreeNode[]): ARTreeNode | null => {
                  for (const n of nodes) {
                    if (n.id === id) return n;
                    if (n.children) {
                      const found = findNode(n.children);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                setSelectedNode(findNode(treeData));
              }}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
            >
              <option value="">All Invoices</option>
              {treeData.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </option>
              ))}
            </select>
          </div>

          {/* Invoice Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="w-8 px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedInvoiceIds.size > 0 && selectedInvoiceIds.size === sortedInvoices.length}
                      onChange={() => {
                        if (selectedInvoiceIds.size === sortedInvoices.length) {
                          setSelectedInvoiceIds(new Set());
                        } else {
                          setSelectedInvoiceIds(new Set(sortedInvoices.map(i => i.id)));
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-slate-300"
                    />
                  </th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('invoiceNumber')}>
                    Invoice # <SortArrow column="invoiceNumber" />
                  </th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('date')}>
                    Date <SortArrow column="date" />
                  </th>
                  <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('tenant')}>
                    Tenant <SortArrow column="tenant" />
                  </th>
                  <th className="px-2 py-1.5 text-left">Unit</th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('amount')}>
                    Amount <SortArrow column="amount" />
                  </th>
                  <th className="px-2 py-1.5 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('due')}>
                    Due <SortArrow column="due" />
                  </th>
                  <th className="px-2 py-1.5 text-center cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('status')}>
                    Status <SortArrow column="status" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">
                      {selectedNode ? 'No invoices for selected node' : 'No rental invoices found'}
                    </td>
                  </tr>
                ) : (
                  sortedInvoices.map(inv => {
                    const contact = state.contacts.find(c => c.id === inv.contactId);
                    const prop = inv.propertyId ? state.properties.find(p => p.id === inv.propertyId) : null;
                    const amt = Number(inv.amount) || 0;
                    const paid = Number(inv.paidAmount) ?? 0;
                    const remaining = Math.max(0, amt - paid);
                    const isChecked = selectedInvoiceIds.has(inv.id);

                    return (
                      <tr
                        key={inv.id}
                        onClick={() => handleInvoiceClick(inv)}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${
                          isChecked ? 'bg-indigo-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelection(inv.id)}
                            className="w-3.5 h-3.5 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-2 py-1.5 font-medium text-indigo-600">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 tabular-nums">
                          {formatDate(inv.issueDate)}
                        </td>
                        <td className="px-2 py-1.5 text-slate-700 truncate max-w-[150px]" title={contact?.name}>
                          {contact?.name || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 truncate max-w-[120px]" title={prop?.name}>
                          {prop?.name || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                          {amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${
                          remaining > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {remaining > 0 ? remaining.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor(inv.status)}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
            <span>{sortedInvoices.length} invoice{sortedInvoices.length !== 1 ? 's' : ''}</span>
            <div className="flex gap-4 tabular-nums">
              <span>
                Total: <strong className="text-slate-700">
                  {CURRENCY} {sortedInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </strong>
              </span>
              <span>
                Outstanding: <strong className="text-rose-600">
                  {CURRENCY} {sortedInvoices.reduce((s, i) => {
                    const amt = Number(i.amount) || 0;
                    const paid = Number(i.paidAmount) ?? 0;
                    return s + Math.max(0, amt - paid);
                  }, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </strong>
              </span>
              {(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const overdueSum = sortedInvoices.reduce((s, i) => {
                  if (i.status === InvoiceStatus.PAID) return s;
                  const due = new Date(i.dueDate);
                  if (due >= today) return s;
                  const amt = Number(i.amount) || 0;
                  const paid = Number(i.paidAmount) ?? 0;
                  return s + Math.max(0, amt - paid);
                }, 0);
                if (overdueSum <= 0) return null;
                return (
                  <span>
                    Overdue: <strong className="text-rose-600">
                      {CURRENCY} {overdueSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </strong>
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Panel Sidebar */}
      {viewInvoice && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] max-w-full bg-white shadow-xl border-l border-slate-200 z-50 overflow-y-auto">
          <div className="p-4">
            <InvoiceDetailView
              invoice={viewInvoice}
              onRecordPayment={handleRecordPayment}
              onEdit={handleEditInvoice}
              onDelete={handleDeleteInvoice}
            />
            <Button variant="secondary" onClick={() => setViewInvoice(null)} className="mt-4">
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      <Modal
        isOpen={!!invoiceToEdit}
        onClose={() => setInvoiceToEdit(null)}
        title="Edit Invoice"
        size="xl"
      >
        {invoiceToEdit && (
          <InvoiceBillForm
            itemToEdit={invoiceToEdit}
            onClose={() => setInvoiceToEdit(null)}
            type="invoice"
          />
        )}
      </Modal>

      {/* Payment Modal */}
      <RentalPaymentModal
        isOpen={isPaymentModalOpen || !!transactionToEdit}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentInvoice(null);
          setTransactionToEdit(null);
        }}
        invoice={paymentInvoice}
        transactionToEdit={transactionToEdit}
        onShowDeleteWarning={transactionToEdit ? (tx: Transaction) => setPaymentDeleteModal({ isOpen: true, transaction: tx }) : undefined}
      />

      {/* Bulk Payment Modal */}
      <BulkPaymentModal
        isOpen={isBulkPayModalOpen}
        onClose={() => setIsBulkPayModalOpen(false)}
        selectedInvoices={selectedInvoicesList}
        onPaymentComplete={() => {
          setSelectedInvoiceIds(new Set());
          setIsBulkPayModalOpen(false);
        }}
      />

      {/* Delete Payment Confirmation */}
      <LinkedTransactionWarningModal
        isOpen={paymentDeleteModal.isOpen}
        onClose={() => setPaymentDeleteModal({ isOpen: false, transaction: null })}
        onConfirm={handleConfirmPaymentDelete}
        linkedItemName={getLinkedItemName(paymentDeleteModal.transaction)}
        action="delete"
      />
    </div>
  );
};

export default RentalARDashboard;
