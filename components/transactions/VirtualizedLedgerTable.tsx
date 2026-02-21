import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { List } from 'react-window';
import { useAppContext } from '../../context/AppContext';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { Transaction, TransactionType, LedgerSortKey as SortKey, SortDirection } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Button from '../ui/Button';

interface VirtualizedLedgerTableProps {
    groups: {
        key: string;
        title: string;
        transactions: Array<Transaction & { balance?: number }>;
    }[];
    sortConfig: { key: SortKey; direction: SortDirection };
    onSort: (key: SortKey) => void;
    onRowClick: (transaction: Transaction) => void;
    expandedRowIds: Set<string>;
    onToggleExpand: (id: string) => void;
    showGrouping: boolean;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoading?: boolean;
}

const ROW_HEIGHT = 34; // Compact row height
const GROUP_HEADER_HEIGHT = 38; // Compact group header height

interface FlatRow {
    type: 'transaction' | 'group-header' | 'child';
    data: Transaction & { balance?: number };
    groupTitle?: string;
    groupKey?: string;
    isChild?: boolean;
    parentId?: string;
    indexInGroup?: number;
    totalInGroup?: number;
}

const VirtualizedLedgerTable: React.FC<VirtualizedLedgerTableProps> = ({
    groups,
    sortConfig,
    onSort,
    onRowClick,
    expandedRowIds,
    onToggleExpand,
    showGrouping,
    onLoadMore,
    hasMore = false,
    isLoading = false
}) => {
    const lookupMaps = useLookupMaps();
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ height: 600, width: 1200 });

    // Flatten groups into a single list for virtualization
    const flatRows = useMemo(() => {
        const rows: FlatRow[] = [];
        if (!groups || !Array.isArray(groups)) return rows;

        groups.forEach((group) => {
            if (!group || !group.transactions || !Array.isArray(group.transactions)) return;

            if (showGrouping) {
                rows.push({
                    type: 'group-header',
                    data: group.transactions[0] || {} as Transaction,
                    groupTitle: group.title,
                    groupKey: group.key,
                    totalInGroup: group.transactions.length
                });
            }

            group.transactions.forEach((tx, idx) => {
                if (!tx) return;
                rows.push({
                    type: 'transaction',
                    data: tx,
                    indexInGroup: idx,
                    totalInGroup: group.transactions.length
                });

                if (expandedRowIds.has(tx.id) && tx.children && tx.children.length > 0) {
                    tx.children.forEach((child) => {
                        rows.push({
                            type: 'child',
                            data: child,
                            isChild: true,
                            parentId: tx.id
                        });
                    });
                }
            });
        });
        return rows;
    }, [groups, expandedRowIds, showGrouping]);

    // Note: With react-window v2, dynamic row heights are handled automatically
    // when using a function for rowHeight prop

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setDimensions({
                    height: Math.max(rect.height - 40, 400),
                    width: rect.width || 1200
                });
            }
        };

        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) observer.observe(containerRef.current);
        updateDimensions();
        // Trigger a second update after a short delay to handle any late layouts
        const timer = setTimeout(updateDimensions, 100);
        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, []);

    // Handle Infinite Scroll
    const handleRowsRendered = useCallback(({ stopIndex }: { startIndex: number; stopIndex: number }) => {
        if (onLoadMore && hasMore && !isLoading && stopIndex >= flatRows.length - 10) {
            onLoadMore();
        }
    }, [onLoadMore, hasMore, isLoading, flatRows.length]);

    const getAccountName = useCallback((id?: string) =>
        lookupMaps.accounts.get(id || '')?.name || '-', [lookupMaps]);

    const getCategoryName = useCallback((id?: string) =>
        lookupMaps.categories.get(id || '')?.name || '-', [lookupMaps]);

    const getContactName = useCallback((id?: string) =>
        lookupMaps.contacts.get(id || '')?.name || '-', [lookupMaps]);

    const SortIndicator = ({ column }: { column: SortKey }) => {
        const isActive = sortConfig.key === column;
        return (
            <div className={`ml-1 transition-opacity ${isActive ? 'text-indigo-600 opacity-100' : 'text-slate-300 opacity-50'}`}>
                {isActive ? (sortConfig.direction === 'asc' ? ICONS.arrowUp : ICONS.arrowDown) : ICONS.arrowUpDown}
            </div>
        );
    };

    const Row = ({ index, style, ariaAttributes }: { index: number; style: React.CSSProperties; ariaAttributes?: any }) => {
        const row = flatRows[index];
        if (!row) return null;

        if (row.type === 'group-header') {
            const group = groups.find(g => g.key === row.groupKey);
            const summary = group?.transactions.reduce(
                (acc, tx) => {
                    if (tx.type === TransactionType.INCOME) acc.in += tx.amount;
                    else if (tx.type === TransactionType.EXPENSE) acc.out += tx.amount;
                    return acc;
                },
                { in: 0, out: 0 }
            ) || { in: 0, out: 0 };

            return (
                <div style={style} className="flex items-center px-4 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{row.groupTitle}</span>
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {row.totalInGroup} RECORDS
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold tabular-nums">
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] text-slate-400 leading-none mb-0.5 uppercase">IN</span>
                            <span className="text-emerald-600">+{CURRENCY}{summary.in.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] text-slate-400 leading-none mb-0.5 uppercase">OUT</span>
                            <span className="text-rose-600">-{CURRENCY}{summary.out.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end border-l border-slate-200 pl-4 ml-2">
                            <span className="text-[8px] text-slate-400 leading-none mb-0.5 uppercase">NET</span>
                            <span className={summary.in - summary.out >= 0 ? 'text-slate-700' : 'text-rose-600'}>
                                {CURRENCY}{(summary.in - summary.out).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            );
        }

        const tx = row.data;
        const isIncome = tx.type === TransactionType.INCOME;
        const isExpense = tx.type === TransactionType.EXPENSE;
        const isChild = row.type === 'child';
        const isExpanded = expandedRowIds.has(tx.id);

        return (
            <div
                style={style}
                className={`flex items-center group cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition-colors ${isChild ? 'bg-slate-50/50' : 'bg-white'}`}
                onClick={() => !isChild && onRowClick(tx)}
            >
                <div className="w-[85px] flex-shrink-0 px-3 text-[11px] text-slate-500 font-mono py-1 border-r border-slate-100 bg-inherit uppercase">
                    {formatDate(tx.date)}
                </div>

                <div className="w-[80px] flex-shrink-0 px-3 py-1">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${isIncome ? 'text-emerald-700 bg-emerald-50 border-emerald-100' :
                        isExpense ? 'text-rose-700 bg-rose-50 border-rose-100' :
                            'text-indigo-700 bg-indigo-50 border-indigo-100'
                        }`}>
                        {tx.type.substring(0, 3)}
                    </span>
                </div>

                <div className="flex-1 min-w-0 px-3 flex items-center gap-2 py-1">
                    {!isChild && tx.children && tx.children.length > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleExpand(tx.id); }}
                            className={`p-0.5 rounded hover:bg-slate-200 transition-colors ${isExpanded ? 'rotate-90 text-indigo-600' : 'text-slate-400'}`}
                        >
                            {ICONS.chevronRight}
                        </button>
                    )}
                    <span className={`text-[11px] font-semibold truncate ${isChild ? 'text-slate-500 italic ml-4' : 'text-slate-800'}`}>
                        {tx.description || '-'}
                        {tx.children && tx.children.length > 0 && (
                            <span className="text-[10px] font-bold text-indigo-600 ml-1 opacity-70">[{tx.children.length}]</span>
                        )}
                    </span>
                </div>

                <div className="w-[140px] flex-shrink-0 px-3 text-[10px] text-slate-500 truncate py-1">
                    {tx.type === TransactionType.TRANSFER ? (
                        `${getAccountName(tx.fromAccountId)} → ${getAccountName(tx.toAccountId)}`
                    ) : (
                        getAccountName(tx.accountId)
                    )}
                </div>

                <div className="w-[120px] flex-shrink-0 px-3 py-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase truncate max-w-full">
                        {getCategoryName(tx.categoryId)}
                    </span>
                </div>

                <div className="w-[120px] flex-shrink-0 px-3 text-[10px] text-slate-500 truncate py-1">
                    {getContactName(tx.contactId)}
                </div>

                <div className="w-[110px] flex-shrink-0 px-3 text-right text-[11px] font-bold tabular-nums py-1">
                    <span className={isIncome ? 'text-emerald-600' : isExpense ? 'text-rose-600' : 'text-slate-700'}>
                        <span className="text-[9px] opacity-60 mr-0.5 font-normal">{CURRENCY}</span>
                        {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </span>
                </div>

                <div className="w-[120px] flex-shrink-0 px-3 text-right text-[11px] font-bold tabular-nums border-l border-slate-100 bg-inherit py-1">
                    <span className="text-slate-900">
                        <span className="text-[9px] opacity-40 mr-0.5 font-normal">{CURRENCY}</span>
                        {(tx.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </span>
                </div>

                <div className="w-[40px] flex-shrink-0 flex items-center justify-center py-1">
                    <button className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all opacity-0 group-hover:opacity-100">
                        {ICONS.chevronRight}
                    </button>
                </div>
            </div>
        );
    };

    if (!groups?.length || !flatRows.length) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-slate-300 bg-white rounded-xl border border-slate-100 shadow-sm mt-4">
                <div className="p-4 bg-slate-50 rounded-2xl mb-4 border border-slate-100">{ICONS.fileText}</div>
                <h3 className="text-sm font-bold text-slate-900">No transactions match</h3>
                <p className="text-[11px] text-slate-500 mt-1">Try refining your filters or search terms</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full flex-1 flex flex-col bg-white overflow-hidden">
            <div className="overflow-x-auto bg-slate-50 border-b border-slate-200 scrollbar-hide">
                <div className="flex items-center h-8 min-w-[1000px] text-[10px] font-bold uppercase tracking-wider text-slate-500 px-0">
                    <div className="w-[85px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-slate-100 border-r border-slate-200 flex items-center justify-between bg-slate-50" onClick={() => onSort('date')}>DATE <SortIndicator column="date" /></div>
                    <div className="w-[80px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-slate-100 flex items-center justify-between" onClick={() => onSort('type')}>TYPE <SortIndicator column="type" /></div>
                    <div className="flex-1 min-w-0 px-3 py-2 cursor-pointer hover:bg-slate-100 flex items-center justify-between" onClick={() => onSort('description')}>DESCRIPTION <SortIndicator column="description" /></div>
                    <div className="w-[140px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-slate-100 flex items-center justify-between" onClick={() => onSort('account')}>ACCOUNT <SortIndicator column="account" /></div>
                    <div className="w-[120px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-slate-100 flex items-center justify-between" onClick={() => onSort('category')}>CATEGORY <SortIndicator column="category" /></div>
                    <div className="w-[120px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-slate-100 flex items-center justify-between" onClick={() => onSort('contact')}>CONTACT <SortIndicator column="contact" /></div>
                    <div className="w-[110px] flex-shrink-0 px-3 py-2 text-right cursor-pointer hover:bg-slate-100 flex items-center justify-end gap-1" onClick={() => onSort('amount')}>AMOUNT <SortIndicator column="amount" /></div>
                    <div className="w-[120px] flex-shrink-0 px-3 py-2 text-right cursor-pointer hover:bg-slate-100 border-l border-slate-200 flex items-center justify-end gap-1 bg-slate-50" onClick={() => onSort('balance')}>BALANCE <SortIndicator column="balance" /></div>
                    <div className="w-[40px] flex-shrink-0 px-3 py-2"></div>
                </div>
            </div>

            <div className="flex-1 min-w-[1000px]">
                <List
                    listRef={listRef as any}
                    defaultHeight={dimensions.height}
                    rowCount={flatRows.length}
                    rowHeight={(index: number) => flatRows[index]?.type === 'group-header' ? GROUP_HEADER_HEIGHT : ROW_HEIGHT}
                    rowComponent={Row}
                    rowProps={{}}
                    style={{ height: dimensions.height, width: dimensions.width }}
                    className="scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300 scrollbar-track-transparent"
                    onRowsRendered={handleRowsRendered}
                />

                {/* Footer Loading Indicator */}
                {isLoading && (
                    <div className="flex items-center justify-center py-4 bg-slate-50/50 border-t border-slate-100 italic text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mr-2"></div>
                        Fetching more records...
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(VirtualizedLedgerTable);
