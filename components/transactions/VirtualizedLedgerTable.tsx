import React, { useMemo, useRef, useCallback, useState, useEffect, memo } from 'react';
import { List } from 'react-window';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { Transaction, TransactionType, LedgerSortKey as SortKey, SortDirection } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

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

const ROW_HEIGHT = 34;
const GROUP_HEADER_HEIGHT = 38;

interface FlatRow {
    type: 'transaction' | 'group-header' | 'child';
    data: Transaction & { balance?: number };
    groupTitle?: string;
    groupKey?: string;
    isChild?: boolean;
    parentId?: string;
    indexInGroup?: number;
    totalInGroup?: number;
    /** Precomputed in flatten step to avoid O(n) reduce per visible group header row */
    groupSummary?: { in: number; out: number };
}

type LedgerRowExtraProps = {
    flatRows: FlatRow[];
    expandedRowIds: Set<string>;
    getAccountName: (id?: string) => string;
    getCategoryName: (id?: string) => string;
    getContactName: (id?: string) => string;
    onRowClick: (transaction: Transaction) => void;
    onToggleExpand: (id: string) => void;
};

const SortIndicator = memo(function SortIndicator({
    column,
    sortConfig,
}: {
    column: SortKey;
    sortConfig: { key: SortKey; direction: SortDirection };
}) {
    const isActive = sortConfig.key === column;
    return (
        <div className={`ml-1 transition-opacity ${isActive ? 'text-primary opacity-100' : 'text-app-muted opacity-50'}`}>
            {isActive ? (sortConfig.direction === 'asc' ? ICONS.arrowUp : ICONS.arrowDown) : ICONS.arrowUpDown}
        </div>
    );
});

/** Stable list row — avoids recreating row type every parent render (helps react-window). */
const LedgerListRow = memo(function LedgerListRow({
    index,
    style,
    flatRows,
    expandedRowIds,
    getAccountName,
    getCategoryName,
    getContactName,
    onRowClick,
    onToggleExpand,
}: {
    index: number;
    style: React.CSSProperties;
    ariaAttributes?: Record<string, unknown>;
} & LedgerRowExtraProps) {
    const row = flatRows[index];
    if (!row) return null;

    if (row.type === 'group-header') {
        const summary = row.groupSummary ?? { in: 0, out: 0 };
        return (
            <div style={style} className="flex items-center px-4 bg-app-toolbar border-b border-app-border">
                <div className="flex items-center gap-2 flex-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{row.groupTitle}</span>
                    <span className="text-[9px] font-bold text-app-muted bg-app-surface-2 px-1.5 py-0.5 rounded border border-app-border">
                        {row.totalInGroup} RECORDS
                    </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold tabular-nums">
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] text-app-muted leading-none mb-0.5 uppercase">IN</span>
                        <span className="text-ds-success">+{CURRENCY}{summary.in.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] text-app-muted leading-none mb-0.5 uppercase">OUT</span>
                        <span className="text-ds-danger">-{CURRENCY}{summary.out.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-end border-l border-app-border pl-4 ml-2">
                        <span className="text-[8px] text-app-muted leading-none mb-0.5 uppercase">NET</span>
                        <span className={summary.in - summary.out >= 0 ? 'text-app-text' : 'text-ds-danger'}>
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
    const isLoan = tx.type === TransactionType.LOAN;
    const isChild = row.type === 'child';
    const isExpanded = expandedRowIds.has(tx.id);

    return (
        <div
            style={style}
            className={`flex items-center group cursor-pointer border-b border-app-border hover:bg-app-toolbar/80 transition-colors duration-ds ${isChild ? 'bg-app-toolbar/40' : 'bg-app-card'}`}
            onClick={() => !isChild && onRowClick(tx)}
        >
            <div className="w-[85px] flex-shrink-0 px-3 text-[11px] text-app-muted font-mono py-1 border-r border-app-border bg-inherit uppercase">
                {formatDate(tx.date)}
            </div>

            <div className="w-[80px] flex-shrink-0 px-3 py-1">
                <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                        isIncome
                            ? 'ds-pill-type ds-pill-type-payment'
                            : isExpense
                              ? 'border border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-[color:var(--badge-unpaid-text)]'
                              : isLoan
                                ? 'ds-pill-type ds-pill-type-security'
                                : 'ds-pill-type ds-pill-type-installment'
                    }`}
                >
                    {tx.type.substring(0, 3)}
                </span>
            </div>

            <div className="flex-1 min-w-0 px-3 flex items-center gap-2 py-1">
                {!isChild && tx.children && tx.children.length > 0 && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(tx.id);
                        }}
                        className={`p-0.5 rounded hover:bg-app-toolbar transition-colors duration-ds ${isExpanded ? 'rotate-90 text-primary' : 'text-app-muted'}`}
                    >
                        {ICONS.chevronRight}
                    </button>
                )}
                <span className={`text-[11px] font-semibold truncate ${isChild ? 'text-app-muted italic ml-4' : 'text-app-text'}`}>
                    {tx.description || '-'}
                    {tx.children && tx.children.length > 0 && (
                        <span className="text-[10px] font-bold text-primary ml-1 opacity-70">[{tx.children.length}]</span>
                    )}
                </span>
            </div>

            <div className="w-[140px] flex-shrink-0 px-3 text-[10px] text-app-muted truncate py-1">
                {tx.type === TransactionType.TRANSFER
                    ? `${getAccountName(tx.fromAccountId)} → ${getAccountName(tx.toAccountId)}`
                    : getAccountName(tx.accountId)}
            </div>

            <div className="w-[120px] flex-shrink-0 px-3 py-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-app-toolbar text-app-muted border border-app-border uppercase truncate max-w-full">
                    {getCategoryName(tx.categoryId)}
                </span>
            </div>

            <div className="w-[120px] flex-shrink-0 px-3 text-[10px] text-app-muted truncate py-1">{getContactName(tx.contactId)}</div>

            <div className="w-[110px] flex-shrink-0 px-3 text-right text-[11px] font-bold tabular-nums py-1">
                <span
                    className={
                        isIncome ? 'text-ds-success' : isExpense ? 'text-ds-danger' : isLoan ? 'text-ds-warning' : 'text-primary'
                    }
                >
                    <span className="text-[9px] opacity-60 mr-0.5 font-normal">{CURRENCY}</span>
                    {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </span>
            </div>

            <div className="w-[120px] flex-shrink-0 px-3 text-right text-[11px] font-bold tabular-nums border-l border-app-border bg-inherit py-1">
                <span className="text-app-text">
                    <span className="text-[9px] opacity-40 mr-0.5 font-normal">{CURRENCY}</span>
                    {(tx.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </span>
            </div>

            <div className="w-[40px] flex-shrink-0 flex items-center justify-center py-1">
                <button
                    type="button"
                    className="p-1 text-app-muted hover:text-primary hover:bg-nav-active rounded transition-all duration-ds opacity-0 group-hover:opacity-100"
                >
                    {ICONS.chevronRight}
                </button>
            </div>
        </div>
    );
});

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
    isLoading = false,
}) => {
    const lookupMaps = useLookupMaps();
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<{
        element: HTMLDivElement | null;
        scrollToRow: (config: { align?: string; behavior?: string; index: number }) => void;
    } | null>(null);
    const [dimensions, setDimensions] = useState({ height: 600, width: 1200 });

    const flatRows = useMemo(() => {
        const rows: FlatRow[] = [];
        if (!groups || !Array.isArray(groups)) return rows;

        groups.forEach((group) => {
            if (!group || !group.transactions || !Array.isArray(group.transactions)) return;

            if (showGrouping) {
                const groupSummary = group.transactions.reduce(
                    (acc, tx) => {
                        if (tx.type === TransactionType.INCOME) acc.in += tx.amount;
                        else if (tx.type === TransactionType.EXPENSE) acc.out += tx.amount;
                        return acc;
                    },
                    { in: 0, out: 0 }
                );
                rows.push({
                    type: 'group-header',
                    data: group.transactions[0] || ({} as Transaction),
                    groupTitle: group.title,
                    groupKey: group.key,
                    totalInGroup: group.transactions.length,
                    groupSummary,
                });
            }

            group.transactions.forEach((tx, idx) => {
                if (!tx) return;
                rows.push({
                    type: 'transaction',
                    data: tx,
                    indexInGroup: idx,
                    totalInGroup: group.transactions.length,
                });

                if (expandedRowIds.has(tx.id) && tx.children && tx.children.length > 0) {
                    tx.children.forEach((child) => {
                        rows.push({
                            type: 'child',
                            data: child,
                            isChild: true,
                            parentId: tx.id,
                        });
                    });
                }
            });
        });
        return rows;
    }, [groups, expandedRowIds, showGrouping]);

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const availableHeight = rect.height - 36;
                const viewportBasedFallback = window.innerHeight - rect.top - 90;
                setDimensions({
                    // Prefer measured container height; if layout reports too small temporarily,
                    // fall back to viewport-derived space so rows still fill down to footer.
                    height: Math.max(availableHeight, viewportBasedFallback, 420),
                    width: rect.width || 1200,
                });
            }
        };

        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) observer.observe(containerRef.current);
        updateDimensions();
        const timer = setTimeout(updateDimensions, 100);
        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, []);

    const handleRowsRendered = useCallback(
        ({ stopIndex }: { startIndex: number; stopIndex: number }) => {
            if (onLoadMore && hasMore && !isLoading && stopIndex >= flatRows.length - 10) {
                onLoadMore();
            }
        },
        [onLoadMore, hasMore, isLoading, flatRows.length]
    );

    const getAccountName = useCallback(
        (id?: string) => lookupMaps.accounts.get(id || '')?.name || '-',
        [lookupMaps]
    );

    const getCategoryName = useCallback(
        (id?: string) => lookupMaps.categories.get(id || '')?.name || '-',
        [lookupMaps]
    );

    const getContactName = useCallback(
        (id?: string) => lookupMaps.contacts.get(id || '')?.name || '-',
        [lookupMaps]
    );

    const rowProps = useMemo(
        () =>
            ({
                flatRows,
                expandedRowIds,
                getAccountName,
                getCategoryName,
                getContactName,
                onRowClick,
                onToggleExpand,
            }) satisfies LedgerRowExtraProps,
        [flatRows, expandedRowIds, getAccountName, getCategoryName, getContactName, onRowClick, onToggleExpand]
    );

    if (!groups?.length || !flatRows.length) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-app-muted bg-app-card rounded-xl border border-app-border shadow-ds-card mt-4">
                <div className="p-4 bg-app-toolbar rounded-2xl mb-4 border border-app-border">{ICONS.fileText}</div>
                <h3 className="text-sm font-bold text-app-text">No transactions match</h3>
                <p className="text-[11px] text-app-muted mt-1">Try refining your filters or search terms</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full flex-1 min-h-0 flex flex-col bg-app-card overflow-hidden">
            <div className="overflow-x-auto bg-app-table-header border-b border-app-border scrollbar-hide">
                <div className="flex items-center h-8 min-w-[1000px] text-[10px] font-bold uppercase tracking-wider text-app-muted px-0">
                    <div
                        className="w-[85px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-app-toolbar border-r border-app-border flex items-center justify-between bg-app-table-header"
                        onClick={() => onSort('date')}
                    >
                        DATE <SortIndicator column="date" sortConfig={sortConfig} />
                    </div>
                    <div className="w-[80px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-app-toolbar flex items-center justify-between" onClick={() => onSort('type')}>
                        TYPE <SortIndicator column="type" sortConfig={sortConfig} />
                    </div>
                    <div
                        className="flex-1 min-w-0 px-3 py-2 cursor-pointer hover:bg-app-toolbar flex items-center justify-between"
                        onClick={() => onSort('description')}
                    >
                        DESCRIPTION <SortIndicator column="description" sortConfig={sortConfig} />
                    </div>
                    <div className="w-[140px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-app-toolbar flex items-center justify-between" onClick={() => onSort('account')}>
                        ACCOUNT <SortIndicator column="account" sortConfig={sortConfig} />
                    </div>
                    <div className="w-[120px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-app-toolbar flex items-center justify-between" onClick={() => onSort('category')}>
                        CATEGORY <SortIndicator column="category" sortConfig={sortConfig} />
                    </div>
                    <div className="w-[120px] flex-shrink-0 px-3 py-2 cursor-pointer hover:bg-app-toolbar flex items-center justify-between" onClick={() => onSort('contact')}>
                        CONTACT <SortIndicator column="contact" sortConfig={sortConfig} />
                    </div>
                    <div
                        className="w-[110px] flex-shrink-0 px-3 py-2 text-right cursor-pointer hover:bg-app-toolbar flex items-center justify-end gap-1"
                        onClick={() => onSort('amount')}
                    >
                        AMOUNT <SortIndicator column="amount" sortConfig={sortConfig} />
                    </div>
                    <div
                        className="w-[120px] flex-shrink-0 px-3 py-2 text-right cursor-pointer hover:bg-app-toolbar border-l border-app-border flex items-center justify-end gap-1 bg-app-table-header"
                        onClick={() => onSort('balance')}
                    >
                        BALANCE <SortIndicator column="balance" sortConfig={sortConfig} />
                    </div>
                    <div className="w-[40px] flex-shrink-0 px-3 py-2"></div>
                </div>
            </div>

            <div className="flex-1 min-h-0 min-w-[1000px]">
                <List
                    listRef={listRef as any}
                    defaultHeight={dimensions.height}
                    rowCount={flatRows.length}
                    rowHeight={(index: number) => (flatRows[index]?.type === 'group-header' ? GROUP_HEADER_HEIGHT : ROW_HEIGHT)}
                    rowComponent={LedgerListRow}
                    rowProps={rowProps}
                    overscanCount={6}
                    style={{ height: dimensions.height, width: dimensions.width }}
                    className="scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 hover:dark:scrollbar-thumb-slate-500 scrollbar-track-transparent"
                    onRowsRendered={handleRowsRendered}
                />

                {isLoading && (
                    <div className="flex items-center justify-center py-4 bg-app-toolbar/50 border-t border-app-border italic text-[10px] text-app-muted font-bold uppercase tracking-widest">
                        <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2"></div>
                        Fetching more records...
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(VirtualizedLedgerTable);
