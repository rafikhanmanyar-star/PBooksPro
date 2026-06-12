import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { Transaction } from '../../types';
import type { MscLedgerRow } from '../../services/monthlyServiceChargesLedger';
import { CURRENCY, ICONS } from '../../constants';
import { formatCurrency } from '../../utils/numberUtils';

const ROW_HEIGHT = 52;
export const VIRTUALIZE_THRESHOLD = 80;

export type VirtualizedMscLedgerRowExtra = {
    rows: MscLedgerRow[];
    transactionsById: Map<string, Transaction | undefined>;
    onReceive: (row: MscLedgerRow) => void;
    onWhatsApp: (row: MscLedgerRow) => void;
    onEdit: (row: MscLedgerRow) => void;
    onDelete: (row: MscLedgerRow) => void;
};

const statusBadgeClass = (status: string) =>
    status === 'Rented'
        ? 'bg-[color:var(--badge-paid-bg)] text-ds-success border border-ds-success/30'
        : 'bg-[color:var(--badge-partial-bg)] text-[color:var(--badge-partial-text)] border border-[color:var(--badge-partial-text)]/30';

const MscLedgerListRow = memo(function MscLedgerListRow(props: RowComponentProps<VirtualizedMscLedgerRowExtra>) {
    const { index, style, ariaAttributes, rows, transactionsById, onReceive, onWhatsApp, onEdit, onDelete } = props;
    const row = rows[index];
    if (!row) return null;
    const tx = transactionsById.get(row.id);
    return (
        <div
            {...ariaAttributes}
            style={style}
            className="flex items-stretch border-b border-app-border text-sm hover:bg-app-table-hover transition-colors bg-app-card"
        >
            <div className="w-[88px] shrink-0 px-3 py-2.5 whitespace-nowrap text-app-text font-medium">{row.monthKey}</div>
            <div className="w-[100px] shrink-0 px-3 py-2.5 text-app-text truncate" title={row.unit}>
                {row.unit}
            </div>
            <div className="min-w-[100px] flex-1 px-3 py-2.5 text-app-muted truncate" title={row.ownerName}>
                {row.ownerName}
            </div>
            <div className="w-[88px] shrink-0 px-3 py-2.5 flex justify-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                    {row.status}
                </span>
            </div>
            <div className="w-[112px] shrink-0 px-3 py-2.5 text-right font-mono text-app-text">
                {CURRENCY} {formatCurrency(row.totalDeducted)}
            </div>
            <div
                className={`w-[120px] shrink-0 px-3 py-2.5 text-right font-mono font-semibold ${
                    row.runningBalance < -0.01 ? 'text-ds-danger' : 'text-app-text'
                }`}
            >
                {CURRENCY} {formatCurrency(row.runningBalance)}
            </div>
            <div className="w-[120px] shrink-0 px-3 py-2.5 text-right font-mono text-app-muted">
                {CURRENCY} {formatCurrency(row.totalOwnerIncome)}
            </div>
            <div className="w-[200px] shrink-0 px-3 py-2.5 flex flex-wrap items-center justify-center gap-1.5">
                {row.runningBalance < -0.01 && (
                    <button
                        type="button"
                        onClick={() => onReceive(row)}
                        className="text-xs font-semibold text-primary hover:text-primary/80 px-1.5 py-0.5 rounded hover:bg-app-highlight"
                    >
                        Receive
                    </button>
                )}
                {(row.runningBalance < -0.01 || row.shortfall > 0.01) && (
                    <button
                        type="button"
                        onClick={() => void onWhatsApp(row)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-ds-success px-1.5 py-0.5 rounded bg-[color:var(--badge-paid-bg)] hover:bg-[color:var(--badge-paid-bg)]/80 transition-colors"
                        title="Message owner about pending service charge / balance"
                    >
                        <span className="w-3.5 h-3.5 flex-shrink-0">{ICONS.whatsapp}</span>
                        WhatsApp
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onEdit(row)}
                    disabled={!tx}
                    className="text-xs font-semibold text-primary hover:text-primary/80 px-1.5 py-0.5 rounded hover:bg-app-highlight disabled:opacity-40"
                >
                    Edit
                </button>
                <button
                    type="button"
                    onClick={() => void onDelete(row)}
                    className="text-xs font-semibold text-ds-danger hover:text-ds-danger/80 px-1.5 py-0.5 rounded hover:bg-[color:var(--badge-unpaid-bg)]"
                >
                    Delete
                </button>
            </div>
        </div>
    );
});

export interface VirtualizedMscLedgerTableProps {
    rows: MscLedgerRow[];
    transactionsById: Map<string, Transaction | undefined>;
    onReceive: (row: MscLedgerRow) => void;
    onWhatsApp: (row: MscLedgerRow) => void;
    onEdit: (row: MscLedgerRow) => void;
    onDelete: (row: MscLedgerRow) => void;
    emptyMessage: string;
}

/** Use windowed rows when the ledger is large (react-window). */
export const VirtualizedMscLedgerTable: React.FC<VirtualizedMscLedgerTableProps> = ({
    rows,
    transactionsById,
    onReceive,
    onWhatsApp,
    onEdit,
    onDelete,
    emptyMessage,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(360);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) {
                setHeight(Math.max(200, Math.floor(e.contentRect.height)));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const rowProps = useMemo(
        () =>
            ({
                rows,
                transactionsById,
                onReceive,
                onWhatsApp,
                onEdit,
                onDelete,
            }) satisfies VirtualizedMscLedgerRowExtra,
        [rows, transactionsById, onReceive, onWhatsApp, onEdit, onDelete]
    );

    const Row = useCallback(
        (p: RowComponentProps<VirtualizedMscLedgerRowExtra>) => <MscLedgerListRow {...p} />,
        []
    );

    if (rows.length === 0) {
        return (
            <div className="px-4 py-12 text-center text-app-muted border-t border-app-border">{emptyMessage}</div>
        );
    }

    if (rows.length < VIRTUALIZE_THRESHOLD) {
        return (
            <div className="divide-y divide-app-border">
                {rows.map((row, index) => (
                    <MscLedgerListRow
                        key={row.id}
                        index={index}
                        style={{}}
                        ariaAttributes={{ 'aria-posinset': index + 1, 'aria-setsize': rows.length, role: 'listitem' }}
                        {...rowProps}
                    />
                ))}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="min-h-[200px] flex flex-col">
            <List<VirtualizedMscLedgerRowExtra>
                style={{ height, width: '100%' }}
                rowCount={rows.length}
                rowHeight={ROW_HEIGHT}
                rowComponent={Row}
                rowProps={rowProps}
            />
        </div>
    );
};
