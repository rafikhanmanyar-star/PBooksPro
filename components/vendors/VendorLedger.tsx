
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { TransactionType } from '../../types';
import { useBills, useTransactions, useVendors, useProjects } from '../../hooks/useSelectiveState';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { exportJsonToExcel } from '../../services/exportService';
import { contractorApi } from '../../services/api/contractorApi';
import {
    prepaidAppliedToBillNotInTransactions,
    prepaidClearingDisplayDateForBill,
    VENDOR_LEDGER_MONEY_EPS,
} from '../../utils/vendorLedgerPrepaid';
import VirtualizedVendorLedgerTable from './VirtualizedVendorLedgerTable';
import {
    flattenVendorLedgerRows,
    type LedgerItem,
    type VendorLedgerSortKey,
} from './vendorLedgerTypes';

interface VendorLedgerProps {
    vendorId: string | null;
    onItemClick: (id: string, type: 'bill' | 'transaction') => void;
}

const ADVANCE_REFRESH = 'pbooks:supplier-advance-recorded';

const VendorLedger: React.FC<VendorLedgerProps> = ({ vendorId, onItemClick }) => {
    const allBills = useBills();
    const transactions = useTransactions();
    const vendors = useVendors();
    const projects = useProjects();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [sortConfig, setSortConfig] = useState<{ key: VendorLedgerSortKey; direction: 'asc' | 'desc' }>({
        key: 'date',
        direction: 'desc',
    });
    const [supplierAdvances, setSupplierAdvances] = useState<Awaited<ReturnType<typeof contractorApi.getAdvances>>>(
        []
    );

    useEffect(() => {
        let cancel = false;
        if (!vendorId) {
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
            if (d?.vendorId !== vendorId || !vendorId) return;
            contractorApi
                .getAdvances(vendorId)
                .then(setSupplierAdvances)
                .catch(() => setSupplierAdvances([]));
        };
        window.addEventListener(ADVANCE_REFRESH, onRecorded as EventListener);
        return () => window.removeEventListener(ADVANCE_REFRESH, onRecorded as EventListener);
    }, [vendorId]);

    const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name || p.id])), [projects]);

    const toggleExpand = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleSort = useCallback((key: VendorLedgerSortKey) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    }, []);

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
                valA = typeof valA === 'string' ? valA.toLowerCase() : valA ?? '';
                valB = typeof valB === 'string' ? String(valB).toLowerCase() : valB ?? '';
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

    const flatRows = useMemo(
        () => flattenVendorLedgerRows(ledgerItems, expandedIds),
        [ledgerItems, expandedIds]
    );

    const expandableBatchIds = useMemo(
        () => ledgerItems.filter((item) => item.children.length > 0).map((item) => item.id),
        [ledgerItems]
    );

    const handleExpandAllBatches = useCallback(() => {
        setExpandedIds(new Set(expandableBatchIds));
    }, [expandableBatchIds]);

    const handleCollapseAllBatches = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const handleExport = useCallback(() => {
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
    }, [vendorId, vendors, ledgerItems]);

    const handleParentRowClick = useCallback(
        (e: React.MouseEvent, item: LedgerItem) => {
            const hasChildren = item.children.length > 0;
            if (hasChildren) {
                toggleExpand(e, item.id);
                return;
            }
            if (item.type === 'supplier_advance') return;
            if (
                (item.type === 'bill' || item.type === 'transaction' || item.type === 'prepaid_apply') &&
                item.originalId
            ) {
                onItemClick(item.originalId, item.type === 'transaction' ? 'transaction' : 'bill');
            }
        },
        [toggleExpand, onItemClick]
    );

    const handleChildRowClick = useCallback(
        (childId: string) => {
            onItemClick(childId, 'transaction');
        },
        [onItemClick]
    );

    if (!vendorId) return null;

    return (
        <div className="flex flex-col h-full min-h-0">
            {supplierAdvances.length > 0 && (
                <p className="text-[11px] text-app-text bg-[color:var(--badge-partial-bg)] border border-ds-warning/30 rounded-md px-2 py-1.5 mb-2 shrink-0">
                    Prepaid advances and hybrid bill settlements show both cash payments and Supplier prepaid applied
                    lines where part of the bill was cleared from prepaid (no duplicate bank transaction).
                </p>
            )}
            {ledgerItems.length === 0 ? (
                <p className="text-app-muted text-center mt-8">No transactions or bills for this vendor.</p>
            ) : (
                <VirtualizedVendorLedgerTable
                    flatRows={flatRows}
                    ledgerItemCount={ledgerItems.length}
                    sortConfig={sortConfig}
                    expandedIds={expandedIds}
                    expandableBatchIds={expandableBatchIds}
                    onSort={handleSort}
                    onToggleExpand={toggleExpand}
                    onParentRowClick={handleParentRowClick}
                    onChildRowClick={handleChildRowClick}
                    onExpandAll={handleExpandAllBatches}
                    onCollapseAll={handleCollapseAllBatches}
                    onExport={handleExport}
                />
            )}
        </div>
    );
};

export default VendorLedger;
