import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { List, type RowComponentProps } from 'react-window';
import type { BuiltPayrollLedgerRow } from './utils/payrollLedgerCore';

const ROW_HEIGHT = 52;
const OVERSCAN_COUNT = 6;
const MIN_TABLE_WIDTH = 800;
const FALLBACK_LIST_HEIGHT = 320;

function formatTableDate(isoOrDate: string | null | undefined): string {
    if (!isoOrDate) return '—';
    const d = new Date(isoOrDate);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ledgerTableRowKindLabel(row: BuiltPayrollLedgerRow): string {
    if (row.transaction_type === 'PAYSLIP') return 'Payslip';
    if (row.transaction_type === 'PAYMENT' && row.balance_after < -0.01) return 'Advance';
    return 'Payment';
}

function ledgerBalanceClass(balance: number): string {
    if (balance < -0.01) return 'text-amber-700 dark:text-amber-400 font-semibold';
    if (balance > 0.01) return 'text-red-600 dark:text-red-400 font-semibold';
    return 'text-app-text';
}

export interface VirtualizedPayrollEmployeeLedgerTableProps {
    rows: BuiltPayrollLedgerRow[];
    loading: boolean;
    emptyMessage: string;
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => void;
    loadedCount?: number;
    totalCount?: number;
}

type PayrollLedgerRowExtra = {
    rows: BuiltPayrollLedgerRow[];
};

const PayrollLedgerTableRow = memo(function PayrollLedgerTableRow(props: RowComponentProps<PayrollLedgerRowExtra>) {
    const { index, style, ariaAttributes, rows } = props;
    const row = rows[index];
    if (!row) {
        return <div style={style} aria-hidden />;
    }

    const striped = index % 2 === 1;

    return (
        <div
            {...ariaAttributes}
            style={{ ...style, minWidth: MIN_TABLE_WIDTH }}
            className={`flex items-center text-sm border-b border-app-border hover:bg-app-toolbar/30 ${
                striped ? 'bg-app-toolbar/15' : 'bg-app-card'
            }`}
        >
            <div className="w-[7.5rem] shrink-0 py-3 pr-4 pl-0 whitespace-nowrap text-app-muted">
                {formatTableDate(row.transaction_date)}
            </div>
            <div className="w-[6.5rem] shrink-0 py-3 pr-4">
                <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                        row.transaction_type === 'PAYSLIP'
                            ? 'bg-app-toolbar text-app-text'
                            : row.balance_after < -0.01
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              : 'bg-ds-success/15 text-ds-success'
                    }`}
                >
                    {ledgerTableRowKindLabel(row)}
                </span>
            </div>
            <div
                className="w-[10rem] shrink-0 py-3 pr-4 font-mono text-[11px] text-app-muted break-all"
                title={row.reference_id}
            >
                {row.reference_id || '—'}
            </div>
            <div className="min-w-0 flex-1 py-3 pr-4 text-app-text truncate" title={row.description}>
                {row.description || '—'}
            </div>
            <div className="w-[6.5rem] shrink-0 py-3 pr-4 text-right tabular-nums text-app-text">
                {row.debit > 0 ? row.debit.toLocaleString() : '—'}
            </div>
            <div className="w-[6.5rem] shrink-0 py-3 pr-4 text-right tabular-nums text-app-text">
                {row.credit > 0 ? row.credit.toLocaleString() : '—'}
            </div>
            <div className={`w-[7rem] shrink-0 py-3 pr-4 text-right tabular-nums ${ledgerBalanceClass(row.balance_after)}`}>
                {row.balance_after.toLocaleString()}
            </div>
        </div>
    );
});

PayrollLedgerTableRow.displayName = 'PayrollLedgerTableRow';

const VirtualizedPayrollEmployeeLedgerTable: React.FC<VirtualizedPayrollEmployeeLedgerTableProps> = ({
    rows,
    loading,
    emptyMessage,
    hasMore = false,
    loadingMore = false,
    onLoadMore,
    loadedCount,
    totalCount,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(FALLBACK_LIST_HEIGHT);

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

    const rowProps = useMemo(() => ({ rows }) satisfies PayrollLedgerRowExtra, [rows]);

    if (loading && rows.length === 0) {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full items-center justify-center py-12 text-app-muted text-sm">
                <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin" /> Loading…
                </span>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full items-center justify-center py-12 text-app-muted text-sm">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
            <div className="overflow-x-auto flex-shrink-0 border-b border-app-border">
                <div
                    className="flex text-sm text-app-muted font-semibold"
                    style={{ minWidth: MIN_TABLE_WIDTH }}
                >
                    <div className="w-[7.5rem] shrink-0 py-3 pr-4 whitespace-nowrap">Date</div>
                    <div className="w-[6.5rem] shrink-0 py-3 pr-4">Type</div>
                    <div className="w-[10rem] shrink-0 py-3 pr-4 font-mono text-xs">Reference</div>
                    <div className="min-w-0 flex-1 py-3 pr-4">Description</div>
                    <div className="w-[6.5rem] shrink-0 py-3 pr-4 text-right tabular-nums">Debit</div>
                    <div className="w-[6.5rem] shrink-0 py-3 pr-4 text-right tabular-nums">Credit</div>
                    <div className="w-[7rem] shrink-0 py-3 pr-4 text-right tabular-nums">Balance</div>
                </div>
            </div>
            <div ref={containerRef} className="flex-1 min-h-0 overflow-x-auto">
                <List<PayrollLedgerRowExtra>
                    rowCount={rows.length}
                    rowHeight={ROW_HEIGHT}
                    overscanCount={OVERSCAN_COUNT}
                    rowComponent={PayrollLedgerTableRow}
                    rowProps={rowProps}
                    style={{ height, width: '100%', minWidth: MIN_TABLE_WIDTH }}
                />
            </div>
            {hasMore && onLoadMore ? (
                <div className="flex-shrink-0 border-t border-app-border px-3 py-2 flex items-center justify-between gap-3 bg-app-card">
                    <span className="text-xs text-app-muted">
                        Showing {(loadedCount ?? rows.length).toLocaleString()}
                        {totalCount != null ? ` of ${totalCount.toLocaleString()} rows` : ' rows'}
                    </span>
                    <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loadingMore}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                    >
                        {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                </div>
            ) : null}
        </div>
    );
};

export default memo(VirtualizedPayrollEmployeeLedgerTable);
