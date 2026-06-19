import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import TreeExpandCollapseControls from '../ui/TreeExpandCollapseControls';
import type { FlatVendorLedgerRow, LedgerItem, VendorLedgerSortKey } from './vendorLedgerTypes';

const ROW_HEIGHT = 40;
const OVERSCAN_COUNT = 6;
const MIN_TABLE_WIDTH = 720;

export interface VirtualizedVendorLedgerTableProps {
    flatRows: FlatVendorLedgerRow[];
    ledgerItemCount: number;
    sortConfig: { key: VendorLedgerSortKey; direction: 'asc' | 'desc' };
    expandedIds: Set<string>;
    expandableBatchIds: string[];
    onSort: (key: VendorLedgerSortKey) => void;
    onToggleExpand: (e: React.MouseEvent, id: string) => void;
    onParentRowClick: (e: React.MouseEvent, item: LedgerItem) => void;
    onChildRowClick: (childId: string) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onExport: () => void;
}

type VendorLedgerRowExtra = {
    flatRows: FlatVendorLedgerRow[];
    expandedIds: Set<string>;
    onToggleExpand: VirtualizedVendorLedgerTableProps['onToggleExpand'];
    onParentRowClick: VirtualizedVendorLedgerTableProps['onParentRowClick'];
    onChildRowClick: VirtualizedVendorLedgerTableProps['onChildRowClick'];
};

const SortIcon: React.FC<{
    column: VendorLedgerSortKey;
    sortConfig: VirtualizedVendorLedgerTableProps['sortConfig'];
}> = ({ column, sortConfig }) => (
    <span className="ml-1 text-[10px] text-app-muted">
        {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
    </span>
);

const VendorLedgerTableRow = memo(function VendorLedgerTableRow(props: RowComponentProps<VendorLedgerRowExtra>) {
    const { index, style, ariaAttributes, flatRows, expandedIds, onToggleExpand, onParentRowClick, onChildRowClick } =
        props;
    const row = flatRows[index];
    if (!row) {
        return <div style={style} aria-hidden />;
    }

    const rowStyle: React.CSSProperties = { ...style, minWidth: MIN_TABLE_WIDTH, width: '100%' };

    if (row.kind === 'child') {
        const child = row.child;
        return (
            <div
                {...ariaAttributes}
                style={rowStyle}
                className="flex items-center bg-app-toolbar/40 text-xs hover:bg-app-table-hover cursor-pointer border-b border-app-border overflow-hidden"
                onClick={() => onChildRowClick(child.originalId)}
            >
                <div className="w-[100px] shrink-0 py-1.5 pl-9 pr-2 text-app-muted whitespace-nowrap">
                    {formatDate(child.date)}
                </div>
                <div className="min-w-0 flex-1 px-2 py-1.5 text-app-muted italic truncate" title={child.particulars}>
                    {child.particulars}
                </div>
                <div
                    className="w-32 shrink-0 px-2 py-1.5 text-app-muted truncate"
                    title={child.projectLabel}
                >
                    {child.projectLabel || '—'}
                </div>
                <div className="w-24 shrink-0 px-2 py-1.5 text-right text-app-muted">-</div>
                <div className="w-24 shrink-0 px-2 py-1.5 text-right text-app-text tabular-nums">
                    {(child.debit || 0).toLocaleString()}
                </div>
                <div className="w-24 shrink-0 py-1.5 pl-2 pr-1" />
                <div className="w-20 shrink-0" />
            </div>
        );
    }

    const item = row.item;
    const hasChildren = item.children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const cursorClass =
        item.type === 'supplier_advance'
            ? 'cursor-default'
            : hasChildren || item.type === 'bill' || item.type === 'transaction' || item.type === 'prepaid_apply'
              ? 'cursor-pointer'
              : 'cursor-pointer';

    const rowBg =
        item.type === 'supplier_advance'
            ? 'bg-[color:var(--badge-partial-bg)]/50'
            : item.type === 'prepaid_apply'
              ? 'bg-primary/10'
              : isExpanded
                ? 'bg-app-toolbar/40'
                : 'bg-app-card';

    return (
        <div
            {...ariaAttributes}
            style={rowStyle}
            className={`flex items-center hover:bg-app-table-hover transition-colors border-b border-app-border overflow-hidden text-xs ${cursorClass} ${rowBg}`}
            onClick={(e) => onParentRowClick(e, item)}
        >
            <div className="w-[100px] shrink-0 py-2 pl-2 pr-2 text-app-text whitespace-nowrap flex items-center gap-1.5">
                {hasChildren && (
                    <button
                        type="button"
                        onClick={(e) => onToggleExpand(e, item.id)}
                        className="text-app-muted hover:text-app-text focus:outline-none shrink-0"
                    >
                        <div className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            {ICONS.chevronRight}
                        </div>
                    </button>
                )}
                <span className={!hasChildren ? 'pl-5' : ''}>{formatDate(item.date)}</span>
            </div>
            <div className="min-w-0 flex-1 px-2 py-2 text-app-text truncate" title={item.particulars}>
                {item.particulars}
            </div>
            <div className="w-32 shrink-0 px-2 py-2 text-app-muted truncate" title={item.projectLabel}>
                {item.projectLabel || '—'}
            </div>
            <div className="w-24 shrink-0 px-2 py-2 text-right text-app-text tabular-nums">
                {item.credit > 0 ? (item.credit || 0).toLocaleString() : '-'}
            </div>
            <div className="w-24 shrink-0 px-2 py-2 text-right text-app-text tabular-nums">
                {item.debit > 0 ? (item.debit || 0).toLocaleString() : '-'}
            </div>
            <div
                className={`w-24 shrink-0 py-2 pl-2 pr-1 text-right font-semibold tabular-nums ${
                    (item.balance ?? 0) > 0 ? 'text-ds-danger' : 'text-ds-success'
                }`}
            >
                {(item.balance ?? 0).toLocaleString()}
            </div>
            <div className="w-20 shrink-0" />
        </div>
    );
});

VendorLedgerTableRow.displayName = 'VendorLedgerTableRow';

const VirtualizedVendorLedgerTable: React.FC<VirtualizedVendorLedgerTableProps> = ({
    flatRows,
    ledgerItemCount,
    sortConfig,
    expandedIds,
    expandableBatchIds,
    onSort,
    onToggleExpand,
    onParentRowClick,
    onChildRowClick,
    onExpandAll,
    onCollapseAll,
    onExport,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(320);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const next = Math.max(ROW_HEIGHT, Math.floor(entry.contentRect.height));
                setHeight(next);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const rowProps = useMemo(
        () =>
            ({
                flatRows,
                expandedIds,
                onToggleExpand,
                onParentRowClick,
                onChildRowClick,
            }) satisfies VendorLedgerRowExtra,
        [flatRows, expandedIds, onToggleExpand, onParentRowClick, onChildRowClick]
    );

    const thClass =
        'px-2 py-2 text-xs font-semibold cursor-pointer hover:bg-app-table-hover select-none shrink-0 border-b border-app-border';

    return (
        <div className="flex flex-col flex-grow min-h-0 h-full overflow-hidden -mt-1">
            <div className="overflow-x-auto flex-shrink-0 bg-app-table-header sticky top-0 z-10">
                <div className="flex min-w-[720px] text-app-text" style={{ minWidth: MIN_TABLE_WIDTH }}>
                    <button type="button" onClick={() => onSort('date')} className={`${thClass} w-[100px] text-left pl-2`}>
                        Date <SortIcon column="date" sortConfig={sortConfig} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onSort('particulars')}
                        className={`${thClass} min-w-0 flex-1 text-left`}
                    >
                        Particulars <SortIcon column="particulars" sortConfig={sortConfig} />
                    </button>
                    <div className={`${thClass} w-32 text-left text-app-muted cursor-default hover:bg-app-table-header`}>
                        Project
                    </div>
                    <button type="button" onClick={() => onSort('credit')} className={`${thClass} w-24 text-right`}>
                        Bills (Cr) <SortIcon column="credit" sortConfig={sortConfig} />
                    </button>
                    <button type="button" onClick={() => onSort('debit')} className={`${thClass} w-24 text-right`}>
                        Pay / Adv (Dr) <SortIcon column="debit" sortConfig={sortConfig} />
                    </button>
                    <button type="button" onClick={() => onSort('balance')} className={`${thClass} w-24 text-right pl-2 pr-1`}>
                        Balance <SortIcon column="balance" sortConfig={sortConfig} />
                    </button>
                    <div className={`${thClass} w-20 pl-1 pr-2 cursor-default hover:bg-app-table-header border-b border-app-border`}>
                        <div className="flex items-center justify-end gap-1">
                            <TreeExpandCollapseControls
                                variant="slate"
                                allExpandableIds={expandableBatchIds}
                                expandedIds={expandedIds}
                                onExpandAll={onExpandAll}
                                onCollapseAll={onCollapseAll}
                                visible={expandableBatchIds.length > 0}
                            />
                            <button
                                type="button"
                                onClick={onExport}
                                disabled={ledgerItemCount === 0}
                                className="flex items-center justify-center w-6 h-6 rounded bg-app-toolbar text-app-muted hover:bg-app-table-hover hover:text-app-text transition-colors disabled:opacity-50"
                                title="Export to Excel"
                            >
                                <span className="w-3.5 h-3.5">{ICONS.export}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div ref={containerRef} className="flex-1 min-h-0 overflow-x-auto -mx-2">
                <List<VendorLedgerRowExtra>
                    rowCount={flatRows.length}
                    rowHeight={ROW_HEIGHT}
                    overscanCount={OVERSCAN_COUNT}
                    rowComponent={VendorLedgerTableRow}
                    rowProps={rowProps}
                    style={{ height, width: '100%', minWidth: MIN_TABLE_WIDTH }}
                />
            </div>
        </div>
    );
};

export default memo(VirtualizedVendorLedgerTable);
