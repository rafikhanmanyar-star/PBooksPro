import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useInvoices, useContacts, useProperties, useBuildings, useAccounts, useTransactions, useDispatchOnly } from '../../hooks/useSelectiveState';
import { Invoice, InvoiceStatus, InvoiceType, Transaction, TransactionType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import ARTreeView, { ARTreeNode } from './ARTreeView';
import InvoiceDetailView from '../invoices/InvoiceDetailView';
import RentalPaymentModal from '../invoices/RentalPaymentModal';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import BulkPaymentModal from '../invoices/BulkPaymentModal';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import VirtualizedInvoiceTable from './VirtualizedInvoiceTable';
import RentalFinancialGrid, { FinancialRecord } from '../invoices/RentalFinancialGrid';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useDebounce } from '../../hooks/useDebounce';
import { useGenerateDueInvoices } from '../../hooks/useGenerateDueInvoices';

const RENTAL_INVOICE_TYPES = [InvoiceType.RENTAL, InvoiceType.SECURITY_DEPOSIT];

/** Match grid logic: invoice shows as "Security" when type is Security Deposit or has security in amount/description */
function isSecurityInvoice(inv: Invoice): boolean {
  return inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ||
    (inv.securityDepositCharge || 0) > 0 ||
    (inv.description || '').toLowerCase().includes('security');
}

type ViewBy = 'building' | 'property' | 'tenant' | 'owner';
type AgingFilter = 'all' | 'overdue' | '0-30' | '31-60' | '61-90' | '90+';

/** Get property id from tree node when selection represents a single property (for prefill). */
function getPropertyIdFromNode(node: ARTreeNode | null): string | null {
  if (!node || node.type !== 'property') return null;
  const id = node.id;
  if (id.includes('-owner-')) return id.split('-owner-')[0];
  if (id.startsWith('prop-unassigned-') || id === '__property_unassigned') return null;
  return id;
}

interface RentalARDashboardProps {
  /** When true, show List-style filters (status, view by, entity, type, date) and summary cards + banner */
  listMode?: boolean;
  /** Called with selected property id when tree has a property selected, else null. Form can prefill from this. */
  onCreateRentalClick?: (prefillPropertyId: string | null) => void;
  onCreateSecurityClick?: (prefillPropertyId: string | null) => void;
  onSchedulesClick?: () => void;
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

function getStatusColorClass(status: string): string {
  const base = 'border px-1.5 py-0.5 rounded text-[10px] font-semibold';
  switch (status) {
    case InvoiceStatus.PAID: return `${base} border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success`;
    case InvoiceStatus.OVERDUE: return `${base} border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-ds-danger`;
    case InvoiceStatus.PARTIALLY_PAID: return `${base} border-ds-warning/35 bg-app-toolbar text-ds-warning`;
    case InvoiceStatus.UNPAID: return `${base} border-app-border bg-app-toolbar text-app-muted`;
    default: return `${base} border-app-border bg-app-toolbar text-app-muted`;
  }
}

const RentalARDashboard: React.FC<RentalARDashboardProps> = ({
  listMode = false,
  onCreateRentalClick,
  onCreateSecurityClick,
  onSchedulesClick,
}) => {
  const invoices = useInvoices();
  const contacts = useContacts();
  const properties = useProperties();
  const buildings = useBuildings();
  const accounts = useAccounts();
  const transactions = useTransactions();
  const dispatch = useDispatchOnly();
  const { showConfirm, showToast, showAlert } = useNotification();
  const { overdueCount: dueCount, handleGenerateAllDue, isGenerating } = useGenerateDueInvoices();

  // Filters — list and summary use separate keys so both persist
  const [viewByList, setViewByList] = useLocalStorage<ViewBy>('rental_invoices_groupBy', 'building');
  const [viewBySummary, setViewBySummary] = useLocalStorage<ViewBy>('ar_dashboard_viewBy', 'building');
  const viewBy = listMode ? viewByList : viewBySummary;
  const setViewBy = listMode ? setViewByList : setViewBySummary;

  const [agingFilter, setAgingFilter] = useLocalStorage<AgingFilter>('ar_dashboard_aging', 'all');
  const [statusFilter, setStatusFilter] = useLocalStorage<string>('rental_invoices_statusFilter', 'All');
  const [entityFilterId, setEntityFilterId] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('All');
  const [recordTypeFilter, setRecordTypeFilter] = useState<'All' | 'Invoices' | 'Payments'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Selection
  const [selectedNode, setSelectedNode] = useState<ARTreeNode | null>(null);

  // Invoice interaction state
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [duplicateInvoiceData, setDuplicateInvoiceData] = useState<Partial<Invoice> | null>(null);
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
    invoices.filter(inv => RENTAL_INVOICE_TYPES.includes(inv.invoiceType)),
    [invoices]
  );

  // Entity options for list-mode dropdown (tenants/owners/properties/buildings with invoices)
  const tenantsWithInvoices = useMemo(() => {
    const ids = new Set(rentalInvoices.map(inv => inv.contactId));
    return contacts.filter(c => ids.has(c.id));
  }, [rentalInvoices, contacts]);
  const ownersWithInvoices = useMemo(() => {
    const ids = new Set<string>();
    rentalInvoices.forEach(inv => {
      const ownerId = inv.propertyId ? properties.find(p => p.id === inv.propertyId)?.ownerId : null;
      if (ownerId) ids.add(ownerId);
    });
    return contacts.filter(c => ids.has(c.id));
  }, [rentalInvoices, properties, contacts]);
  const propertiesWithInvoices = useMemo(() => {
    const ids = new Set(rentalInvoices.map(inv => inv.propertyId).filter(Boolean) as string[]);
    return properties.filter(p => ids.has(p.id));
  }, [rentalInvoices, properties]);

  // Filtered invoices (list mode: status, entity, type, date, search; summary: aging, search)
  const filteredInvoices = useMemo(() => {
    let result = rentalInvoices;

    if (listMode) {
      if (statusFilter !== 'All') {
        result = result.filter(inv => inv.status === statusFilter);
      }
      if (entityFilterId && entityFilterId !== 'all') {
        if (viewBy === 'tenant') result = result.filter(inv => inv.contactId === entityFilterId);
        else if (viewBy === 'owner') {
          result = result.filter(inv => {
            const ownerId = inv.propertyId ? properties.find(p => p.id === inv.propertyId)?.ownerId : null;
            return ownerId === entityFilterId;
          });
        } else if (viewBy === 'property') result = result.filter(inv => inv.propertyId === entityFilterId);
        else if (viewBy === 'building') {
          result = result.filter(inv => {
            const bId = inv.buildingId || (inv.propertyId ? properties.find(p => p.id === inv.propertyId)?.buildingId : null);
            return bId === entityFilterId;
          });
        }
      }
      if (typeFilter !== 'All') {
        if (typeFilter === 'Rental') result = result.filter(inv => inv.invoiceType === InvoiceType.RENTAL);
        else if (typeFilter === 'Security Deposit') result = result.filter(inv => inv.invoiceType === InvoiceType.SECURITY_DEPOSIT);
      }
      if (dateFilter !== 'All') {
        const now = new Date();
        if (dateFilter === 'This Month') {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          result = result.filter(inv => {
            const d = new Date(inv.issueDate);
            return d >= start && d <= end;
          });
        } else if (dateFilter === 'Last Month') {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 0);
          result = result.filter(inv => {
            const d = new Date(inv.issueDate);
            return d >= start && d <= end;
          });
        }
      }
    } else {
      if (agingFilter !== 'all') {
        result = result.filter(inv => {
          if (inv.status === InvoiceStatus.PAID) return false;
          return isOverdueByAging(inv.dueDate, agingFilter);
        });
      }
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(inv => {
        if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
        const contact = contacts.find(c => c.id === inv.contactId);
        if (contact?.name?.toLowerCase().includes(q)) return true;
        if (inv.propertyId) {
          const prop = properties.find(p => p.id === inv.propertyId);
          if (prop?.name?.toLowerCase().includes(q)) return true;
          if (prop?.buildingId) {
            const bld = buildings.find(b => b.id === prop.buildingId);
            if (bld?.name?.toLowerCase().includes(q)) return true;
          }
        }
        const prop = inv.propertyId ? properties.find(p => p.id === inv.propertyId) : null;
        if (prop?.ownerId) {
          const owner = contacts.find(c => c.id === prop.ownerId);
          if (owner?.name?.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    return result;
  }, [rentalInvoices, listMode, statusFilter, entityFilterId, typeFilter, dateFilter, viewBy, agingFilter, debouncedSearch, contacts, properties, buildings]);

  // Summary stats for list mode: Rental vs Security breakdown + totals (for cards)
  // Use same Security vs Rental split as grid (Security = SECURITY_DEPOSIT type or securityDepositCharge or description has 'security')
  // Due = unpaid + partially unpaid (outstanding); Paid = paid + partially paid (amount received)
  const summaryStats = useMemo(() => {
    if (!listMode) return null;
    const invList = filteredInvoices;
    const isDue = (inv: Invoice) => inv.status !== InvoiceStatus.PAID;
    const dueAmount = (inv: Invoice) => Math.max(0, inv.amount - inv.paidAmount);
    const isPaidOrPartial = (inv: Invoice) => inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.PARTIALLY_PAID;

    const rentalInvs = invList.filter(inv => !isSecurityInvoice(inv));
    const securityInvs = invList.filter(inv => isSecurityInvoice(inv));

    const rentalDue = rentalInvs.filter(isDue);
    const rentalPaidOrPartial = rentalInvs.filter(isPaidOrPartial);
    const securityDue = securityInvs.filter(isDue);
    const securityPaidOrPartial = securityInvs.filter(isPaidOrPartial);

    const rentalDueAmount = rentalDue.reduce((s, i) => s + dueAmount(i), 0);
    const rentalPaidAmount = rentalPaidOrPartial.reduce((s, i) => s + i.paidAmount, 0);
    const securityDueAmount = securityDue.reduce((s, i) => s + dueAmount(i), 0);
    const securityPaidAmount = securityPaidOrPartial.reduce((s, i) => s + i.paidAmount, 0);

    return {
      rentalDueAmount,
      rentalPaidAmount,
      securityDueAmount,
      securityPaidAmount,
      totalDueAmount: rentalDueAmount + securityDueAmount,
      totalPaidAmount: rentalPaidAmount + securityPaidAmount,
      totalInvoiceCount: invList.length,
    };
  }, [listMode, filteredInvoices]);

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
      return properties.find(p => p.id === propertyId)?.buildingId || null;
    };

    const getPropertyOwnerId = (propertyId?: string) => {
      if (!propertyId) return null;
      return properties.find(p => p.id === propertyId)?.ownerId || null;
    };

    if (viewBy === 'building') {
      const grouped = new Map<string, Invoice[]>();
      for (const inv of filteredInvoices) {
        const buildingId = inv.buildingId || getPropertyBuildingId(inv.propertyId) || '__unassigned';
        if (!grouped.has(buildingId)) grouped.set(buildingId, []);
        grouped.get(buildingId)!.push(inv);
      }

      return Array.from(grouped.entries()).map(([buildingId, invs]) => {
        const building = buildings.find(b => b.id === buildingId);
        const stats = calcStats(invs);

        // Children: Properties within this building
        const propGrouped = new Map<string, Invoice[]>();
        for (const inv of invs) {
          const propId = inv.propertyId || '__unassigned';
          if (!propGrouped.has(propId)) propGrouped.set(propId, []);
          propGrouped.get(propId)!.push(inv);
        }

        const children: ARTreeNode[] = Array.from(propGrouped.entries()).map(([propId, propInvs]) => {
          const prop = properties.find(p => p.id === propId);
          const propStats = calcStats(propInvs);

          // Sub-children: Tenants within this property
          const tenantGrouped = new Map<string, Invoice[]>();
          for (const inv of propInvs) {
            if (!tenantGrouped.has(inv.contactId)) tenantGrouped.set(inv.contactId, []);
            tenantGrouped.get(inv.contactId)!.push(inv);
          }

          const tenantChildren: ARTreeNode[] = Array.from(tenantGrouped.entries()).map(([contactId, tInvs]) => {
            const contact = contacts.find(c => c.id === contactId);
            return {
              id: `tenant__${contactId}__${propId}`,
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
        const prop = properties.find(p => p.id === propId);
        const stats = calcStats(invs);

        const tenantGrouped = new Map<string, Invoice[]>();
        for (const inv of invs) {
          if (!tenantGrouped.has(inv.contactId)) tenantGrouped.set(inv.contactId, []);
          tenantGrouped.get(inv.contactId)!.push(inv);
        }

        const children: ARTreeNode[] = Array.from(tenantGrouped.entries()).map(([contactId, tInvs]) => {
          const contact = contacts.find(c => c.id === contactId);
            return {
              id: `tenant__${contactId}__${propId}`,
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
        const contact = contacts.find(c => c.id === contactId);
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
        const owner = contacts.find(c => c.id === ownerId);

        // Children: Buildings for this owner
        const buildingGrouped = new Map<string, Invoice[]>();
        for (const inv of invs) {
          const bId = inv.buildingId || getPropertyBuildingId(inv.propertyId) || '__unassigned';
          if (!buildingGrouped.has(bId)) buildingGrouped.set(bId, []);
          buildingGrouped.get(bId)!.push(inv);
        }

        const children: ARTreeNode[] = Array.from(buildingGrouped.entries()).map(([bId, bInvs]) => {
          const building = buildings.find(b => b.id === bId);

          const propGrouped = new Map<string, Invoice[]>();
          for (const inv of bInvs) {
            const pId = inv.propertyId || '__unassigned';
            if (!propGrouped.has(pId)) propGrouped.set(pId, []);
            propGrouped.get(pId)!.push(inv);
          }

          const propChildren: ARTreeNode[] = Array.from(propGrouped.entries()).map(([pId, pInvs]) => {
            const prop = properties.find(p => p.id === pId);

            const tenantGrouped = new Map<string, Invoice[]>();
            for (const inv of pInvs) {
              if (!tenantGrouped.has(inv.contactId)) tenantGrouped.set(inv.contactId, []);
              tenantGrouped.get(inv.contactId)!.push(inv);
            }

            const tenantChildren: ARTreeNode[] = Array.from(tenantGrouped.entries()).map(([cId, tInvs]) => {
              const contact = contacts.find(c => c.id === cId);
              return {
                id: `tenant__${cId}__${pId}__${bId}`,
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
  }, [filteredInvoices, viewBy, buildings, properties, contacts]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedNode(null);
  }, [viewBy, agingFilter, listMode, statusFilter, entityFilterId, typeFilter, dateFilter]);

  // Invoices for selected node
  const selectedNodeInvoices = useMemo(() => {
    if (!selectedNode) return filteredInvoices;

    const nodeId = selectedNode.id;

    return filteredInvoices.filter(inv => {
      const propBuildingId = inv.propertyId
        ? properties.find(p => p.id === inv.propertyId)?.buildingId
        : null;
      const propOwnerId = inv.propertyId
        ? properties.find(p => p.id === inv.propertyId)?.ownerId
        : null;

      // Handle compound tenant IDs (tenant__contactId__propId or tenant__contactId__propId__buildingId)
      // Use __ so UUIDs (with dashes) in contactId/propertyId parse correctly
      if (nodeId.startsWith('tenant__')) {
        const parts = nodeId.split('__');
        const contactId = parts[1];
        return contactId != null && inv.contactId === contactId;
      }
      // Legacy compound IDs (tenant-xxx-...) for backward compatibility
      if (nodeId.startsWith('tenant-')) {
        const after = nodeId.slice(7);
        const sep = after.indexOf('-');
        const contactId = sep >= 0 ? after.slice(0, sep) : after;
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
  }, [selectedNode, filteredInvoices, properties]);

  // When a tree node (building/owner/unit/tenant) is selected, show summary for that selection in the cards
  const displaySummaryStats = useMemo(() => {
    if (!summaryStats) return null;
    if (!selectedNode) return summaryStats;
    const invList = selectedNodeInvoices;
    const isDue = (inv: Invoice) => inv.status !== InvoiceStatus.PAID;
    const dueAmount = (inv: Invoice) => Math.max(0, inv.amount - inv.paidAmount);
    const isPaidOrPartial = (inv: Invoice) => inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.PARTIALLY_PAID;

    const rentalInvs = invList.filter(inv => !isSecurityInvoice(inv));
    const securityInvs = invList.filter(inv => isSecurityInvoice(inv));

    const rentalDue = rentalInvs.filter(isDue);
    const rentalPaidOrPartial = rentalInvs.filter(isPaidOrPartial);
    const securityDue = securityInvs.filter(isDue);
    const securityPaidOrPartial = securityInvs.filter(isPaidOrPartial);

    const rentalDueAmount = rentalDue.reduce((s, i) => s + dueAmount(i), 0);
    const rentalPaidAmount = rentalPaidOrPartial.reduce((s, i) => s + i.paidAmount, 0);
    const securityDueAmount = securityDue.reduce((s, i) => s + dueAmount(i), 0);
    const securityPaidAmount = securityPaidOrPartial.reduce((s, i) => s + i.paidAmount, 0);

    return {
      rentalDueAmount,
      rentalPaidAmount,
      securityDueAmount,
      securityPaidAmount,
      totalDueAmount: rentalDueAmount + securityDueAmount,
      totalPaidAmount: rentalPaidAmount + securityPaidAmount,
      totalInvoiceCount: invList.length,
    };
  }, [summaryStats, selectedNode, selectedNodeInvoices]);

  // List mode: build invoices + payments (FinancialRecord[]) for the selected node
  const contactsById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const invoicesById = useMemo(() => new Map(invoices.map(i => [i.id, i])), [invoices]);

  const financialRecords = useMemo((): FinancialRecord[] => {
    if (!listMode) return [];
    const invList = selectedNodeInvoices;
    const invoiceIdSet = new Set(invList.map(i => i.id));
    const records: FinancialRecord[] = [];

    for (const inv of invList) {
      records.push({
        id: inv.id,
        type: 'Invoice',
        reference: inv.invoiceNumber || '',
        date: inv.issueDate,
        accountName: contactsById.get(inv.contactId)?.name || 'Unknown',
        amount: inv.amount,
        remainingAmount: inv.amount - inv.paidAmount,
        raw: inv,
        status: inv.status,
      });
    }

    const batchGroups = new Map<string, Transaction[]>();
    const unbatchedTxs: Transaction[] = [];
    for (const tx of transactions) {
      if (tx.type !== TransactionType.INCOME) continue;
      if (!tx.invoiceId || !invoiceIdSet.has(tx.invoiceId)) continue;
      if (tx.batchId) {
        let group = batchGroups.get(tx.batchId);
        if (!group) { group = []; batchGroups.set(tx.batchId, group); }
        group.push(tx);
      } else {
        unbatchedTxs.push(tx);
      }
    }

    for (const [batchId, batchTxs] of batchGroups) {
      const totalAmount = batchTxs.reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount ?? 0))), 0);
      const firstTx = batchTxs[0];
      records.push({
        id: `batch-${batchId}`,
        type: 'Payment (Bulk)',
        reference: `${batchTxs.length} Items`,
        date: firstTx.date,
        accountName: accountsById.get(firstTx.accountId)?.name || 'Unknown',
        amount: totalAmount,
        remainingAmount: 0,
        raw: { ...firstTx, amount: totalAmount, children: batchTxs } as Transaction,
        status: 'Paid',
      });
    }

    for (const tx of unbatchedTxs) {
      records.push({
        id: tx.id,
        type: 'Payment',
        reference: invoicesById.get(tx.invoiceId!)?.invoiceNumber || '',
        date: tx.date,
        accountName: accountsById.get(tx.accountId)?.name || 'Unknown',
        amount: typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0)),
        remainingAmount: 0,
        raw: tx,
        status: 'Paid',
      });
    }

    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [listMode, selectedNodeInvoices, transactions, contactsById, accountsById, invoicesById]);

  const financialRecordsFiltered = useMemo(() => {
    if (recordTypeFilter === 'All') return financialRecords;
    if (recordTypeFilter === 'Invoices') return financialRecords.filter(r => r.type === 'Invoice');
    return financialRecords.filter(r => r.type.includes('Payment'));
  }, [financialRecords, recordTypeFilter]);

  // Sorted invoices for the list (summary mode table)
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
          const nameA = contacts.find(c => c.id === a.contactId)?.name || '';
          const nameB = contacts.find(c => c.id === b.contactId)?.name || '';
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
  }, [selectedNodeInvoices, invoiceSort, contacts]);

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

  // Invoice action handlers
  const handleInvoiceClick = useCallback((invoice: Invoice) => {
    setViewInvoice(invoice);
  }, []);

  const handleRecordPayment = useCallback((invoice: Invoice) => {
    setViewInvoice(null);
    setPaymentInvoice(invoice);
    setIsPaymentModalOpen(true);
  }, []);

  const handleDuplicateInvoice = useCallback(
    async (data: Partial<Invoice>) => {
      const agreed = await showConfirm(
        'A new invoice will open with a copy of the current details. You can change anything before saving.\n\nAfter you save the new invoice (or cancel), this invoice will no longer be open for editing.\n\nContinue?',
        { title: 'Duplicate invoice', confirmLabel: 'Continue', cancelLabel: 'Cancel' }
      );
      if (!agreed) return;
      const { id: _id, invoiceNumber: _num, paidAmount: _pa, status: _st, version: _ver, deletedAt: _del, ...rest } =
        data as Invoice;
      const inv = data as Invoice;
      setDuplicateInvoiceData({
        ...rest,
        invoiceType: inv.invoiceType,
        paidAmount: 0,
        status: InvoiceStatus.UNPAID,
      });
      setInvoiceToEdit(null);
    },
    [showConfirm]
  );

  const handleEditInvoice = useCallback((invoice: Invoice) => {
    setDuplicateInvoiceData(null);
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
    () => invoices.filter(inv => selectedInvoiceIds.has(inv.id)),
    [invoices, selectedInvoiceIds]
  );

  // Precomputed display names for table rows (avoids per-row lookups in render)
  const contactPropByInvoiceId = useMemo(() => {
    const map = new Map<string, { contactName: string; propertyName: string }>();
    for (const inv of sortedInvoices) {
      const contact = contacts.find(c => c.id === inv.contactId);
      const prop = inv.propertyId ? properties.find(p => p.id === inv.propertyId) : null;
      map.set(inv.id, {
        contactName: contact?.name || '—',
        propertyName: prop?.name || '—',
      });
    }
    return map;
  }, [sortedInvoices, contacts, properties]);

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

  const selectClass = 'ds-input-field px-2 py-1 text-xs cursor-pointer min-w-[100px]';
  const filterInputClass = 'ds-input-field pl-2.5 py-1.5 text-sm';

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* List mode: due generation banner */}
      {listMode && dueCount > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-ds-warning/10 border border-ds-warning/30 rounded-lg flex-shrink-0 mx-3 mt-2">
          <span className="text-sm font-medium text-ds-warning">
            {dueCount} invoice{dueCount > 1 ? 's are' : ' is'} due for generation
          </span>
          <div className="flex gap-2">
            <Button onClick={handleGenerateAllDue} disabled={isGenerating} size="sm" className="bg-ds-warning hover:opacity-95 text-white">
              {isGenerating ? 'Generating...' : `Generate All (${dueCount})`}
            </Button>
            {onSchedulesClick && (
              <Button variant="secondary" onClick={onSchedulesClick} size="sm">Manage Schedules</Button>
            )}
          </div>
        </div>
      )}

      {/* List mode: summary cards */}
      {listMode && displaySummaryStats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5 px-3 mt-2 flex-shrink-0">
          <div className="bg-app-card rounded-lg border border-app-border px-2.5 py-1.5 shadow-ds-card min-h-[72px] flex flex-col justify-center border-l-[3px] border-l-ds-danger">
            <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wide">Rental Due</p>
            <p className="text-sm font-bold text-ds-danger leading-tight mt-0.5">
              {CURRENCY} {displaySummaryStats.rentalDueAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-app-card rounded-lg border border-app-border px-2.5 py-1.5 shadow-ds-card min-h-[72px] flex flex-col justify-center border-l-[3px] border-l-ds-success">
            <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wide">Rental Paid</p>
            <p className="text-sm font-bold text-ds-success leading-tight mt-0.5">
              {CURRENCY} {displaySummaryStats.rentalPaidAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-app-card rounded-lg border border-app-border px-2.5 py-1.5 shadow-ds-card min-h-[72px] flex flex-col justify-center border-l-[3px] border-l-ds-danger">
            <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wide">Security Due</p>
            <p className="text-sm font-bold text-ds-danger leading-tight mt-0.5">
              {CURRENCY} {displaySummaryStats.securityDueAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-app-card rounded-lg border border-app-border px-2.5 py-1.5 shadow-ds-card min-h-[72px] flex flex-col justify-center border-l-[3px] border-l-ds-success">
            <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wide">Security Paid</p>
            <p className="text-sm font-bold text-ds-success leading-tight mt-0.5">
              {CURRENCY} {displaySummaryStats.securityPaidAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-app-card rounded-lg border border-primary/25 px-2.5 py-1.5 shadow-ds-card min-h-[72px] flex flex-col justify-center border-l-[3px] border-l-primary">
            <p className="text-sm font-bold text-ds-danger leading-tight">
              Total unpaid: {CURRENCY} {displaySummaryStats.totalDueAmount.toLocaleString()}
            </p>
            <p className="text-sm font-bold text-ds-success leading-tight mt-0.5">
              Total paid: {CURRENCY} {displaySummaryStats.totalPaidAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-app-card rounded-lg border border-app-border px-2.5 py-1.5 shadow-ds-card min-h-[72px] flex flex-col justify-center">
            <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wide">Total Invoices</p>
            <p className="text-sm font-bold text-app-text leading-tight mt-0.5">
              {displaySummaryStats.totalInvoiceCount} invoice{displaySummaryStats.totalInvoiceCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar: full (list mode) or compact (summary) */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-app-card border border-app-border flex-shrink-0 mt-2 mx-3 rounded-lg shadow-ds-card">
        {listMode ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {['All', InvoiceStatus.UNPAID, InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE].map(s => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === s ? 'bg-primary text-ds-on-primary' : 'bg-app-toolbar text-app-muted hover:bg-app-toolbar/80 hover:text-app-text'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-app-muted uppercase">View by:</span>
              {(['tenant', 'owner', 'property', 'building'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setViewBy(g); setEntityFilterId('all'); }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                    viewBy === g ? 'bg-primary text-ds-on-primary' : 'bg-app-toolbar text-app-muted hover:bg-app-toolbar/80 hover:text-app-text'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <select value={entityFilterId} onChange={e => setEntityFilterId(e.target.value)} className={filterInputClass} style={{ width: '180px' }} aria-label="Filter by entity">
              <option value="all">All {viewBy === 'tenant' ? 'Tenants' : viewBy === 'owner' ? 'Owners' : viewBy === 'property' ? 'Properties' : 'Buildings'}</option>
              {viewBy === 'tenant' && tenantsWithInvoices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              {viewBy === 'owner' && ownersWithInvoices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              {viewBy === 'property' && propertiesWithInvoices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              {viewBy === 'building' && buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={filterInputClass} style={{ width: '130px' }} aria-label="Filter by type">
              <option value="All">All</option>
              <option value="Rental">Rental</option>
              <option value="Security Deposit">Security Deposit</option>
            </select>
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className={filterInputClass} style={{ width: '130px' }} aria-label="Filter by date">
              <option value="All">All Dates</option>
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
            </select>
            <select value={recordTypeFilter} onChange={e => setRecordTypeFilter(e.target.value as 'All' | 'Invoices' | 'Payments')} className={filterInputClass} style={{ width: '140px' }} aria-label="Show Invoices, Payments, or All">
              <option value="All">All</option>
              <option value="Invoices">Invoices</option>
              <option value="Payments">Payments</option>
            </select>
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-app-muted"><div className="w-4 h-4">{ICONS.search}</div></div>
              <input
                type="text"
                placeholder="Search invoice #, tenant, property..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="ds-input-field pl-9 pr-3 py-1.5 w-full text-sm placeholder:text-app-muted"
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-semibold text-app-muted uppercase">View</label>
              <select value={viewBy} onChange={e => setViewBy(e.target.value as ViewBy)} className={selectClass} aria-label="View by">
                <option value="building">Building</option>
                <option value="property">Property</option>
                <option value="tenant">Tenant</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="w-px h-5 bg-app-border" />
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-semibold text-app-muted uppercase">Aging</label>
              <select value={agingFilter} onChange={e => setAgingFilter(e.target.value as AgingFilter)} className={selectClass} aria-label="Aging filter">
                <option value="all">All</option>
                <option value="overdue">Only Overdue</option>
                <option value="0-30">0–30 days</option>
                <option value="31-60">31–60 days</option>
                <option value="61-90">61–90 days</option>
                <option value="90+">90+ days</option>
              </select>
            </div>
            <div className="w-px h-5 bg-app-border" />
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-app-muted"><div className="w-3.5 h-3.5">{ICONS.search}</div></div>
              <input
                type="text"
                placeholder="Search tenant, invoice, unit, owner..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="ds-input-field pl-7 pr-2 py-1 w-full text-xs placeholder:text-app-muted"
              />
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {onCreateRentalClick && (
            <Button onClick={() => onCreateRentalClick(getPropertyIdFromNode(selectedNode))} size="sm" className="text-xs">
              <div className="w-3.5 h-3.5 mr-1">{ICONS.plus}</div>
              {listMode ? 'New Rental Invoice' : 'Invoice'}
            </Button>
          )}
          {onCreateSecurityClick && (
            <Button variant="secondary" onClick={() => onCreateSecurityClick(getPropertyIdFromNode(selectedNode))} size="sm" className="text-xs">
              {listMode ? 'New Security Deposit' : 'Security Dep.'}
            </Button>
          )}
          {selectedInvoiceIds.size > 0 && (
            <Button variant="secondary" onClick={() => setIsBulkPayModalOpen(true)} size="sm" className="text-xs">
              Bulk Pay ({selectedInvoiceIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Split Layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel: AR Tree */}
        <div
          className="flex-shrink-0 border-r border-app-border overflow-hidden hidden md:flex flex-col bg-app-card"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="px-2 py-1.5 bg-app-toolbar border-b border-app-border flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">
              Accounts Receivable
            </span>
            <span className="text-[10px] text-app-muted">
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
          className="w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors hidden md:block flex-shrink-0"
          onMouseDown={e => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />

        {/* Right Panel: Invoice List */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Panel Header */}
          <div className="px-3 py-1.5 bg-app-toolbar border-b border-app-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-app-text truncate">
                {selectedNode ? selectedNode.name : 'All Invoices'}
              </span>
              {selectedNode && (
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="text-[10px] text-app-muted hover:text-app-text px-1.5 py-0.5 rounded hover:bg-app-toolbar/80"
                >
                  Clear
                </button>
              )}
            </div>
            <span className="text-[10px] text-app-muted tabular-nums flex-shrink-0">
              {sortedInvoices.length} invoice{sortedInvoices.length !== 1 ? 's' : ''}
              {selectedNode && ` · ${CURRENCY} ${selectedNode.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} outstanding`}
            </span>
          </div>

          {/* Mobile: Tree selector dropdown */}
          <div className="md:hidden px-3 py-2 bg-app-card border-b border-app-border">
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
              className="ds-input-field w-full px-2 py-1.5 text-sm"
              aria-label="Select invoice node"
            >
              <option value="">All Invoices</option>
              {treeData.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </option>
              ))}
            </select>
          </div>

          {/* List mode: invoices + payments grid with edit/delete/pay/WhatsApp; else invoice-only table */}
          {listMode ? (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <RentalFinancialGrid
                records={financialRecordsFiltered}
                onInvoiceClick={handleInvoiceClick}
                onPaymentClick={(tx) => {
                  setViewInvoice(null);
                  setTransactionToEdit(tx);
                }}
                selectedIds={selectedInvoiceIds}
                onToggleSelect={toggleSelection}
                onEditInvoice={handleEditInvoice}
                onReceivePayment={handleRecordPayment}
                onEditPayment={(tx) => setTransactionToEdit(tx)}
                onDeletePayment={(tx) => setPaymentDeleteModal({ isOpen: true, transaction: tx })}
                typeFilter={typeFilter}
                dateFilter={dateFilter}
                onTypeFilterChange={setTypeFilter}
                onDateFilterChange={setDateFilter}
                hideTypeDateFiltersInToolbar
                onBulkPaymentClick={() => setIsBulkPayModalOpen(true)}
                selectedCount={selectedInvoiceIds.size}
                showButtons={false}
              />
            </div>
          ) : (
            <VirtualizedInvoiceTable
              sortedInvoices={sortedInvoices}
              contactPropByInvoiceId={contactPropByInvoiceId}
              selectedInvoiceIds={selectedInvoiceIds}
              onInvoiceClick={handleInvoiceClick}
              onToggleSelect={toggleSelection}
              getStatusColorClass={getStatusColorClass}
              selectAllChecked={selectedInvoiceIds.size > 0 && selectedInvoiceIds.size === sortedInvoices.length}
              onSelectAll={() => {
                if (selectedInvoiceIds.size === sortedInvoices.length) {
                  setSelectedInvoiceIds(new Set());
                } else {
                  setSelectedInvoiceIds(new Set(sortedInvoices.map(i => i.id)));
                }
              }}
              invoiceSort={invoiceSort}
              onSort={handleSortClick}
              emptyMessage={selectedNode ? 'No invoices for selected node' : 'No rental invoices found'}
            />
          )}

        </div>
      </div>

      {/* Detail Panel Sidebar */}
      {viewInvoice && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] max-w-full bg-app-card shadow-xl border-l border-app-border z-50 overflow-y-auto">
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

      {/* Edit / Duplicate Invoice Modal */}
      <Modal
        isOpen={!!invoiceToEdit || !!duplicateInvoiceData}
        onClose={() => {
          setInvoiceToEdit(null);
          setDuplicateInvoiceData(null);
        }}
        title={invoiceToEdit ? 'Edit Invoice' : 'Duplicate Invoice'}
        size="xl"
      >
        {(invoiceToEdit || duplicateInvoiceData) && (
          <InvoiceBillForm
            key={invoiceToEdit?.id ?? (duplicateInvoiceData ? `duplicate-${duplicateInvoiceData.invoiceType ?? 'inv'}` : 'new-invoice')}
            itemToEdit={invoiceToEdit || undefined}
            initialData={duplicateInvoiceData || undefined}
            invoiceTypeForNew={duplicateInvoiceData?.invoiceType ?? invoiceToEdit?.invoiceType}
            onClose={() => {
              setInvoiceToEdit(null);
              setDuplicateInvoiceData(null);
            }}
            type="invoice"
            onDuplicate={handleDuplicateInvoice}
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
