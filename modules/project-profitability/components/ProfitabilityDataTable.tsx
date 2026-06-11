import React, { useMemo, useState } from 'react';
import {
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnSizingState,
    type RowSelectionState,
    type SortingState,
    type VisibilityState,
} from '@tanstack/react-table';
import { motion } from 'framer-motion';
import type { ProjectProfitabilityRow, ProfitabilityRowStatus } from '../types/profitability.types';
import { formatCompactMoney, formatRoi } from '../utils/financialFormat';

function StatusBadge({ status }: { status: ProfitabilityRowStatus }) {
    const map: Record<ProfitabilityRowStatus, string> = {
        Profitable: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/25',
        Loss: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/25',
        Ongoing: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/25',
        Completed: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 ring-1 ring-sky-500/25',
    };
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status]}`}>{status}</span>;
}

const money = (v: number) => formatCompactMoney(v);
const num = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '—');

export interface ProfitabilityDataTableProps {
    rows: ProjectProfitabilityRow[];
    isLoading: boolean;
    onRowOpen: (projectId: string) => void;
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
    columnVisibility?: VisibilityState;
    onColumnVisibilityChange?: (v: VisibilityState) => void;
}

export const ProfitabilityDataTable: React.FC<ProfitabilityDataTableProps> = ({
    rows,
    isLoading,
    onRowOpen,
    selectedIds,
    onSelectionChange,
    columnVisibility: columnVisibilityControlled,
    onColumnVisibilityChange: onColumnVisibilityChangeControlled,
}) => {
    const [sorting, setSorting] = useState<SortingState>([{ id: 'netProfit', desc: true }]);
    const [columnVisibilityInternal, setColumnVisibilityInternal] = useState<VisibilityState>({});
    const columnVisibility = columnVisibilityControlled ?? columnVisibilityInternal;
    const setColumnVisibility = onColumnVisibilityChangeControlled ?? setColumnVisibilityInternal;
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    React.useEffect(() => {
        const m: RowSelectionState = {};
        for (const id of selectedIds) m[id] = true;
        setRowSelection(m);
    }, [selectedIds]);

    const columns = useMemo<ColumnDef<ProjectProfitabilityRow>[]>(
        () => [
            {
                id: 'select',
                header: ({ table }) => (
                    <input
                        type="checkbox"
                        className="rounded border-app-border"
                        checked={table.getIsAllPageRowsSelected()}
                        ref={(el) => {
                            if (el) el.indeterminate = table.getIsSomePageRowsSelected();
                        }}
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                        aria-label="Select all on page"
                    />
                ),
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        className="rounded border-app-border"
                        checked={row.getIsSelected()}
                        disabled={!row.getCanSelect()}
                        onChange={row.getToggleSelectedHandler()}
                        aria-label="Select row"
                    />
                ),
                size: 36,
                enableResizing: false,
            },
            {
                accessorKey: 'projectName',
                header: 'Project',
                cell: (ctx) => (
                    <button type="button" className="text-left font-medium text-ds-primary hover:underline" onClick={() => onRowOpen(ctx.row.original.projectId)}>
                        {String(ctx.getValue())}
                    </button>
                ),
                size: 200,
                meta: { sticky: true },
            },
            { accessorKey: 'rowStatus', header: 'Status', cell: (c) => <StatusBadge status={c.row.original.rowStatus} />, size: 110 },
            { accessorKey: 'completionPct', header: 'Completion %', cell: (c) => num(Number(c.getValue())), size: 100 },
            { accessorKey: 'unitsSold', header: 'Sold', size: 64 },
            { accessorKey: 'unitsRemaining', header: 'Remain', size: 72 },
            { accessorKey: 'revenue', header: 'Revenue', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'expense', header: 'Expense', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'grossProfit', header: 'Gross profit', cell: (c) => money(Number(c.getValue())), size: 110 },
            { accessorKey: 'netProfit', header: 'Net profit', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'adjustedProfit', header: 'Adjusted', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'unsoldInventoryValue', header: 'Unsold inv.', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'receivable', header: 'Receivable', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'cashReceived', header: 'Cash in', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'payables', header: 'Payables', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'investorCapital', header: 'Investor cap.', cell: (c) => money(Number(c.getValue())), size: 110 },
            { accessorKey: 'roiPct', header: 'ROI %', cell: (c) => formatRoi(c.getValue() as number | null), size: 80 },
            { accessorKey: 'lastUpdated', header: 'Updated', cell: (c) => (c.getValue() ? String(c.getValue()) : '—'), size: 100 },
        ],
        [onRowOpen]
    );

    const table = useReactTable({
        data: rows,
        columns,
        state: { sorting, columnVisibility, columnSizing, rowSelection },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: setColumnSizing,
        onRowSelectionChange: (updater) => {
            setRowSelection((prev) => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                const ids = Object.keys(next).filter((k) => next[k]);
                onSelectionChange(ids);
                return next;
            });
        },
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        enableRowSelection: true,
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
        getRowId: (row) => row.projectId,
        initialState: { pagination: { pageSize: 20 } },
    });

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => ({
                revenue: acc.revenue + r.revenue,
                expense: acc.expense + r.expense,
                grossProfit: acc.grossProfit + r.grossProfit,
                netProfit: acc.netProfit + r.netProfit,
                adjustedProfit: acc.adjustedProfit + r.adjustedProfit,
                unsoldInventoryValue: acc.unsoldInventoryValue + r.unsoldInventoryValue,
                receivable: acc.receivable + r.receivable,
                cashReceived: acc.cashReceived + r.cashReceived,
                payables: acc.payables + r.payables,
                investorCapital: acc.investorCapital + r.investorCapital,
            }),
            {
                revenue: 0,
                expense: 0,
                grossProfit: 0,
                netProfit: 0,
                adjustedProfit: 0,
                unsoldInventoryValue: 0,
                receivable: 0,
                cashReceived: 0,
                payables: 0,
                investorCapital: 0,
            }
        );
    }, [rows]);

    if (isLoading) {
        return (
            <div className="space-y-2 animate-pulse p-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-10 rounded-lg bg-app-surface-2" />
                ))}
            </div>
        );
    }

    if (!rows.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center rounded-2xl border border-dashed border-app-border bg-app-surface-2">
                <p className="text-lg font-semibold text-app-text">No projects match your filters</p>
                <p className="mt-2 text-sm text-app-muted max-w-md">
                    Profitability uses the same accrual rules as Project P/L, with inventory valued at unsold unit pricing.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-app-border bg-app-card shadow-ds-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1400px]">
                    <thead className="sticky top-0 z-20 bg-app-table-header backdrop-blur border-b border-app-border">
                        {table.getHeaderGroups().map((hg) => (
                            <tr key={hg.id}>
                                {hg.headers.map((h, hi) => (
                                    <th
                                        key={h.id}
                                        className={`text-left font-semibold text-app-muted px-2 py-2 whitespace-nowrap relative ${hi === 1 ? 'sticky left-0 z-30 bg-app-table-header' : ''}`}
                                        style={{ width: h.getSize() }}
                                    >
                                        {h.isPlaceholder ? null : (
                                            <button
                                                type="button"
                                                className={`flex items-center gap-1 ${h.column.getCanSort() ? 'cursor-pointer select-none hover:text-indigo-600' : ''}`}
                                                onClick={h.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(h.column.columnDef.header, h.getContext())}
                                                {h.column.getIsSorted() === 'asc' ? '↑' : h.column.getIsSorted() === 'desc' ? '↓' : null}
                                            </button>
                                        )}
                                        {h.column.getCanResize() && (
                                            <button
                                                type="button"
                                                aria-label="Resize column"
                                                onMouseDown={h.getResizeHandler()}
                                                onTouchStart={h.getResizeHandler()}
                                                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-indigo-400/50 ${h.column.getIsResizing() ? 'bg-indigo-500' : ''}`}
                                            />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row, ri) => (
                            <motion.tr
                                key={row.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={`border-b border-app-border hover:bg-app-table-hover ${ri % 2 === 1 ? 'bg-app-surface-2/40' : ''}`}
                            >
                                {row.getVisibleCells().map((cell, ci) => (
                                    <td
                                        key={cell.id}
                                        className={`px-2 py-1.5 tabular-nums text-app-text ${ci === 1 ? 'sticky left-0 z-10 bg-app-card' : ''} ${ri % 2 === 1 && ci === 1 ? 'bg-app-surface-2/60' : ''}`}
                                        style={{ width: cell.column.getSize() }}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </motion.tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-app-table-header text-xs text-app-text border-t-2 border-app-border">
                            <td colSpan={table.getVisibleLeafColumns().length} className="px-3 py-2.5">
                                <span className="font-semibold">Totals (filtered):</span>{' '}
                                <span className="text-app-muted">
                                    Revenue {money(totals.revenue)} · Expense {money(totals.expense)} · Gross {money(totals.grossProfit)} · Net {money(totals.netProfit)} · Adjusted{' '}
                                    {money(totals.adjustedProfit)} · Unsold inv. {money(totals.unsoldInventoryValue)} · Receivable {money(totals.receivable)} · Cash in {money(totals.cashReceived)} · Payables{' '}
                                    {money(totals.payables)} · Investor capital {money(totals.investorCapital)}
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t border-app-border text-xs bg-app-surface-2">
                <div className="text-app-muted">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {rows.length} rows
                </div>
                <div className="flex gap-2">
                    <button type="button" className="px-2 py-1 rounded-md border border-app-border text-app-text hover:bg-app-table-hover disabled:opacity-40" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                        Prev
                    </button>
                    <button type="button" className="px-2 py-1 rounded-md border border-app-border text-app-text hover:bg-app-table-hover disabled:opacity-40" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};

export function ColumnSettingsMenu({
    columnIds,
    visibility,
    onChange,
}: {
    columnIds: { id: string; label: string }[];
    visibility: VisibilityState;
    onChange: (v: VisibilityState) => void;
}) {
    return (
        <div className="rounded-xl border border-app-border bg-app-popover shadow-ds-modal p-3 max-h-72 overflow-y-auto w-56 text-xs text-app-text">
            <p className="font-semibold text-app-text mb-2">Columns</p>
            {columnIds.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={visibility[c.id] !== false}
                        onChange={(e) => onChange({ ...visibility, [c.id]: e.target.checked })}
                    />
                    {c.label}
                </label>
            ))}
        </div>
    );
}
