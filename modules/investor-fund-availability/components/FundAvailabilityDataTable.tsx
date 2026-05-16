import React, { useMemo, useState } from 'react';
import {
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
    type VisibilityState,
    type RowSelectionState,
    type ColumnSizingState,
} from '@tanstack/react-table';
import { motion } from 'framer-motion';
import type { FundAvailabilityRow, FundHealthStatus } from '../types/fundAvailability.types';
import { formatCompactMoney, formatRatio } from '../utils/financialFormat';

function HealthBadge({ status }: { status: FundHealthStatus }) {
    const map: Record<FundHealthStatus, string> = {
        Healthy: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/25',
        Warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/25',
        Blocked: 'bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/25',
        Overdrawn: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/25',
    };
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status]}`}>{status}</span>;
}

const money = (v: number) => formatCompactMoney(v);

function ColumnSettingsMenu({
    columnIds,
    visibility,
    onChange,
}: {
    columnIds: { id: string; label: string }[];
    visibility: VisibilityState;
    onChange: (v: VisibilityState) => void;
}) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg p-3 max-h-72 overflow-y-auto w-56 text-xs">
            <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Columns</p>
            {columnIds.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input type="checkbox" checked={visibility[c.id] !== false} onChange={(e) => onChange({ ...visibility, [c.id]: e.target.checked })} />
                    {c.label}
                </label>
            ))}
        </div>
    );
}

export interface FundAvailabilityDataTableProps {
    rows: FundAvailabilityRow[];
    isLoading: boolean;
    onRowOpen: (projectId: string) => void;
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
}

export const FundAvailabilityDataTable: React.FC<FundAvailabilityDataTableProps> = ({
    rows,
    isLoading,
    onRowOpen,
    selectedIds,
    onSelectionChange,
}) => {
    const [sorting, setSorting] = useState<SortingState>([{ id: 'distributableFunds', desc: true }]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [colMenuOpen, setColMenuOpen] = useState(false);

    React.useEffect(() => {
        const m: RowSelectionState = {};
        for (const id of selectedIds) m[id] = true;
        setRowSelection(m);
    }, [selectedIds]);

    const columns = useMemo<ColumnDef<FundAvailabilityRow>[]>(
        () => [
            {
                id: 'select',
                header: ({ table }) => (
                    <input
                        type="checkbox"
                        className="rounded border-slate-300 dark:border-slate-600"
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
                        className="rounded border-slate-300 dark:border-slate-600"
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
                id: 'sno',
                header: 'S.No',
                cell: ({ row }) =>
                    row.index + 1 + row.table.getState().pagination.pageIndex * row.table.getState().pagination.pageSize,
                size: 52,
                enableSorting: false,
            },
            {
                accessorKey: 'projectName',
                id: 'projectName',
                header: 'Project',
                cell: (ctx) => (
                    <button
                        type="button"
                        className="text-left font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        onClick={() => onRowOpen(ctx.row.original.projectId)}
                    >
                        {String(ctx.getValue())}
                    </button>
                ),
                size: 200,
            },
            { accessorKey: 'projectStatus', id: 'projectStatus', header: 'Status', size: 96 },
            { accessorKey: 'investorCapital', id: 'investorCapital', header: 'Investor capital', cell: (c) => money(Number(c.getValue())), size: 120 },
            { accessorKey: 'allocatedProfit', id: 'allocatedProfit', header: 'Allocated profit', cell: (c) => money(Number(c.getValue())), size: 120 },
            { accessorKey: 'investorEquity', id: 'investorEquity', header: 'Investor equity', cell: (c) => money(Number(c.getValue())), size: 120 },
            { accessorKey: 'availableCash', id: 'availableCash', header: 'Available cash', cell: (c) => money(Number(c.getValue())), size: 120 },
            { accessorKey: 'reservedFunds', id: 'reservedFunds', header: 'Reserved', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'pendingPayables', id: 'pendingPayables', header: 'Payables', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'distributableFunds', id: 'distributableFunds', header: 'Distributable', cell: (c) => money(Number(c.getValue())), size: 120 },
            { accessorKey: 'totalWithdrawn', id: 'totalWithdrawn', header: 'Withdrawn', cell: (c) => money(Number(c.getValue())), size: 100 },
            { accessorKey: 'remainingEquity', id: 'remainingEquity', header: 'Remaining eq.', cell: (c) => money(Number(c.getValue())), size: 110 },
            {
                accessorKey: 'liquidityRatio',
                id: 'liquidityRatio',
                header: 'Liq. ratio',
                cell: (c) => formatRatio(c.getValue() as number | null),
                size: 88,
            },
            {
                accessorKey: 'fundHealth',
                id: 'fundHealth',
                header: 'Fund health',
                cell: (c) => <HealthBadge status={c.getValue() as FundHealthStatus} />,
                size: 110,
            },
            {
                accessorKey: 'lastDistributionDate',
                id: 'lastDistributionDate',
                header: 'Last distribution',
                cell: (c) => (c.getValue() ? String(c.getValue()) : '—'),
                size: 120,
            },
            {
                accessorKey: 'lastUpdated',
                id: 'lastUpdated',
                header: 'Updated',
                cell: (c) => (c.getValue() ? String(c.getValue()) : '—'),
                size: 100,
            },
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
        initialState: { pagination: { pageSize: 25 } },
    });

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => ({
                investorCapital: acc.investorCapital + r.investorCapital,
                allocatedProfit: acc.allocatedProfit + r.allocatedProfit,
                investorEquity: acc.investorEquity + r.investorEquity,
                availableCash: acc.availableCash + r.availableCash,
                reservedFunds: acc.reservedFunds + r.reservedFunds,
                pendingPayables: acc.pendingPayables + r.pendingPayables,
                distributableFunds: acc.distributableFunds + r.distributableFunds,
                totalWithdrawn: acc.totalWithdrawn + r.totalWithdrawn,
            }),
            {
                investorCapital: 0,
                allocatedProfit: 0,
                investorEquity: 0,
                availableCash: 0,
                reservedFunds: 0,
                pendingPayables: 0,
                distributableFunds: 0,
                totalWithdrawn: 0,
            }
        );
    }, [rows]);

    const columnSettingsIds = useMemo(
        () =>
            columns
                .filter((c) => c.id && c.id !== 'select')
                .map((c) => ({
                    id: String(c.id),
                    label: typeof c.header === 'string' ? c.header : String(c.id),
                })),
        [columns]
    );

    if (isLoading) {
        return (
            <div className="space-y-2 animate-pulse p-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-10 rounded-lg bg-slate-200/80 dark:bg-slate-700/60" />
                ))}
            </div>
        );
    }

    if (!rows.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">No projects match your filters</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-lg">
                    Distributable funds exclude receivables and accrual profit — only liquid cash after reserves and vendor payables is withdrawable.
                </p>
            </div>
        );
    }

    const stickyProjectColIndex = 2;

    return (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/50 shadow-sm overflow-hidden">
            <div className="flex justify-end px-2 py-1 border-b border-slate-100 dark:border-slate-800 relative">
                <button type="button" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 px-2 py-1" onClick={() => setColMenuOpen((v) => !v)}>
                    Column settings
                </button>
                {colMenuOpen && (
                    <div className="absolute right-2 top-full mt-1 z-40">
                        <ColumnSettingsMenu columnIds={columnSettingsIds} visibility={columnVisibility} onChange={setColumnVisibility} />
                    </div>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1600px]">
                    <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-700">
                        {table.getHeaderGroups().map((hg) => (
                            <tr key={hg.id}>
                                {hg.headers.map((h, hi) => (
                                    <th
                                        key={h.id}
                                        className={`text-left font-semibold text-slate-600 dark:text-slate-300 px-2 py-2 whitespace-nowrap relative ${
                                            hi === stickyProjectColIndex
                                                ? 'sticky left-0 z-30 bg-slate-50/95 dark:bg-slate-900/95 border-r border-slate-200/80 dark:border-slate-700'
                                                : ''
                                        }`}
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
                                className={`border-b border-slate-100 dark:border-slate-800/80 hover:bg-indigo-500/[0.04] cursor-pointer ${ri % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-800/25' : ''}`}
                                onClick={() => onRowOpen(row.original.projectId)}
                            >
                                {row.getVisibleCells().map((cell, ci) => (
                                    <td
                                        key={cell.id}
                                        className={`px-2 py-1.5 tabular-nums text-slate-800 dark:text-slate-200 ${
                                            ci === stickyProjectColIndex ? 'sticky left-0 z-10 bg-white/95 dark:bg-slate-900/95 border-r border-slate-100 dark:border-slate-800' : ''
                                        } ${ri % 2 === 1 && ci === stickyProjectColIndex ? 'bg-slate-50/90 dark:bg-slate-800/40' : ''}`}
                                        style={{ width: cell.column.getSize() }}
                                        onClick={(e) => {
                                            if ((e.target as HTMLElement).closest('input,button,a')) e.stopPropagation();
                                        }}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </motion.tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-100/90 dark:bg-slate-800/90 text-xs text-slate-900 dark:text-slate-50 border-t-2 border-slate-200 dark:border-slate-600">
                            <td colSpan={table.getVisibleLeafColumns().length} className="px-3 py-2.5">
                                <span className="font-semibold">Totals (filtered):</span>
                                <span className="text-slate-600 dark:text-slate-300">
                                    {' '}
                                    Investor cap {money(totals.investorCapital)} · Allocated {money(totals.allocatedProfit)} · Equity {money(totals.investorEquity)} · Cash{' '}
                                    {money(totals.availableCash)} · Reserved {money(totals.reservedFunds)} · Payables {money(totals.pendingPayables)} · Distributable{' '}
                                    {money(totals.distributableFunds)} · Withdrawn {money(totals.totalWithdrawn)}
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-xs bg-slate-50/50 dark:bg-slate-900/60">
                <div className="text-slate-500">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {rows.length} rows
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600 disabled:opacity-40"
                        disabled={!table.getCanPreviousPage()}
                        onClick={() => table.previousPage()}
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600 disabled:opacity-40"
                        disabled={!table.getCanNextPage()}
                        onClick={() => table.nextPage()}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};
