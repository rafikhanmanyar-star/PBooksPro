import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Invoice, Transaction, InvoiceType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Select from '../ui/Select';
import Button from '../ui/Button';

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
    // Add these new props
    onNewClick?: () => void;
    onBulkImportClick?: () => void;
    showButtons?: boolean;
}

type SortKey = 'type' | 'reference' | 'date' | 'accountName' | 'amount' | 'remainingAmount' | 'description';

const RentalFinancialGrid: React.FC<RentalFinancialGridProps> = ({ records, onInvoiceClick, onPaymentClick, selectedIds, onToggleSelect, onNewClick, onBulkImportClick, showButtons }) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // Filter State
    const [typeFilter, setTypeFilter] = useState<string>('All');
    const [dateFilter, setDateFilter] = useState<string>('All');

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
        // Reset page on filter/sort change
        setCurrentPage(1);
        
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
    
    const paginatedRecords = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedRecords.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedRecords, currentPage]);

    const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);

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


    return (
        <div className="overflow-hidden border rounded-lg bg-white shadow-sm h-full flex flex-col">
            {/* Filter Bar */}
            <div className="p-2 sm:p-3 bg-slate-50 border-b border-slate-200 flex gap-2 sm:gap-3 items-center flex-wrap flex-shrink-0">
                <div className="w-32 sm:w-40">
                    <Select 
                        value={typeFilter} 
                        onChange={(e) => setTypeFilter(e.target.value)} 
                        className={filterInputClass}
                        hideIcon={true}
                    >
                        {availableTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </Select>
                </div>
                <div className="w-32 sm:w-40">
                    <Select 
                        value={dateFilter} 
                        onChange={(e) => setDateFilter(e.target.value)} 
                        className={filterInputClass}
                        hideIcon={true}
                    >
                        <option value="All">All Dates</option>
                        <option value="This Month">This Month</option>
                        <option value="Last Month">Last Month</option>
                    </Select>
                </div>
                
                {/* Add buttons here */}
                {showButtons && (
                    <>
                        <Button
                            variant="secondary"
                            onClick={onBulkImportClick}
                            size="sm"
                            className="ml-auto"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.download}</div> Bulk Import
                        </Button>
                        <Button 
                            onClick={onNewClick}
                            size="sm"
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New
                        </Button>
                    </>
                )}
            </div>

            {/* Make table area scrollable and take remaining space */}
            <div className="overflow-auto flex-grow min-h-0">
                <table className="min-w-full divide-y divide-slate-200 text-sm relative border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-2 sm:px-4 py-2 sm:py-3 w-8 sm:w-10 bg-slate-50 border-b border-slate-200"></th>
                            <th style={thStyle('type')} onClick={() => handleSort('type')} className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap border-b border-slate-200">Type <SortIcon column="type"/><Resizer col="type"/></th>
                            <th style={thStyle('reference')} onClick={() => handleSort('reference')} className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap border-b border-slate-200">No <SortIcon column="reference"/><Resizer col="reference"/></th>
                            <th style={thStyle('description')} onClick={() => handleSort('description')} className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap border-b border-slate-200">Description <SortIcon column="description"/><Resizer col="description"/></th>
                            <th style={thStyle('date')} onClick={() => handleSort('date')} className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap border-b border-slate-200">Date <SortIcon column="date"/><Resizer col="date"/></th>
                            <th style={thStyle('accountName')} onClick={() => handleSort('accountName')} className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap border-b border-slate-200">Account <SortIcon column="accountName"/><Resizer col="accountName"/></th>
                            <th style={thStyle('amount')} onClick={() => handleSort('amount')} className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap border-b border-slate-200">Amount <SortIcon column="amount"/><Resizer col="amount"/></th>
                            <th style={thStyle('remainingAmount')} onClick={() => handleSort('remainingAmount')} className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap border-b border-slate-200">Due <SortIcon column="remainingAmount"/><Resizer col="remainingAmount"/></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {paginatedRecords.map(record => {
                            const isPayment = record.type.includes('Payment');
                            const isBulk = record.type.includes('Bulk');
                            const isPaid = record.remainingAmount !== undefined && record.remainingAmount <= 0.01;
                            const canSelect = !isPayment && !isPaid;
                            
                            const rawTx = record.raw as Transaction;
                            const hasChildren = isBulk && rawTx.children && rawTx.children.length > 0;
                            const isExpanded = expandedIds.has(record.id);
                            const description = record.raw.description || '-';

                            let displayType: string = record.type;
                            let typeClasses = 'bg-slate-100 text-slate-600 border-slate-200';

                            if (record.type === 'Invoice') {
                                const inv = record.raw as Invoice;
                                const isSecurity = (inv.securityDepositCharge || 0) > 0 || (inv.description || '').toLowerCase().includes('security');
                                
                                if (inv.invoiceType === InvoiceType.RENTAL) {
                                    displayType = isSecurity ? 'Security' : 'Rent';
                                    typeClasses = isSecurity 
                                        ? 'bg-amber-100 text-amber-800 border-amber-200' 
                                        : 'bg-sky-100 text-sky-700 border-sky-200';
                                } else if (inv.invoiceType === InvoiceType.INSTALLMENT) {
                                    displayType = 'Installment';
                                    typeClasses = 'bg-indigo-100 text-indigo-700 border-indigo-200';
                                }
                            } else if (isPayment) {
                                const descLower = description.toLowerCase();
                                if (descLower.includes('security')) {
                                    displayType = 'Sec Pmt';
                                    typeClasses = 'bg-amber-50 text-amber-700 border-amber-200';
                                } else if (descLower.includes('rent') || descLower.includes('rental')) {
                                    displayType = 'Rent Pmt';
                                    typeClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                } else if (isBulk) {
                                    displayType = 'Bulk Pmt';
                                    typeClasses = 'bg-purple-100 text-purple-700 border-purple-200';
                                } else {
                                    displayType = 'Payment';
                                    typeClasses = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                }
                            }

                            return (
                                <React.Fragment key={`${record.type}-${record.id}`}>
                                    <tr 
                                        onClick={() => {
                                            if (hasChildren) toggleExpand({ stopPropagation: () => {} } as any, record.id);
                                            else if (record.type === 'Invoice') onInvoiceClick(record.raw as Invoice);
                                            else onPaymentClick(record.raw as Transaction);
                                        }}
                                        className={`cursor-pointer transition-colors group border-b border-slate-100 last:border-0 ${
                                            isExpanded ? 'bg-indigo-50/50' : isPayment ? 'bg-emerald-50/40 hover:bg-emerald-100/50' : 'bg-white hover:bg-indigo-50/30'
                                        }`}
                                    >
                                        <td className="px-2 sm:px-4 py-2.5 text-center w-8 sm:w-10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                            {hasChildren ? (
                                                <button onClick={(e) => toggleExpand(e, record.id)} className="p-1 rounded hover:bg-slate-200 text-slate-400">
                                                    <div className={`w-3 h-3 sm:w-4 sm:h-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{ICONS.chevronRight}</div>
                                                </button>
                                            ) : canSelect && onToggleSelect && (
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded text-accent focus:ring-accent w-4 h-4 border-gray-300 cursor-pointer"
                                                    checked={selectedIds?.has(record.id)}
                                                    onChange={() => onToggleSelect(record.id)}
                                                />
                                            )}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${typeClasses}`}>
                                                {displayType}
                                            </span>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2.5 font-medium text-slate-800 group-hover:text-indigo-700 whitespace-nowrap overflow-hidden text-ellipsis tabular-nums">{record.reference}</td>
                                        <td className="px-2 sm:px-4 py-2.5 text-slate-600 truncate max-w-xs overflow-hidden text-ellipsis" title={description}>{description}</td>
                                        <td className="px-2 sm:px-4 py-2.5 text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis">{formatDate(record.date)}</td>
                                        <td className="px-2 sm:px-4 py-2.5 text-slate-600 truncate overflow-hidden text-ellipsis" title={record.accountName}>{record.accountName}</td>
                                        <td className={`px-2 sm:px-4 py-2.5 text-right font-bold whitespace-nowrap overflow-hidden text-ellipsis tabular-nums ${isPayment ? 'text-emerald-700' : 'text-slate-700'}`}>
                                            {CURRENCY} {record.amount.toLocaleString()}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2.5 text-right whitespace-nowrap overflow-hidden text-ellipsis tabular-nums">
                                            {record.remainingAmount !== undefined && record.remainingAmount > 0 ? (
                                                <span className="text-rose-600 font-bold">{CURRENCY} {record.remainingAmount.toLocaleString()}</span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && hasChildren && (
                                        <tr className="bg-slate-50/50">
                                            <td colSpan={8} className="p-0">
                                                <div className="border-l-4 border-indigo-200 ml-6 sm:ml-8 my-2 pl-2 sm:pl-4 py-2 space-y-2">
                                                    {rawTx.children!.map((child, idx) => (
                                                        <div key={child.id} className="flex items-center text-xs text-slate-600 hover:bg-slate-100 p-1 rounded cursor-pointer" onClick={() => onPaymentClick(child)}>
                                                            <div className="w-20 sm:w-24 flex-shrink-0">{formatDate(child.date)}</div>
                                                            <div className="flex-grow truncate font-medium text-slate-700">{child.description}</div>
                                                            <div className="w-24 sm:w-32 text-right font-mono text-emerald-600 tabular-nums">{CURRENCY} {child.amount.toLocaleString()}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                         {sortedRecords.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center py-8 sm:py-12 text-slate-500">
                                    No records found for selected filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {/* Pagination Footer */}
            <div className="p-2 sm:p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                 <div className="text-xs text-slate-500">
                    Showing {paginatedRecords.length} / {sortedRecords.length}
                 </div>
                 <div className="flex items-center gap-1 sm:gap-2">
                     <button 
                         onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                         disabled={currentPage === 1}
                         className="p-1 rounded hover:bg-slate-200 disabled:opacity-50"
                     >
                         {ICONS.chevronLeft}
                     </button>
                     <span className="text-sm font-medium text-slate-700">
                         {currentPage}
                     </span>
                     <button 
                         onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                         disabled={currentPage === totalPages || totalPages === 0}
                         className="p-1 rounded hover:bg-slate-200 disabled:opacity-50"
                     >
                         {ICONS.chevronRight}
                     </button>
                 </div>
            </div>
        </div>
    );
};

export default RentalFinancialGrid;