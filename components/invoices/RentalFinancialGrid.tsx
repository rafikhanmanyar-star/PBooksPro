import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { List } from 'react-window';
import { Invoice, Transaction, InvoiceType, Contact } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useAppContext } from '../../context/AppContext';
import { WhatsAppService } from '../../services/whatsappService';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';

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
}

interface RentalFinancialGridProps {
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
    onReceivePayment?: (invoice: Invoice) => void;
    onEditPayment?: (transaction: Transaction) => void;
    /** When set, type/date are controlled from parent and the two dropdowns are not shown in the toolbar */
    typeFilter?: string;
    dateFilter?: string;
    onTypeFilterChange?: (v: string) => void;
    onDateFilterChange?: (v: string) => void;
    hideTypeDateFiltersInToolbar?: boolean;
}

type SortKey = 'type' | 'reference' | 'date' | 'accountName' | 'amount' | 'remainingAmount' | 'description';

const RentalFinancialGrid: React.FC<RentalFinancialGridProps> = ({
    records, onInvoiceClick, onPaymentClick, selectedIds, onToggleSelect, onNewClick, onBulkImportClick,
    showButtons, onBulkPaymentClick, selectedCount, onEditInvoice, onReceivePayment, onEditPayment,
    typeFilter: typeFilterProp, dateFilter: dateFilterProp, onTypeFilterChange, onDateFilterChange, hideTypeDateFiltersInToolbar,
}) => {
    const { state } = useAppContext();
    const { showToast, showAlert } = useNotification();
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

    // Resizable Columns State
    const [colWidths, setColWidths] = useState({
        type: 90,
        reference: 100,
        description: 200,
        date: 90,
        accountName: 130,
        amount: 100,
        remainingAmount: 100
    });
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
            const { whatsAppTemplates } = state;
            const property = invoice.propertyId ? state.properties.find(p => p.id === invoice.propertyId) : null;
            const project = invoice.projectId ? state.projects.find(p => p.id === invoice.projectId) : null;
            const unit = invoice.unitId ? state.units.find(u => u.id === invoice.unitId) : null;

            let subject = property?.name || project?.name || 'your invoice';
            if (project && unit) {
                subject = `${project.name} - Unit ${unit.name}`;
            }
            const unitName = unit?.name || '';
            const hasMadePayment = invoice.paidAmount > 0;
            const balance = invoice.amount - invoice.paidAmount;

            let message = '';
            if (hasMadePayment) {
                message = WhatsAppService.generateInvoiceReceipt(
                    whatsAppTemplates.invoiceReceipt,
                    contact,
                    invoice.invoiceNumber,
                    invoice.paidAmount,
                    balance,
                    subject,
                    unitName
                );
            } else {
                message = WhatsAppService.generateInvoiceReminder(
                    whatsAppTemplates.invoiceReminder,
                    contact,
                    invoice.invoiceNumber,
                    invoice.amount,
                    invoice.dueDate ? formatDate(invoice.dueDate) : undefined,
                    subject,
                    unitName
                );
            }

            // Open WhatsApp modal with pre-filled message
            openChat(contact, contact.contactNo, message);
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    }, [state, showAlert, openChat]);

    // Available Types for Filter
    const availableTypes = useMemo(() => {
        const types = new Set(records.map(r => r.type));
        return ['All', ...Array.from(types)];
    }, [records]);

    const filteredRecords = useMemo(() => {
        let data = records;

        if (typeFilter !== 'All') {
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
    }, [records, typeFilter, dateFilter]);

    const sortedRecords = useMemo(() => {
        const sorted = [...filteredRecords];
        sorted.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            if (sortConfig.key === 'description') {
                aVal = (a.raw.description || '').toLowerCase();
                bVal = (b.raw.description || '').toLowerCase();
            } else {
                aVal = a[sortConfig.key];
                bVal = b[sortConfig.key];
            }

            if (sortConfig.key === 'date') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [filteredRecords, sortConfig]);

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

    const ROW_HEIGHT = 34;

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const startResizing = (key: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingCol.current = key;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingCol.current) return;
        const deltaX = e.movementX;
        setColWidths(prev => ({
            ...prev,
            [resizingCol.current!]: Math.max(50, (prev as any)[resizingCol.current!] + deltaX)
        }));
    }, []);

    const handleMouseUp = useCallback(() => {
        resizingCol.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, [handleMouseMove]);


    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[9px]">↕</span>;
        return <span className="text-accent ml-1 text-[9px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    // Helper for th style
    const thStyle = (widthKey: keyof typeof colWidths) => ({ width: colWidths[widthKey], position: 'relative' as const });

    // Reusable resizer
    const Resizer = ({ col }: { col: string }) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10"
            onMouseDown={startResizing(col)}
            onClick={e => e.stopPropagation()}
        ></div>
    );

    // Reusable Sidebar Styles from InvoicesPage context - applied to Select here
    const filterInputClass = "w-full pl-3 py-1.5 text-xs sm:text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white";


    const toolbarHasContent = !hideTypeDateFiltersInToolbar || (selectedCount > 0 && onBulkPaymentClick) || showButtons;

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Toolbar - only show when it has content (type/date filters, selected actions, or action buttons) */}
            {toolbarHasContent && (
            <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between backdrop-blur-sm">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    {!hideTypeDateFiltersInToolbar && (
                        <>
                            <Select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="!w-32 !py-1.5 !text-xs !border-slate-200 !shadow-sm !font-medium"
                                hideIcon={true}
                            >
                                {availableTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </Select>
                            <Select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="!w-32 !py-1.5 !text-xs !border-slate-200 !shadow-sm !font-medium"
                                hideIcon={true}
                            >
                                <option value="All">All Dates</option>
                                <option value="This Month">This Month</option>
                                <option value="Last Month">Last Month</option>
                            </Select>
                        </>
                    )}
                    {selectedCount > 0 && onBulkPaymentClick && (
                        <div className="flex items-center gap-2 animate-fade-in pl-2 border-l border-slate-200">
                            <span className="text-xs font-semibold text-slate-600">{selectedCount} selected</span>
                            <Button
                                onClick={onBulkPaymentClick}
                                size="sm"
                                className="!py-1 !px-3 !text-xs !bg-indigo-600 hover:!bg-indigo-700 !text-white !rounded-lg"
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
                                className="!py-1.5 !px-3 !text-xs !border-slate-200 hover:!border-indigo-300 hover:!text-indigo-600 !bg-white"
                            >
                                <div className="w-3.5 h-3.5 mr-1.5 opacity-70">{ICONS.download}</div> Import
                            </Button>
                            <Button
                                onClick={onNewClick}
                                size="sm"
                                className="!py-1.5 !px-3 !text-xs !bg-slate-900 hover:!bg-slate-800 !text-white !shadow-sm"
                            >
                                <div className="w-3.5 h-3.5 mr-1.5">{ICONS.plus}</div> Create
                            </Button>
                        </>
                    )}
                </div>
            </div>
            )}

            {/* Table Header */}
            <div className="bg-slate-50 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center" style={{ minWidth: 'max-content' }}>
                    <div className="px-3 py-1.5 w-10 text-center flex-shrink-0" />
                    <div style={thStyle('type')} onClick={() => handleSort('type')} className="group px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors flex-shrink-0">Type <SortIcon column="type" /><Resizer col="type" /></div>
                    <div style={thStyle('reference')} onClick={() => handleSort('reference')} className="group px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors flex-shrink-0">Reference <SortIcon column="reference" /><Resizer col="reference" /></div>
                    <div style={{ ...thStyle('description'), flex: 1, minWidth: colWidths.description }} onClick={() => handleSort('description')} className="group px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors">Description <SortIcon column="description" /><Resizer col="description" /></div>
                    <div style={thStyle('date')} onClick={() => handleSort('date')} className="group px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors flex-shrink-0">Date <SortIcon column="date" /><Resizer col="date" /></div>
                    <div style={thStyle('accountName')} onClick={() => handleSort('accountName')} className="group px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors flex-shrink-0">Account <SortIcon column="accountName" /><Resizer col="accountName" /></div>
                    <div style={thStyle('amount')} onClick={() => handleSort('amount')} className="group px-3 py-1.5 text-right text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors flex-shrink-0">Amount <SortIcon column="amount" /><Resizer col="amount" /></div>
                    <div style={thStyle('remainingAmount')} onClick={() => handleSort('remainingAmount')} className="group px-3 py-1.5 text-right text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors flex-shrink-0">Due <SortIcon column="remainingAmount" /><Resizer col="remainingAmount" /></div>
                    <div className="px-3 py-1.5 text-center text-[10px] uppercase font-bold tracking-wider text-slate-500 w-24 flex-shrink-0">Status</div>
                    <div className="px-3 py-1.5 text-center text-[10px] uppercase font-bold tracking-wider text-slate-500 w-20 flex-shrink-0">Actions</div>
                </div>
            </div>

            {/* Virtualized Table Body */}
            <div className="flex-grow min-h-0 bg-white" ref={listContainerRef}>
                {sortedRecords.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <div className="flex flex-col items-center justify-center opacity-60">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                <div className="w-6 h-6 text-slate-400">{ICONS.search}</div>
                            </div>
                            <p className="text-sm font-medium">No records found</p>
                            <p className="text-xs text-slate-400 mt-1">Try changing your filters</p>
                        </div>
                    </div>
                ) : (
                    <List
                        ref={listRef}
                        height={listHeight}
                        itemCount={sortedRecords.length}
                        itemSize={ROW_HEIGHT}
                        width="100%"
                        overscanCount={15}
                    >
                        {({ index, style }) => {
                            const record = sortedRecords[index];
                            const isPayment = record.type.includes('Payment');
                            const isBulk = record.type.includes('Bulk');
                            const isPaid = record.remainingAmount !== undefined && record.remainingAmount <= 0.01;
                            const canSelect = !isPayment && !isPaid;

                            const rawTx = record.raw as Transaction;
                            const hasChildren = isBulk && rawTx.children && rawTx.children.length > 0;
                            const isExpanded = expandedIds.has(record.id);
                            const description = record.raw.description || '-';

                            let statusBadge = null;
                            if (record.type === 'Invoice') {
                                const inv = record.raw as Invoice;
                                const remaining = inv.amount - inv.paidAmount;
                                const isFullPaid = remaining <= 0.01;
                                const isPartial = inv.paidAmount > 0.01 && !isFullPaid;

                                if (isFullPaid) {
                                    statusBadge = <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">PAID</span>;
                                } else if (isPartial) {
                                    statusBadge = <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">PARTIAL</span>;
                                } else {
                                    const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && remaining > 0;
                                    if (isOverdue) statusBadge = <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">OVERDUE</span>;
                                    else statusBadge = <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">UNPAID</span>;
                                }
                            }

                            let displayType: string = record.type;
                            let typeStyle = 'bg-slate-100 text-slate-600 border-slate-200';

                            if (record.type === 'Invoice') {
                                const inv = record.raw as Invoice;
                                const isSecurity = (inv.securityDepositCharge || 0) > 0 || (inv.description || '').toLowerCase().includes('security');

                                if (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT) {
                                    displayType = (inv.invoiceType === InvoiceType.SECURITY_DEPOSIT || isSecurity) ? 'Security' : 'Rent';
                                    typeStyle = (inv.invoiceType === InvoiceType.SECURITY_DEPOSIT || isSecurity)
                                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                                        : 'bg-sky-50 text-sky-700 border-sky-100';
                                } else if (inv.invoiceType === InvoiceType.INSTALLMENT) {
                                    displayType = 'Installment';
                                    typeStyle = 'bg-indigo-50 text-indigo-700 border-indigo-100';
                                }
                            } else if (isPayment) {
                                const descLower = description.toLowerCase();
                                if (descLower.includes('security')) { displayType = 'Sec Pmt'; typeStyle = 'bg-amber-50 text-amber-700 border-amber-100/50'; }
                                else if (descLower.includes('rent') || descLower.includes('rental')) { displayType = 'Rent Pmt'; typeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100/50'; }
                                else if (isBulk) { displayType = 'Bulk Pmt'; typeStyle = 'bg-purple-50 text-purple-700 border-purple-100/50'; }
                                else { displayType = 'Payment'; typeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100/50'; }
                            }

                            return (
                                <div
                                    style={style}
                                    className={`flex items-center cursor-pointer transition-colors group border-b border-slate-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-slate-100 ${isExpanded ? '!bg-indigo-50/30' : ''}`}
                                    onClick={() => {
                                        if (hasChildren) toggleExpand({ stopPropagation: () => {} } as any, record.id);
                                        else if (record.type === 'Invoice') onInvoiceClick(record.raw as Invoice);
                                        else onPaymentClick(record.raw as Transaction);
                                    }}
                                >
                                    <div className="px-3 py-1.5 text-center w-10 flex-shrink-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                        {hasChildren ? (
                                            <button onClick={(e) => toggleExpand(e, record.id)} className="p-0.5 rounded hover:bg-slate-200 text-slate-400 transition-colors">
                                                <div className={`w-3 h-3 transform transition-transform duration-200 ${isExpanded ? 'rotate-90 text-indigo-500' : ''}`}>{ICONS.chevronRight}</div>
                                            </button>
                                        ) : canSelect && onToggleSelect ? (
                                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-3.5 h-3.5 cursor-pointer transition-all" checked={selectedIds?.has(record.id)} onChange={() => onToggleSelect(record.id)} />
                                        ) : null}
                                    </div>
                                    <div className="px-3 py-1.5 whitespace-nowrap flex-shrink-0" style={{ width: colWidths.type }}>
                                        <span className={`inline-flex px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-tight border ${typeStyle}`}>{displayType}</span>
                                    </div>
                                    <div className="px-3 py-1.5 font-mono text-xs font-medium text-slate-700 group-hover:text-indigo-600 whitespace-nowrap overflow-hidden text-ellipsis tabular-nums transition-colors flex-shrink-0" style={{ width: colWidths.reference }}>{record.reference}</div>
                                    <div className="px-3 py-1.5 text-xs text-slate-600 truncate overflow-hidden text-ellipsis" style={{ flex: 1, minWidth: colWidths.description }} title={description}>{description}</div>
                                    <div className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis flex-shrink-0" style={{ width: colWidths.date }}>{formatDate(record.date)}</div>
                                    <div className="px-3 py-1.5 text-xs text-slate-700 font-medium truncate overflow-hidden text-ellipsis flex-shrink-0" style={{ width: colWidths.accountName }} title={record.accountName}>{record.accountName}</div>
                                    <div className={`px-3 py-1.5 text-right text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis tabular-nums flex-shrink-0 ${isPayment ? 'text-emerald-600' : 'text-slate-700'}`} style={{ width: colWidths.amount }}>
                                        {CURRENCY} {record.amount.toLocaleString()}
                                    </div>
                                    <div className="px-3 py-1.5 text-right text-xs whitespace-nowrap overflow-hidden text-ellipsis tabular-nums font-medium flex-shrink-0" style={{ width: colWidths.remainingAmount }}>
                                        {record.remainingAmount !== undefined && record.remainingAmount > 0.01 ? (
                                            <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{CURRENCY} {record.remainingAmount.toLocaleString()}</span>
                                        ) : (
                                            <span className="text-slate-300 font-normal">-</span>
                                        )}
                                    </div>
                                    <div className="px-3 py-1.5 text-center whitespace-nowrap w-24 flex-shrink-0">{statusBadge}</div>
                                    <div className="px-3 py-1.5 text-center w-20 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                        {record.type === 'Invoice' && (() => {
                                            const inv = record.raw as Invoice;
                                            const contact = state.contacts.find(c => c.id === inv.contactId);
                                            const isFullyPaid = inv.status === 'Paid' || (inv.amount - inv.paidAmount) <= 0.01;
                                            return (
                                                <div className="flex items-center justify-center gap-1">
                                                    {!isFullyPaid && onReceivePayment && (
                                                        <button onClick={(e) => { e.stopPropagation(); onReceivePayment(inv); }} className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors" title="Receive Payment">
                                                            <div className="w-4 h-4">{ICONS.handDollar}</div>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={async (e) => { e.stopPropagation(); if (!contact?.contactNo) { showAlert("Contact does not have a phone number saved."); return; } await handleSendWhatsApp(inv, contact); }}
                                                        className={`p-1.5 rounded-md transition-colors ${contact?.contactNo ? 'text-green-600 hover:bg-green-50 hover:text-green-700' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-400'}`}
                                                        title={contact?.contactNo ? "Send invoice via WhatsApp" : "No contact number available"}
                                                    >
                                                        <div className="w-4 h-4">{ICONS.whatsapp}</div>
                                                    </button>
                                                    {onEditInvoice && (
                                                        <button onClick={(e) => { e.stopPropagation(); onEditInvoice(inv); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors" title="Edit Invoice">
                                                            <div className="w-4 h-4">{ICONS.edit}</div>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {record.type === 'Payment' && !isBulk && onEditPayment && (
                                            <button onClick={(e) => { e.stopPropagation(); onEditPayment(record.raw as Transaction); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors" title="Edit Payment">
                                                <div className="w-4 h-4">{ICONS.edit}</div>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        }}
                    </List>
                )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-3 py-1.5 border-t border-slate-200 bg-slate-50/80 backdrop-blur-sm flex items-center justify-between">
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                    {sortedRecords.length} records
                </div>
            </div>
        </div>
    );
};

export default RentalFinancialGrid;