
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { TransactionType } from '../../types';
import { useBills, useTransactions, useVendors, useProjects } from '../../hooks/useSelectiveState';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { exportJsonToExcel } from '../../services/exportService';
import TreeExpandCollapseControls from '../ui/TreeExpandCollapseControls';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { contractorApi } from '../../services/api/contractorApi';
import {
    prepaidAppliedToBillNotInTransactions,
    prepaidClearingDisplayDateForBill,
    VENDOR_LEDGER_MONEY_EPS,
} from '../../utils/vendorLedgerPrepaid';

interface VendorLedgerProps {
    vendorId: string | null;
    onItemClick: (id: string, type: 'bill' | 'transaction') => void;
}

type SortKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

type LedgerRowType = 'bill' | 'transaction' | 'batch_payment' | 'supplier_advance' | 'prepaid_apply';

interface LedgerChild {
    id: string;
    originalId: string;
    type: 'transaction';
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    projectLabel?: string;
}

interface LedgerItem {
    id: string;
    originalId?: string;
    type: LedgerRowType;
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    balance?: number;
    projectLabel?: string;
    children: LedgerChild[];
    /** Stable ordering when dates match (bill 0, prepaid apply 1, payment 2, advance issuance 10). */
    sortAux?: number;
}

const ADVANCE_REFRESH = 'pbooks:supplier-advance-recorded';

const VendorLedger: React.FC<VendorLedgerProps> = ({ vendorId, onItemClick }) => {
    const allBills = useBills();
    const transactions = useTransactions();
    const vendors = useVendors();
    const projects = useProjects();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'date',
        direction: 'desc',
    });
    const [supplierAdvances, setSupplierAdvances] = useState<Awaited<ReturnType<typeof contractorApi.getAdvances>>>(
        []
    );

    useEffect(() => {
        let cancel = false;
        if (!vendorId || isLocalOnlyMode()) {
            setSupplierAdvances([]);
            return () => {
                cancel = true;
            };
        }
        contractorApi
            .getAdvances(vendorId)
            .then((rows) => {
                if (!cancel) setSupplierAdvances(rows ?? []);
            })
            .catch(() => {
                if (!cancel) setSupplierAdvances([]);
            });
        return () => {
            cancel = true;
        };
    }, [vendorId]);

    useEffect(() => {
        const onRecorded = (ev: Event) => {
            const d = (ev as CustomEvent<{ vendorId?: string }>).detail;
            if (d?.vendorId !== vendorId || !vendorId || isLocalOnlyMode()) return;
            contractorApi
                .getAdvances(vendorId)
                .then(setSupplierAdvances)
                .catch(() => setSupplierAdvances([]));
        };
        window.addEventListener(ADVANCE_REFRESH, onRecorded as EventListener);
        return () => window.removeEventListener(ADVANCE_REFRESH, onRecorded as EventListener);
    }, [vendorId]);

    const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name || p.id])), [projects]);

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const handleSort = (key: SortKey) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const ledgerItems: LedgerItem[] = useMemo(() => {
        if (!vendorId) return [];

        const billRows: LedgerItem[] = allBills
            .filter((b) => b.vendorId === vendorId || (!b.vendorId && b.contactId === vendorId))
            .map((b) => ({
                id: `bill-${b.id}`,
                originalId: b.id,
                type: 'bill' as const,
                date: b.issueDate,
                particulars: `Bill #${b.billNumber}`,
                debit: 0,
                credit: b.amount,
                projectLabel: b.projectId ? projectNameById.get(b.projectId) ?? '' : '',
                children: [],
                sortAux: 0,
            }));

        const prepaidApplyRows: LedgerItem[] = [];
        for (const b of allBills) {
            if (b.vendorId !== vendorId && !(b.vendorId == null && b.contactId === vendorId)) continue;
            const prepaid = prepaidAppliedToBillNotInTransactions(b, transactions);
            if (prepaid <= VENDOR_LEDGER_MONEY_EPS) continue;
            prepaidApplyRows.push({
                id: `bill-prepaid-${b.id}`,
                originalId: b.id,
                type: 'prepaid_apply',
                date: prepaidClearingDisplayDateForBill(b, transactions),
                particulars: `Supplier prepaid applied — Bill #${b.billNumber}`,
                debit: prepaid,
                credit: 0,
                projectLabel: b.projectId ? projectNameById.get(b.projectId) ?? '' : '',
                children: [],
                sortAux: 1,
            });
        }

        const allPayments = transactions.filter(
            (t) => (t.vendorId === vendorId || (!t.vendorId && t.contactId === vendorId)) && t.type === TransactionType.EXPENSE
        );
        const paymentMap = new Map<string, Omit<LedgerItem, 'balance'>>();
        const individualPayments: LedgerItem[] = [];

        allPayments.forEach((tx) => {
            const pl = tx.projectId ? projectNameById.get(tx.projectId) ?? '' : '';
            if (tx.batchId) {
                if (!paymentMap.has(tx.batchId)) {
                    paymentMap.set(tx.batchId, {
                        id: `batch-${tx.batchId}`,
                        date: tx.date,
                        particulars: 'Bulk Payment',
                        debit: 0,
                        credit: 0,
                        type: 'batch_payment',
                        projectLabel: '',
                        children: [],
                    });
                }
                const batch = paymentMap.get(tx.batchId)!;
                batch.debit += tx.amount;
                batch.children.push({
                    id: `txn-${tx.id}`,
                    originalId: tx.id,
                    type: 'transaction',
                    date: tx.date,
                    particulars: tx.description || 'Payment',
                    debit: tx.amount,
                    credit: 0,
                    projectLabel: pl,
                });
            } else {
                individualPayments.push({
                    id: `txn-${tx.id}`,
                    originalId: tx.id,
                    type: 'transaction',
                    date: tx.date,
                    particulars: tx.description || 'Payment',
                    debit: tx.amount,
                    credit: 0,
                    projectLabel: pl,
                    children: [],
                    sortAux: 2,
                });
            }
        });

        const batchedPayments: LedgerItem[] = Array.from(paymentMap.values()).map((b) => {
            const firstProj = b.children.find((c) => c.projectLabel)?.projectLabel ?? '';
            return {
                ...b,
                particulars: `Bulk Payment (${b.children.length} items)`,
                projectLabel: firstProj || '',
                sortAux: 2,
            };
        });

        const advanceRows: LedgerItem[] = (supplierAdvances ?? []).map((a) => {
            const rem = Number(a.remainingAmount ?? 0);
            const fully = rem <= 0.015;
            let particulars = fully
                ? 'Supplier advance · Fully applied (remaining prepaid 0)'
                : 'Supplier advance (prepaid)';
            if (a.description?.trim()) {
                particulars += ` — ${a.description.trim()}`;
            }
            if (!fully) {
                particulars += ` · Open prepaid: ${CURRENCY} ${rem.toLocaleString()}`;
            }
            return {
                id: `advance-${a.id}`,
                originalId: a.id,
                type: 'supplier_advance' as const,
                date: a.advanceDate,
                particulars,
                debit: a.originalAmount,
                credit: 0,
                projectLabel: a.projectId ? projectNameById.get(a.projectId) ?? '' : '',
                children: [],
                sortAux: 10,
            };
        });

        const combined = [
            ...billRows,
            ...prepaidApplyRows,
            ...individualPayments,
            ...batchedPayments,
            ...advanceRows,
        ].sort((a, b) => {
            const key = sortConfig.key === 'balance' ? 'date' : sortConfig.key;
            let valA = a[key];
            let valB = b[key];

            if (sortConfig.key === 'date' || sortConfig.key === 'balance') {
                const tA = new Date(a.date).getTime();
                const tB = new Date(b.date).getTime();
                if (tA !== tB) {
                    valA = tA;
                    valB = tB;
                } else {
                    const sa = a.sortAux ?? 0;
                    const sb = b.sortAux ?? 0;
                    if (sa !== sb) {
                        return sortConfig.direction === 'asc' ? sa - sb : sb - sa;
                    }
                    const p = String(a.particulars).localeCompare(String(b.particulars));
                    if (p !== 0) return p;
                    valA = tA;
                    valB = tB;
                }
            } else {
                valA =
                    typeof valA === 'string' ? valA.toLowerCase() : valA ?? '';
                valB =
                    typeof valB === 'string' ? String(valB).toLowerCase() : valB ?? '';
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        let runningBalance = 0;
        return combined.map((item) => {
            runningBalance += item.credit - item.debit;
            return { ...item, balance: runningBalance };
        });
    }, [vendorId, allBills, transactions, sortConfig, supplierAdvances, projectNameById]);

    const expandableBatchIds = useMemo(
        () => ledgerItems.filter((item) => (item.children?.length ?? 0) > 0).map((item) => item.id),
        [ledgerItems]
    );

    const handleExpandAllBatches = useCallback(() => {
        setExpandedIds(new Set(expandableBatchIds));
    }, [expandableBatchIds]);

    const handleCollapseAllBatches = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const handleExport = () => {
        if (!vendorId) return;
        const vendor = vendors?.find((v) => v.id === vendorId);
        const data = ledgerItems.map((item) => ({
            Date: formatDate(item.date),
            Particulars: item.particulars,
            Project: item.projectLabel || '',
            Type:
                item.type === 'supplier_advance'
                    ? 'Advance'
                    : item.type === 'bill'
                      ? 'Bill'
                      : item.type === 'prepaid_apply'
                        ? 'Prepaid to bill'
                        : item.type === 'batch_payment'
                          ? 'Bulk pay'
                          : 'Payment',
            'Bill Amount (Credit)': item.credit,
            'Payment / advance (Debit)': item.debit,
            Balance: item.balance,
        }));
        exportJsonToExcel(data, `vendor_ledger_${vendor?.name || 'export'}.xlsx`, 'Ledger');
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const handleRowClick = (e: React.MouseEvent, item: LedgerItem) => {
        const hasChildren = item.children && item.children.length > 0;
        if (hasChildren) {
            toggleExpand(e, item.id);
            return;
        }
        if (item.type === 'supplier_advance') return;
        if ((item.type === 'bill' || item.type === 'transaction' || item.type === 'prepaid_apply') && item.originalId) {
            onItemClick(item.originalId, item.type === 'transaction' ? 'transaction' : 'bill');
        }
    };

    if (!vendorId) return null;

    return (
        <div className="flex flex-col h-full min-h-0">
            {!isLocalOnlyMode() && supplierAdvances.length > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50/90 border border-amber-100 rounded-md px-2 py-1.5 mb-2 shrink-0">
                    Prepaid advances and hybrid bill settlements show both cash payments and Supplier prepaid applied
                    lines where part of the bill was cleared from prepaid (no duplicate bank transaction).
                </p>
            )}
            {ledgerItems.length === 0 ? (
                <p className="text-gray-500 text-center mt-8">No transactions or bills for this vendor.</p>
            ) : (
                <div className="flow-root flex-1 min-h-0 overflow-auto -mt-1">
                    <div className="-mx-2 overflow-x-auto">
                        <div className="inline-block min-w-full align-middle">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th
                                            onClick={() => handleSort('date')}
                                            scope="col"
                                            className="py-2 pl-2 pr-2 text-left text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                        >
                                            Date <SortIcon column="date" />
                                        </th>
                                        <th
                                            onClick={() => handleSort('particulars')}
                                            scope="col"
                                            className="px-2 py-2 text-left text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none"
                                        >
                                            Particulars <SortIcon column="particulars" />
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-2 py-2 text-left text-xs font-semibold text-slate-600 select-none max-w-[8rem]"
                                        >
                                            Project
                                        </th>
                                        <th
                                            onClick={() => handleSort('credit')}
                                            scope="col"
                                            className="px-2 py-2 text-right text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                        >
                                            Bills (Cr) <SortIcon column="credit" />
                                        </th>
                                        <th
                                            onClick={() => handleSort('debit')}
                                            scope="col"
                                            className="px-2 py-2 text-right text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                        >
                                            Pay / Adv (Dr) <SortIcon column="debit" />
                                        </th>
                                        <th
                                            scope="col"
                                            className="py-2 pl-2 pr-1 text-right text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                            onClick={() => handleSort('balance')}
                                        >
                                            Balance <SortIcon column="balance" />
                                        </th>
                                        <th scope="col" className="py-2 pl-1 pr-2">
                                            <div className="flex items-center justify-end gap-1">
                                                <TreeExpandCollapseControls
                                                    variant="slate"
                                                    allExpandableIds={expandableBatchIds}
                                                    expandedIds={expandedIds}
                                                    onExpandAll={handleExpandAllBatches}
                                                    onCollapseAll={handleCollapseAllBatches}
                                                    visible={expandableBatchIds.length > 0}
                                                />
                                                <button
                                                    onClick={handleExport}
                                                    disabled={ledgerItems.length === 0}
                                                    className="flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors disabled:opacity-50"
                                                    title="Export to Excel"
                                                >
                                                    <span className="w-3.5 h-3.5">{ICONS.export}</span>
                                                </button>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {ledgerItems.map((item) => {
                                        const hasChildren = item.children && item.children.length > 0;
                                        const isExpanded = expandedIds.has(item.id);
                                        const cursorClass =
                                            item.type === 'supplier_advance'
                                                ? 'cursor-default'
                                                : hasChildren ||
                                                    item.type === 'bill' ||
                                                    item.type === 'transaction' ||
                                                    item.type === 'prepaid_apply'
                                                  ? 'cursor-pointer'
                                                  : 'cursor-pointer';

                                        return (
                                            <React.Fragment key={item.id}>
                                                <tr
                                                    className={`hover:bg-slate-50 transition-colors ${cursorClass} ${
                                                        item.type === 'supplier_advance'
                                                            ? 'bg-amber-50/50'
                                                            : item.type === 'prepaid_apply'
                                                              ? 'bg-teal-50/60'
                                                              : ''
                                                    } ${isExpanded ? 'bg-slate-50' : ''}`}
                                                    onClick={(e) => handleRowClick(e, item)}
                                                >
                                                    <td className="whitespace-nowrap py-2 pl-2 pr-2 text-xs text-slate-700 flex items-center gap-1.5">
                                                        {hasChildren && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => toggleExpand(e, item.id)}
                                                                className="text-slate-400 hover:text-slate-600 focus:outline-none"
                                                            >
                                                                <div
                                                                    className={`w-3.5 h-3.5 transform transition-transform ${
                                                                        isExpanded ? 'rotate-90' : ''
                                                                    }`}
                                                                >
                                                                    {ICONS.chevronRight}
                                                                </div>
                                                            </button>
                                                        )}
                                                        <span className={!hasChildren ? 'pl-5' : ''}>
                                                            {formatDate(item.date)}
                                                        </span>
                                                    </td>
                                                    <td
                                                        className="whitespace-nowrap px-2 py-2 text-xs text-slate-600 max-w-xs truncate"
                                                        title={item.particulars}
                                                    >
                                                        {item.particulars}
                                                    </td>
                                                    <td
                                                        className="whitespace-nowrap px-2 py-2 text-xs text-slate-500 max-w-[8rem] truncate"
                                                        title={item.projectLabel}
                                                    >
                                                        {item.projectLabel || '—'}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-xs text-right text-slate-600">
                                                        {item.credit > 0 ? (item.credit || 0).toLocaleString() : '-'}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-xs text-right text-slate-600">
                                                        {item.debit > 0 ? (item.debit || 0).toLocaleString() : '-'}
                                                    </td>
                                                    <td
                                                        className={`whitespace-nowrap py-2 pl-2 pr-1 text-right text-xs font-semibold ${
                                                            (item.balance ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'
                                                        }`}
                                                    >
                                                        {(item.balance ?? 0).toLocaleString()}
                                                    </td>
                                                    <td className="py-2 pl-1 pr-2 w-8"></td>
                                                </tr>
                                                {isExpanded &&
                                                    hasChildren &&
                                                    item.children.map((child: LedgerChild) => (
                                                        <tr
                                                            key={child.id}
                                                            className="bg-slate-50/70 text-xs hover:bg-slate-100 cursor-pointer"
                                                            onClick={() => onItemClick(child.originalId, child.type)}
                                                        >
                                                            <td className="whitespace-nowrap py-1.5 pl-9 pr-2 text-slate-500">
                                                                {formatDate(child.date)}
                                                            </td>
                                                            <td
                                                                className="whitespace-nowrap px-2 py-1.5 text-slate-500 italic max-w-xs truncate"
                                                                title={child.particulars}
                                                            >
                                                                {child.particulars}
                                                            </td>
                                                            <td
                                                                className="whitespace-nowrap px-2 py-1.5 text-slate-500 max-w-[8rem] truncate"
                                                                title={child.projectLabel}
                                                            >
                                                                {child.projectLabel || '—'}
                                                            </td>
                                                            <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-400">
                                                                -
                                                            </td>
                                                            <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-500">
                                                                {(child.debit || 0).toLocaleString()}
                                                            </td>
                                                            <td className="whitespace-nowrap py-1.5 pl-2 pr-1 text-right text-slate-400"></td>
                                                            <td className="py-1.5 pl-1 pr-2 w-8"></td>
                                                        </tr>
                                                    ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorLedger;
