import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { List } from 'react-window';
import { Invoice, Transaction, InvoiceType, Contact } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useContacts, useProperties, useBuildings, useProjects, useUnits, useStateSelector } from '../../hooks/useSelectiveState';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import TreeExpandCollapseControls from '../ui/TreeExpandCollapseControls';

/** Extended transaction with optional invoice number for bulk payment child rows */
type TransactionWithInvoiceRef = Transaction & { invoiceNumber?: string };

export interface FinancialRecord {
    id: string;
    type: 'Invoice' | 'Payment' | 'Payment (Bulk)';
    reference: string;
    date: string;
    accountName: string;
    amount: number;
    remainingAmount?: number;
    raw: Invoice | Transaction;
    status?: string;
    /** True when this row is a child of an expanded bulk payment (invoice + amount detail) */
    isBulkChild?: boolean;
    /** Parent bulk record id when isBulkChild is true */
    parentBulkId?: string;
}

interface ProjectFinancialGridProps {
    records: FinancialRecord[];
    onInvoiceClick: (invoice: Invoice) => void;
    onPaymentClick: (transaction: Transaction) => void;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    onNewClick?: () => void;
    onBulkImportClick?: () => void;
    showButtons?: boolean;
    onBulkPaymentClick?: () => void;
    selectedCount?: number;
    onEditInvoice?: (invoice: Invoice) => void;
    onDeleteInvoice?: (invoice: Invoice) => void;
    onReceivePayment?: (invoice: Invoice) => void;
    onEditPayment?: (transaction: Transaction) => void;
    onDeletePayment?: (transaction: Transaction) => void;
    /** When set, type/date are controlled from parent and the two dropdowns are not shown in the toolbar */
    typeFilter?: string;
    dateFilter?: string;
    onTypeFilterChange?: (v: string) => void;
    onDateFilterChange?: (v: string) => void;
    hideTypeDateFiltersInToolbar?: boolean;
    /** Project Selling (installment): All = everything; Invoices = invoice rows only; Payment = single + bulk payments */
    invoicePaymentTypeFilter?: boolean;
}

type SortKey = 'type' | 'reference' | 'date' | 'accountName' | 'projectName' | 'unitName' | 'amount' | 'remainingAmount' | 'description';

const ProjectFinancialGrid: React.FC<ProjectFinancialGridProps> = ({
    records, onInvoiceClick, onPaymentClick, selectedIds, onToggleSelect, onNewClick, onBulkImportClick,
    showButtons, onBulkPaymentClick, selectedCount, onEditInvoice, onDeleteInvoice, onReceivePayment, onEditPayment, onDeletePayment,
    typeFilter: typeFilterProp, dateFilter: dateFilterProp, onTypeFilterChange, onDateFilterChange, hideTypeDateFiltersInToolbar,
    invoicePaymentTypeFilter = false,
}) => {
    const contacts = useContacts();
    const properties = useProperties();
    const buildings = useBuildings();
    const projects = useProjects();
    const units = useUnits();
    const whatsAppTemplates = useStateSelector(s => s.whatsAppTemplates);
    const whatsAppMode = useStateSelector(s => s.whatsAppMode);
    const { showToast, showAlert } = useNotification();

    const projectAgreements = useStateSelector(s => s.projectAgreements);
    const invoices = useStateSelector(s => s.invoices);

    const contactsById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
    const propertiesById = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties]);
    const buildingsById = useMemo(() => new Map(buildings.map(b => [b.id, b])), [buildings]);
    const projectsById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
    const unitsById = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);
    const agreementsById = useMemo(() => new Map(projectAgreements.map(a => [a.id, a])), [projectAgreements]);
    const invoicesById = useMemo(() => new Map(invoices.map(i => [i.id, i])), [invoices]);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const listContainerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<any>(null);
    const [listHeight, setListHeight] = useState(400);

    // Filter State (internal when not controlled)
    const [internalTypeFilter, setInternalTypeFilter] = useState<string>('All');
    const [internalDateFilter, setInternalDateFilter] = useState<string>('All');
    const typeFilter = typeFilterProp ?? internalTypeFilter;
    const dateFilter = dateFilterProp ?? internalDateFilter;
    const setTypeFilter = onTypeFilterChange ?? setInternalTypeFilter;
    const setDateFilter = onDateFilterChange ?? setInternalDateFilter;

    // Resizable columns — defaults sized to fit ~1280px main pane; shrinkable cols use flex-shrink in row
    const [colWidths, setColWidths] = useState({
        type: 96,
        reference: 128,
        description: 120,
        date: 88,
        accountName: 76,
        project: 72,
        unit: 56,
        amount: 104,
        remainingAmount: 104
    });
    const colMinWidths: Record<keyof typeof colWidths, number> = {
        type: 72,
        reference: 88,
        description: 64,
        date: 80,
        accountName: 52,
        project: 48,
        unit: 40,
        amount: 92,
        remainingAmount: 92
    };
    const resizingCol = useRef<string | null>(null);

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const { openChat } = useWhatsApp();

    const handleSendWhatsApp = useCallback((invoice: Invoice, contact: Contact) => {
        if (!contact?.contactNo) {
            showAlert("Contact does not have a phone number saved.");
            return;
        }

        try {
            const property = invoice.propertyId ? properties.find(p => p.id === invoice.propertyId) : null;
            const project = invoice.projectId ? projects.find(p => p.id === invoice.projectId) : null;
            const unit = invoice.unitId ? units.find(u => u.id === invoice.unitId) : null;

            let subject = property?.name || project?.name || 'your invoice';
            if (project && unit) {
                subject = `${project.name} - Unit ${unit.name}`;
            }
            const unitName = unit?.name || '';
            const hasMadePayment = invoice.paidAmount > 0;
            const balance = invoice.amount - invoice.paidAmount;

            const templates = whatsAppTemplates || { invoiceReceipt: '', invoiceReminder: '' };
            let message = '';
            if (hasMadePayment) {
                message = WhatsAppService.generateInvoiceReceipt(
                    templates.invoiceReceipt,
                    contact,
                    invoice.invoiceNumber,
                    invoice.paidAmount,
                    balance,
                    subject,
                    unitName
                );
            } else {
                message = WhatsAppService.generateInvoiceReminder(
                    templates.invoiceReminder,
                    contact,
                    invoice.invoiceNumber,
                    invoice.amount,
                    invoice.dueDate ? formatDate(invoice.dueDate) : undefined,
                    subject,
                    unitName
                );
            }

            sendOrOpenWhatsApp(
                { contact, message, phoneNumber: contact.contactNo },
                () => whatsAppMode,
                openChat
            );
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    }, [whatsAppTemplates, whatsAppMode, properties, projects, units, showAlert, openChat]);

    const handleSendWhatsAppForPayment = useCallback((tx: Transaction, contact: Contact) => {
        if (!contact?.contactNo) {
            showAlert("Contact does not have a phone number saved.");
            return Promise.resolve();
        }
        const amountStr = `${CURRENCY} ${Math.abs(tx.amount).toLocaleString()}`;
        const dateStr = formatDate(tx.date);
        const message = `Payment of ${amountStr} received on ${dateStr}. Thank you.`;
        sendOrOpenWhatsApp(
            { contact, message, phoneNumber: contact.contactNo },
            () => whatsAppMode,
            openChat
        );
        return Promise.resolve();
    }, [showAlert, openChat, whatsAppMode]);

    /** Type dropdown: Project Selling uses All / Invoices / Payment; other contexts use dynamic types from data */
    const typeFilterOptions = useMemo(() => {
        if (invoicePaymentTypeFilter) {
            return ['All', 'Invoices', 'Payment'] as const;
        }
        const types = new Set(records.map(r => r.type));
        return ['All', ...Array.from(types)];
    }, [records, invoicePaymentTypeFilter]);

    // Total outstanding amount of selected invoice records (for bulk payment)
    const selectedTotalAmount = useMemo(() => {
        if (!selectedIds?.size) return 0;
        return records
            .filter(r => r.type === 'Invoice' && selectedIds.has(r.id))
            .reduce((sum, r) => sum + (r.remainingAmount ?? r.amount ?? 0), 0);
    }, [records, selectedIds]);

    const filteredRecords = useMemo(() => {
        let data = records;

        if (invoicePaymentTypeFilter) {
            if (typeFilter === 'Invoices') {
                data = data.filter(r => r.type === 'Invoice');
            } else if (typeFilter === 'Payment') {
                data = data.filter(r => r.type === 'Payment' || r.type === 'Payment (Bulk)');
            }
        } else if (typeFilter !== 'All') {
            data = data.filter(r => r.type === typeFilter);
        }

        if (dateFilter !== 'All') {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();

            data = data.filter(r => {
                const d = new Date(r.date);
                const dYear = d.getFullYear();
                const dMonth = d.getMonth();

                if (dateFilter === 'This Month') {
                    return dYear === currentYear && dMonth === currentMonth;
                }
                if (dateFilter === 'Last Month') {
                    // Handle year rollover for last month
                    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
                    return dYear === lastMonthDate.getFullYear() && dMonth === lastMonthDate.getMonth();
                }
                return true;
            });
        }

        return data;
    }, [records, typeFilter, dateFilter, invoicePaymentTypeFilter]);

    /** Resolve project and unit names from an invoice for display/sort (project selling) */
    const getInvoiceContextNames = useCallback((inv: Invoice) => {
        let projectId = inv.projectId;
        let unitId = inv.unitId;

        // Fallback: resolve from linked project agreement
        if ((!projectId || !unitId) && inv.agreementId) {
            const agreement = agreementsById.get(inv.agreementId);
            if (agreement) {
                if (!projectId) projectId = agreement.projectId;
                if (!unitId && agreement.unitIds?.length > 0) unitId = agreement.unitIds[0];
            }
        }
        // Fallback: resolve projectId from unit
        if (!projectId && unitId) {
            const unit = unitsById.get(unitId);
            if (unit?.projectId) projectId = unit.projectId;
        }

        const project = projectId ? projectsById.get(projectId) : null;
        const unit = unitId ? unitsById.get(unitId) : null;
        return {
            projectName: project?.name ?? '',
            unitName: unit?.name ?? '',
        };
    }, [projectsById, unitsById, agreementsById]);

    const sortedRecords = useMemo(() => {
        const sorted = [...filteredRecords];
        sorted.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            if (sortConfig.key === 'description') {
                aVal = (a.raw.description || '').toLowerCase();
                bVal = (b.raw.description || '').toLowerCase();
            } else if (sortConfig.key === 'projectName' || sortConfig.key === 'unitName') {
                const key = sortConfig.key;
                if (a.raw && 'invoiceNumber' in a.raw) {
                    const aNames = getInvoiceContextNames(a.raw as Invoice);
                    aVal = (aNames[key as keyof typeof aNames] || '').toLowerCase();
                } else aVal = '';
                if (b.raw && 'invoiceNumber' in b.raw) {
                    const bNames = getInvoiceContextNames(b.raw as Invoice);
                    bVal = (bNames[key as keyof typeof bNames] || '').toLowerCase();
                } else bVal = '';
            } else {
                aVal = a[sortConfig.key];
                bVal = b[sortConfig.key];
            }

            if (sortConfig.key === 'date') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = (typeof bVal === 'string' ? bVal : '').toLowerCase();
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [filteredRecords, sortConfig, getInvoiceContextNames]);

    const bulkExpandableRecordIds = useMemo(
        () =>
            sortedRecords
                .filter(r => {
                    if (r.type !== 'Payment (Bulk)') return false;
                    const rawTx = r.raw as Transaction & { children?: unknown[] };
                    return (rawTx.children?.length ?? 0) > 0;
                })
                .map(r => r.id),
        [sortedRecords]
    );

    const handleExpandAllBulk = useCallback(() => {
        setExpandedIds(new Set(bulkExpandableRecordIds));
    }, [bulkExpandableRecordIds]);

    const handleCollapseAllBulk = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    /** Flatten list: when a bulk payment row is expanded, insert child rows (invoice + amount) after it */
    const effectiveRecords = useMemo(() => {
        const out: FinancialRecord[] = [];
        for (const record of sortedRecords) {
            out.push(record);
            const isBulk = record.type === 'Payment (Bulk)';
            const rawTx = record.raw as Transaction & { children?: TransactionWithInvoiceRef[] };
            const expanded = expandedIds.has(record.id);
            if (isBulk && expanded && rawTx.children && rawTx.children.length > 0) {
                for (const child of rawTx.children) {
                    const childWithRef = child as TransactionWithInvoiceRef;
                    out.push({
                        id: `bulk-child-${record.id}-${child.id}`,
                        type: 'Payment',
                        reference: childWithRef.invoiceNumber ? `Invoice #${childWithRef.invoiceNumber}` : child.id,
                        date: record.date,
                        accountName: record.accountName,
                        amount: child.amount,
                        remainingAmount: 0,
                        raw: child,
                        status: 'Paid',
                        isBulkChild: true,
                        parentBulkId: record.id
                    });
                }
            }
        }
        return out;
    }, [sortedRecords, expandedIds]);

    useEffect(() => {
        if (!listContainerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setListHeight(entry.contentRect.height);
            }
        });
        ro.observe(listContainerRef.current);
        return () => ro.disconnect();
    }, []);

    const ROW_HEIGHT = 40;

    const Row = ({ index, style }: { index: number; style: React.CSSProperties; ariaAttributes?: any }) => {
        const record = effectiveRecords[index];
        if (!record) return <div style={style} />;
        const isPayment = record.type.includes('Payment');
        const isBulk = record.type.includes('Bulk');
        const isBulkChild = record.isBulkChild === true;
        const isPaid = record.remainingAmount !== undefined && record.remainingAmount <= 0.01;
        const canSelect = !isPayment && !isPaid && !isBulkChild;

        const rawTx = record.raw as Transaction;
        const hasChildren = isBulk && !isBulkChild && rawTx.children && rawTx.children.length > 0;
        const isExpanded = expandedIds.has(record.id);
        const description = record.raw.description || '-';

        let statusBadge = null;
        if (record.type === 'Invoice') {
            const inv = record.raw as Invoice;
            // Match Due column: use ledger-based remainingAmount when parent set it (InvoicesPage / effPaid).
            const remaining =
                record.remainingAmount !== undefined
                    ? Math.max(0, record.remainingAmount)
                    : inv.amount - (inv.paidAmount || 0);
            const effectivePaid = inv.amount - remaining;
            const isFullPaid = remaining <= 0.01;
            const isPartial = effectivePaid > 0.01 && !isFullPaid;

            if (isFullPaid) {
                statusBadge = <span className="ds-badge-paid">Paid</span>;
            } else if (isPartial) {
                statusBadge = <span className="ds-badge-partial">Partial</span>;
            } else {
                const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && remaining > 0;
                if (isOverdue) statusBadge = <span className="ds-badge-overdue">Overdue</span>;
                else statusBadge = <span className="ds-badge-unpaid">Unpaid</span>;
            }
        }

        let displayType: string = record.type;
        let typeClass = 'ds-pill-type';

        if (record.type === 'Invoice') {
            const inv = record.raw as Invoice;
            const isSecurity = (inv.securityDepositCharge || 0) > 0 || (inv.description || '').toLowerCase().includes('security');

            if (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT) {
                displayType = (inv.invoiceType === InvoiceType.SECURITY_DEPOSIT || isSecurity) ? 'Security' : 'Rent';
                typeClass = (inv.invoiceType === InvoiceType.SECURITY_DEPOSIT || isSecurity)
                    ? 'ds-pill-type ds-pill-type-security'
                    : 'ds-pill-type ds-pill-type-rent';
            } else if (inv.invoiceType === InvoiceType.INSTALLMENT) {
                displayType = 'Installment';
                typeClass = 'ds-pill-type ds-pill-type-installment';
            }
        } else if (isPayment) {
            const tx = record.raw as Transaction;
            const linkedInvoice = tx.invoiceId ? invoicesById.get(tx.invoiceId) : null;

            if (linkedInvoice) {
                const isSecurityPayment =
                    linkedInvoice.invoiceType === InvoiceType.SECURITY_DEPOSIT
                    || (linkedInvoice.description || '').toLowerCase().includes('security')
                    || (linkedInvoice.securityDepositCharge || 0) >= linkedInvoice.amount;

                if (isSecurityPayment) {
                    displayType = 'Sec Pmt'; typeClass = 'ds-pill-type ds-pill-type-security';
                } else {
                    const descLower = description.toLowerCase();
                    if (descLower.includes('security')) { displayType = 'Sec Pmt'; typeClass = 'ds-pill-type ds-pill-type-security'; }
                    else { displayType = 'Rent Pmt'; typeClass = 'ds-pill-type ds-pill-type-payment'; }
                }
            } else {
                const descLower = description.toLowerCase();
                if (descLower.includes('security')) { displayType = 'Sec Pmt'; typeClass = 'ds-pill-type ds-pill-type-security'; }
                else if (descLower.includes('rent') || descLower.includes('rental')) { displayType = 'Rent Pmt'; typeClass = 'ds-pill-type ds-pill-type-payment'; }
                else if (isBulk) { displayType = 'Bulk Pmt'; typeClass = 'ds-pill-type ds-pill-type-bulk'; }
                else { displayType = 'Payment'; typeClass = 'ds-pill-type ds-pill-type-payment'; }
            }
        }

        const handleRowClick = () => {
            if (isBulkChild) return;
            if (hasChildren) {
                toggleExpand({ stopPropagation: () => {} } as any, record.id);
                return;
            }
            if (record.type === 'Invoice') {
                if (canSelect && onToggleSelect) {
                    onToggleSelect(record.id);
                } else {
                    onInvoiceClick(record.raw as Invoice);
                }
            } else {
                onPaymentClick(record.raw as Transaction);
            }
        };

        const handleRowDoubleClick = () => {
            if (isBulkChild) return;
            if (record.type === 'Invoice') onInvoiceClick(record.raw as Invoice);
            else if (!hasChildren) onPaymentClick(record.raw as Transaction);
        };

        const rowSelected = selectedIds?.has(record.id) === true;
        const rowStripe = index % 2 === 1;

        return (
            <div
                style={style}
                className={`ds-fin-row flex items-center min-w-0 group duration-ds ${rowStripe ? 'ds-fin-row-stripe' : ''} ${rowSelected ? 'ds-fin-row-selected' : ''} ${isBulkChild ? 'ds-fin-row-child' : 'cursor-pointer'} ${isExpanded && hasChildren ? 'ds-fin-row-expanded' : ''}`}
                onClick={handleRowClick}
                onDoubleClick={handleRowDoubleClick}
            >
                <div className="px-2 py-2 sm:px-3 text-center min-w-[5.25rem] flex-shrink-0 overflow-hidden" style={isBulkChild ? { paddingLeft: 24 } : undefined} onClick={(e) => e.stopPropagation()}>
                    {hasChildren ? (
                        <button type="button" onClick={(e) => toggleExpand(e, record.id)} className="p-0.5 rounded-md hover:bg-app-toolbar text-app-muted transition-colors duration-ds">
                            <div className={`w-3 h-3 transform transition-transform duration-200 ${isExpanded ? 'rotate-90 text-primary' : ''}`}>{ICONS.chevronRight}</div>
                        </button>
                    ) : canSelect && onToggleSelect ? (
                        <input type="checkbox" className="rounded text-primary focus:ring-primary border-app-border w-3.5 h-3.5 cursor-pointer transition-all" checked={selectedIds?.has(record.id)} onChange={() => onToggleSelect(record.id)} aria-label="Select row" title="Select row" />
                    ) : isBulkChild ? (
                        <span className="text-app-muted text-xs">↳</span>
                    ) : null}
                </div>
                <div className="px-3 py-2 sm:px-4 whitespace-nowrap flex-shrink-0" style={{ width: colWidths.type }}>
                    <span className={typeClass}>{isBulkChild ? 'Pmt' : displayType}</span>
                </div>
                <div className="px-3 py-2 sm:px-4 font-mono text-xs font-medium text-app-text group-hover:text-primary whitespace-nowrap overflow-hidden text-ellipsis tabular-nums transition-colors duration-ds min-w-0 shrink" style={{ width: colWidths.reference, minWidth: colMinWidths.reference }} title={record.reference}>{record.reference}</div>
                <div className="px-3 py-2 sm:px-4 text-xs text-app-muted truncate overflow-hidden text-ellipsis min-w-0" style={{ flex: '1 1 0%', minWidth: 0 }} title={description}>{isBulkChild ? '—' : description}</div>
                <div className="px-3 py-2 sm:px-4 text-xs text-app-muted whitespace-nowrap overflow-hidden text-ellipsis flex-shrink-0" style={{ width: colWidths.date }}>{formatDate(record.date)}</div>
                <div className="px-3 py-2 sm:px-4 text-xs text-app-text font-medium truncate overflow-hidden text-ellipsis min-w-0 shrink" style={{ width: colWidths.accountName, minWidth: colMinWidths.accountName }} title={record.accountName}>{record.accountName}</div>
                {record.type === 'Invoice' && !isBulkChild ? (() => {
                    const names = getInvoiceContextNames(record.raw as Invoice);
                    return (
                        <>
                            <div className="px-3 py-2 sm:px-4 text-xs text-app-muted truncate overflow-hidden text-ellipsis min-w-0 shrink" style={{ width: colWidths.project, minWidth: colMinWidths.project }} title={names.projectName}>{names.projectName || '—'}</div>
                            <div className="px-3 py-2 sm:px-4 text-xs text-app-muted truncate overflow-hidden text-ellipsis min-w-0 shrink" style={{ width: colWidths.unit, minWidth: colMinWidths.unit }} title={names.unitName}>{names.unitName || '—'}</div>
                        </>
                    );
                })() : (
                    <>
                        <div className="px-3 py-2 sm:px-4 text-xs text-app-muted min-w-0 shrink" style={{ width: colWidths.project, minWidth: colMinWidths.project }}>—</div>
                        <div className="px-3 py-2 sm:px-4 text-xs text-app-muted min-w-0 shrink" style={{ width: colWidths.unit, minWidth: colMinWidths.unit }}>—</div>
                    </>
                )}
                <div className={`px-3 py-2 sm:px-4 text-right text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis tabular-nums flex-shrink-0 ${isPayment ? 'text-ds-success' : 'text-app-text'}`} style={{ width: colWidths.amount }}>
                    {CURRENCY} {record.amount.toLocaleString()}
                </div>
                <div className="px-3 py-2 sm:px-4 text-right text-xs whitespace-nowrap overflow-hidden text-ellipsis tabular-nums font-medium flex-shrink-0" style={{ width: colWidths.remainingAmount }}>
                    {record.remainingAmount !== undefined && record.remainingAmount > 0.01 ? (
                        <span className="text-ds-danger bg-[color:var(--badge-unpaid-bg)] px-1.5 py-0.5 rounded-md">{CURRENCY} {record.remainingAmount.toLocaleString()}</span>
                    ) : (
                        <span className="text-app-muted font-normal">-</span>
                    )}
                </div>
                    <div className="px-2 py-2 text-center whitespace-nowrap w-20 flex-shrink-0">{statusBadge}</div>
                <div className="ds-fin-actions px-2 py-1.5 flex items-center justify-end gap-1.5 flex-shrink-0 w-[88px] bg-transparent" onClick={(e) => e.stopPropagation()}>
                    {record.type === 'Invoice' && (() => {
                        const inv = record.raw as Invoice;
                        const contact = contactsById.get(inv.contactId || '');
                        const isFullyPaid =
                            record.remainingAmount !== undefined
                                ? record.remainingAmount <= 0.01
                                : inv.status === 'Paid' || (inv.amount - (inv.paidAmount || 0)) <= 0.01;
                        return (
                            <span className="inline-flex items-center gap-1.5">
                                {!isFullyPaid && onReceivePayment && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); onReceivePayment(inv); }} className="p-0.5 text-primary hover:opacity-80 transition-opacity duration-ds" title="Receive Payment">{ICONS.handDollar && <span className="w-4 h-4 block">{ICONS.handDollar}</span>}</button>
                                )}
                                <button type="button" onClick={async (e) => { e.stopPropagation(); if (!contact?.contactNo) { showAlert("Contact does not have a phone number saved."); return; } await handleSendWhatsApp(inv, contact); }} className={`p-0.5 transition-opacity duration-ds ${contact?.contactNo ? 'text-ds-success hover:opacity-80' : 'text-app-muted cursor-default'}`} title={contact?.contactNo ? "WhatsApp" : "No number"}>{ICONS.whatsapp && <span className="w-4 h-4 block">{ICONS.whatsapp}</span>}</button>
                                {onEditInvoice && <button type="button" onClick={(e) => { e.stopPropagation(); onEditInvoice(inv); }} className="p-0.5 text-ds-success hover:opacity-80 transition-opacity duration-ds" title="Edit">{ICONS.edit && <span className="w-4 h-4 block">{ICONS.edit}</span>}</button>}
                                {onDeleteInvoice && <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteInvoice(inv); }} className="p-0.5 text-ds-danger hover:opacity-80 transition-opacity duration-ds" title="Delete">{ICONS.trash && <span className="w-4 h-4 block">{ICONS.trash}</span>}</button>}
                            </span>
                        );
                    })()}
                    {isBulk && !isBulkChild && onDeletePayment && (() => {
                        const rawTx = record.raw as Transaction & { batchId?: string; children?: Transaction[] };
                        return (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onDeletePayment(rawTx); }} className="p-0.5 text-ds-danger hover:opacity-80 transition-opacity duration-ds" title="Reverse bulk payment">
                                {ICONS.trash && <span className="w-4 h-4 block">{ICONS.trash}</span>}
                            </button>
                        );
                    })()}
                    {isBulkChild && onEditPayment && onDeletePayment && (() => {
                        const childTx = record.raw as Transaction;
                        const paymentContact = contactsById.get(childTx.contactId || '');
                        return (
                            <span className="inline-flex items-center gap-1.5">
                                <button type="button" onClick={async (e) => { e.stopPropagation(); if (!paymentContact?.contactNo) { showAlert("Contact does not have a phone number saved."); return; } await handleSendWhatsAppForPayment(childTx, paymentContact); }} className={`p-0.5 transition-opacity duration-ds ${paymentContact?.contactNo ? 'text-ds-success hover:opacity-80' : 'text-app-muted cursor-default'}`} title="WhatsApp">{ICONS.whatsapp && <span className="w-4 h-4 block">{ICONS.whatsapp}</span>}</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); onEditPayment(childTx); }} className="p-0.5 text-ds-success hover:opacity-80 transition-opacity duration-ds" title="Edit">{ICONS.edit && <span className="w-4 h-4 block">{ICONS.edit}</span>}</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); onDeletePayment(childTx); }} className="p-0.5 text-ds-danger hover:opacity-80 transition-opacity duration-ds" title="Delete">{ICONS.trash && <span className="w-4 h-4 block">{ICONS.trash}</span>}</button>
                            </span>
                        );
                    })()}
                    {record.type === 'Payment' && !isBulk && !isBulkChild && (() => {
                        const tx = record.raw as Transaction;
                        const paymentContact = contactsById.get(tx.contactId || '');
                        return (
                            <span className="inline-flex items-center gap-1.5">
                                <button type="button" onClick={async (e) => { e.stopPropagation(); if (!paymentContact?.contactNo) { showAlert("Contact does not have a phone number saved."); return; } await handleSendWhatsAppForPayment(tx, paymentContact); }} className={`p-0.5 transition-opacity duration-ds ${paymentContact?.contactNo ? 'text-ds-success hover:opacity-80' : 'text-app-muted cursor-default'}`} title="WhatsApp">{ICONS.whatsapp && <span className="w-4 h-4 block">{ICONS.whatsapp}</span>}</button>
                                {onEditPayment && <button type="button" onClick={(e) => { e.stopPropagation(); onEditPayment(tx); }} className="p-0.5 text-ds-success hover:opacity-80 transition-opacity duration-ds" title="Edit">{ICONS.edit && <span className="w-4 h-4 block">{ICONS.edit}</span>}</button>}
                                {onDeletePayment && <button type="button" onClick={(e) => { e.stopPropagation(); onDeletePayment(tx); }} className="p-0.5 text-ds-danger hover:opacity-80 transition-opacity duration-ds" title="Delete">{ICONS.trash && <span className="w-4 h-4 block">{ICONS.trash}</span>}</button>}
                            </span>
                        );
                    })()}
                </div>
            </div>
        );
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingCol.current) return;
        const key = resizingCol.current as keyof typeof colWidths;
        const deltaX = e.movementX;
        const minW = colMinWidths[key] ?? 50;
        setColWidths(prev => ({
            ...prev,
            [key]: Math.max(minW, (prev as any)[key] + deltaX)
        }));
    }, []);

    const handleMouseUp = useCallback(() => {
        resizingCol.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('blur', handleMouseUp);
        document.removeEventListener('visibilitychange', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, [handleMouseMove]);

    const startResizing = (key: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingCol.current = key;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('blur', handleMouseUp);
        document.addEventListener('visibilitychange', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const sortIcon = (column: SortKey) => {
        if (sortConfig.key !== column) return <span className="text-app-muted opacity-50 ml-1 text-[9px]">↕</span>;
        return <span className="text-primary ml-1 text-[9px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const thStyle = (widthKey: keyof typeof colWidths) => {
        const base: React.CSSProperties = { position: 'relative' as const };
        if (widthKey === 'description') {
            return { ...base, flex: '1 1 0%', minWidth: 0 };
        }
        const minW = colMinWidths[widthKey];
        const canShrink = (['reference', 'accountName', 'project', 'unit'] as const).includes(widthKey as any);
        return { ...base, width: colWidths[widthKey], minWidth: minW, flexShrink: canShrink ? 1 : 0 };
    };

    const resizer = (col: string) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/60 z-10"
            onMouseDown={startResizing(col)}
            onClick={e => e.stopPropagation()}
        ></div>
    );

    const toolbarHasContent = !hideTypeDateFiltersInToolbar || (selectedCount > 0 && onBulkPaymentClick) || showButtons;

    return (
        <div className="flex flex-col h-full bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden min-w-0 transition-shadow duration-ds">
            {toolbarHasContent && (
            <div className="p-3 bg-app-toolbar border-b border-app-border flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    {!hideTypeDateFiltersInToolbar && (
                        <>
                            <Select
                                value={(typeFilterOptions as readonly string[]).includes(typeFilter) ? typeFilter : 'All'}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className={`${invoicePaymentTypeFilter ? '!w-36' : '!w-32'} !py-1.5 !text-xs !border-app-border !bg-app-surface-2 !text-app-text !font-medium`}
                                hideIcon={true}
                            >
                                {typeFilterOptions.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </Select>
                            <Select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="!w-32 !py-1.5 !text-xs !border-app-border !bg-app-surface-2 !text-app-text !font-medium"
                                hideIcon={true}
                            >
                                <option value="All">All Dates</option>
                                <option value="This Month">This Month</option>
                                <option value="Last Month">Last Month</option>
                            </Select>
                        </>
                    )}
                    {selectedCount > 0 && onBulkPaymentClick && (
                        <div className="flex items-center gap-2 animate-fade-in pl-2 border-l border-app-border">
                            <span className="text-xs font-semibold text-app-muted">{selectedCount} selected</span>
                            <span className="text-xs font-bold text-app-text tabular-nums">{CURRENCY} {selectedTotalAmount.toLocaleString()} total</span>
                            <Button
                                onClick={onBulkPaymentClick}
                                size="sm"
                                className="!py-1 !px-3 !text-xs !bg-primary hover:!bg-ds-primary-hover !text-white !rounded-lg"
                            >
                                Receive Payment
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {showButtons && (
                        <>
                            <Button
                                variant="secondary"
                                onClick={onBulkImportClick}
                                size="sm"
                                className="!py-1.5 !px-3 !text-xs !border-app-border hover:!border-primary hover:!text-primary !bg-app-card"
                            >
                                <div className="w-3.5 h-3.5 mr-1.5 opacity-70">{ICONS.download}</div> Import
                            </Button>
                            <Button
                                onClick={onNewClick}
                                size="sm"
                                className="!py-1.5 !px-3 !text-xs !bg-primary hover:!bg-ds-primary-hover !text-ds-on-primary !shadow-sm"
                            >
                                <div className="w-3.5 h-3.5 mr-1.5">{ICONS.plus}</div> Create
                            </Button>
                        </>
                    )}
                </div>
            </div>
            )}

            {/* Single horizontal scroll: List uses overflow-x hidden so only this wrapper shows an x-scrollbar */}
            <div className="flex-1 min-h-0 flex flex-col overflow-x-auto overflow-y-hidden min-w-0">
            {/* Table Header — sticky within horizontal scroll region */}
            <div className="sticky top-0 z-10 bg-app-table-header border-b border-app-border flex-shrink-0 w-full min-w-0">
                <div className="flex items-center w-full min-w-0">
                    <div className="px-1 py-1.5 min-w-[5.25rem] flex-shrink-0 flex flex-col items-center justify-center gap-0.5 border-r border-app-border/40">
                        <TreeExpandCollapseControls
                            variant="app"
                            compact
                            allExpandableIds={bulkExpandableRecordIds}
                            expandedIds={expandedIds}
                            onExpandAll={handleExpandAllBulk}
                            onCollapseAll={handleCollapseAllBulk}
                            visible={bulkExpandableRecordIds.length > 0}
                        />
                    </div>
                    <div style={thStyle('type')} onClick={() => handleSort('type')} className="group px-3 py-2 sm:px-4 text-left text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds flex-shrink-0">Type {sortIcon('type')}{resizer('type')}</div>
                    <div style={thStyle('reference')} onClick={() => handleSort('reference')} className="group px-3 py-2 sm:px-4 text-left text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds min-w-0">Reference {sortIcon('reference')}{resizer('reference')}</div>
                    <div style={thStyle('description')} onClick={() => handleSort('description')} className="group px-3 py-2 sm:px-4 text-left text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds min-w-0">Description {sortIcon('description')}{resizer('description')}</div>
                    <div style={thStyle('date')} onClick={() => handleSort('date')} className="group px-3 py-2 sm:px-4 text-left text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds flex-shrink-0">Date {sortIcon('date')}{resizer('date')}</div>
                    <div style={thStyle('accountName')} onClick={() => handleSort('accountName')} className="group px-3 py-2 sm:px-4 text-left text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds min-w-0">Account {sortIcon('accountName')}{resizer('accountName')}</div>
                    <div style={thStyle('project')} onClick={() => handleSort('projectName')} className="group px-3 py-2 sm:px-4 text-left text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds min-w-0">Project {sortIcon('projectName')}{resizer('project')}</div>
                    <div style={thStyle('unit')} onClick={() => handleSort('unitName')} className="group px-3 py-2 sm:px-4 text-left text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds min-w-0">Unit {sortIcon('unitName')}{resizer('unit')}</div>
                    <div style={thStyle('amount')} onClick={() => handleSort('amount')} className="group px-3 py-2 sm:px-4 text-right text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds flex-shrink-0">Amount {sortIcon('amount')}{resizer('amount')}</div>
                    <div style={thStyle('remainingAmount')} onClick={() => handleSort('remainingAmount')} className="group px-3 py-2 sm:px-4 text-right text-[10px] uppercase font-bold tracking-wider text-app-muted cursor-pointer select-none hover:bg-app-toolbar transition-colors duration-ds flex-shrink-0">Due {sortIcon('remainingAmount')}{resizer('remainingAmount')}</div>
                    <div className="px-2 py-2 text-center text-[10px] uppercase font-bold tracking-wider text-app-muted w-20 flex-shrink-0">Status</div>
                    <div className="px-2 py-2 text-right text-[10px] uppercase font-bold tracking-wider text-app-muted w-[88px] flex-shrink-0">Actions</div>
                </div>
            </div>

            {/* Virtualized Table Body */}
            <div className="flex-grow min-h-0 bg-app-card overflow-hidden w-full min-w-0" ref={listContainerRef}>
                {sortedRecords.length === 0 ? (
                    <div className="text-center py-16 text-app-muted">
                        <div className="flex flex-col items-center justify-center opacity-70">
                            <div className="w-12 h-12 bg-app-toolbar rounded-full flex items-center justify-center mb-3 border border-app-border">
                                <div className="w-6 h-6 text-app-muted">{ICONS.search}</div>
                            </div>
                            <p className="text-sm font-medium text-app-text">No records found</p>
                            <p className="text-xs text-app-muted mt-1">Try changing your filters</p>
                        </div>
                    </div>
                ) : (
                    <List<Record<string, never>>
                        listRef={listRef as any}
                        defaultHeight={listHeight}
                        rowCount={effectiveRecords.length}
                        rowHeight={ROW_HEIGHT}
                        rowComponent={Row}
                        rowProps={{}}
                        style={{ height: listHeight, overflowX: 'hidden', overflowY: 'auto' }}
                        overscanCount={15}
                    />
                )}
            </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-3 py-1.5 border-t border-app-border bg-app-toolbar flex items-center justify-between">
                <div className="text-[10px] font-medium text-app-muted uppercase tracking-wide">
                    {effectiveRecords.length} records
                </div>
            </div>
        </div>
    );
};

export default ProjectFinancialGrid;
