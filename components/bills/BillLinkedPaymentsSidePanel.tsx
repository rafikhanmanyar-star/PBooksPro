import React, { useEffect, useMemo, useState } from 'react';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { CURRENCY } from '../../constants';
import { type Bill, type Transaction } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import {
    getEffectiveBillPaymentDisplay,
    getPaymentTransactionsForRentalBill,
    isBillSettlementLedgerTransaction,
} from '../../utils/rentalBillPayments';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { contractorApi, type VendorBillSettlementRow } from '../../services/api/contractorApi';
import { parsePrepaidAdvanceAmountsFromBillDescription } from '../../utils/supplierPrepaidPl';

function txBillId(tx: { billId?: string; bill_id?: string }): string {
    return String(tx.billId ?? tx.bill_id ?? '');
}

type PrepaidAppliedLine = {
    id: string;
    date: string;
    amount: number;
    description: string;
};

type RecentLine =
    | { kind: 'transaction'; tx: Transaction }
    | { kind: 'prepaid'; line: PrepaidAppliedLine };

export interface BillLinkedPaymentsSidePanelProps {
    billId: string;
    className?: string;
    /** Rental bills: also show expense payments matched by category / reference when `bill_id` was missing. */
    includeRentalOrphanPayments?: boolean;
}

function prepaidLinesFromDescription(bill: Bill): PrepaidAppliedLine[] {
    const amounts = parsePrepaidAdvanceAmountsFromBillDescription(bill.description);
    return amounts.map((amount, i) => ({
        id: `prepaid-desc-${bill.id}-${i}`,
        date: bill.issueDate,
        amount,
        description:
            'Supplier prepaid advance (from bill payment record). No separate bank/cash ledger line — clearing posted via journal.',
    }));
}

const BillLinkedPaymentsSidePanel: React.FC<BillLinkedPaymentsSidePanelProps> = ({
    billId,
    className = '',
    includeRentalOrphanPayments = false,
}) => {
    const state = useStateSelector((s) => s);
    const { bills, transactions, accounts, categories, properties } = state;

    const bill = useMemo(() => bills.find((b) => b.id === billId), [bills, billId]);

    const [apiSettlements, setApiSettlements] = useState<VendorBillSettlementRow[] | null>(() =>
        isLocalOnlyMode() ? [] : null
    );

    useEffect(() => {
        if (!billId || isLocalOnlyMode()) {
            if (isLocalOnlyMode()) setApiSettlements([]);
            return;
        }
        let cancelled = false;
        setApiSettlements(null);
        contractorApi
            .listVendorBillSettlements([billId])
            .then((rows) => {
                if (!cancelled) setApiSettlements(rows.filter((r) => r.billId === billId));
            })
            .catch(() => {
                if (!cancelled) setApiSettlements([]);
            });
        return () => {
            cancelled = true;
        };
    }, [billId, bill?.version, bill?.paidAmount, bill?.description]);

    const linkedPayments = useMemo(() => {
        const id = String(billId);
        const explicit = transactions.filter((t) => {
            if (!isBillSettlementLedgerTransaction(t)) return false;
            return txBillId(t) === id;
        });
        if (includeRentalOrphanPayments && bill) {
            const rentalMatched = getPaymentTransactionsForRentalBill(transactions, bill, categories, properties);
            const map = new Map<string, Transaction>();
            for (const t of explicit) map.set(t.id, t);
            for (const t of rentalMatched) {
                if (!map.has(t.id)) map.set(t.id, t);
            }
            return [...map.values()].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
        }
        return explicit.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, billId, includeRentalOrphanPayments, bill, categories, properties]);

    const prepaidAppliedLines = useMemo((): PrepaidAppliedLine[] => {
        if (!bill) return [];
        if (isLocalOnlyMode()) {
            return prepaidLinesFromDescription(bill);
        }
        if (apiSettlements === null) {
            return [];
        }
        if (apiSettlements.length > 0) {
            const out: PrepaidAppliedLine[] = [];
            for (const s of apiSettlements) {
                const adv = s.adjustments.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                if (adv > 0.015) {
                    out.push({
                        id: `prepaid-je-${s.journalEntryId}`,
                        date: s.entryDate,
                        amount: adv,
                        description:
                            'Supplier prepaid advance applied (journal clearing). No bank/cash expense line for this portion.',
                    });
                }
            }
            return out;
        }
        return prepaidLinesFromDescription(bill);
    }, [bill, apiSettlements]);

    const recentLines = useMemo((): RecentLine[] => {
        const txLines: RecentLine[] = linkedPayments.map((tx) => ({ kind: 'transaction', tx }));
        const prep: RecentLine[] = prepaidAppliedLines.map((line) => ({ kind: 'prepaid', line }));
        const all = [...txLines, ...prep];
        return all.sort((a, b) => {
            const da = a.kind === 'transaction' ? a.tx.date : a.line.date;
            const db = b.kind === 'transaction' ? b.tx.date : b.line.date;
            return new Date(db).getTime() - new Date(da).getTime();
        });
    }, [linkedPayments, prepaidAppliedLines]);

    const display = useMemo(() => {
        if (!bill) {
            return { paidAmount: 0, balance: 0, status: '—' as string, billAmount: 0 };
        }
        const eff = getEffectiveBillPaymentDisplay(bill, transactions);
        const billAmount =
            typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0)) || 0;
        return { ...eff, billAmount };
    }, [bill, transactions]);

    const accountName = (accountId: string) =>
        accounts.find((a) => a.id === accountId)?.name ?? 'Account';

    if (!bill) {
        return (
            <aside
                className={`flex flex-col border-t lg:border-t-0 lg:border-l border-app-border bg-app-toolbar/25 p-4 text-sm text-app-muted ${className}`}
            >
                <p>Bill not found in the current workspace.</p>
            </aside>
        );
    }

    const statusTone =
        display.status === 'Paid'
            ? 'text-ds-success bg-ds-success/10'
            : display.status === 'Overdue'
              ? 'text-ds-danger bg-ds-danger/10'
              : display.status === 'Partially Paid'
                ? 'text-amber-800 bg-amber-500/10'
                : 'text-app-muted bg-app-toolbar';

    const settlementsLoading = !isLocalOnlyMode() && apiSettlements === null;

    return (
        <aside
            className={`flex flex-col border-t lg:border-t-0 lg:border-l border-app-border bg-app-toolbar/20 min-h-[180px] lg:min-h-0 ${className}`}
        >
            <div className="p-4 border-b border-app-border/80 bg-app-card/40">
                <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider">Payments & balance</h3>
                <p className="text-[11px] text-app-muted mt-1">
                    {includeRentalOrphanPayments
                        ? 'Payments linked to this bill or matched as rental bill payments, plus prepaid advance applied to the bill (newest first).'
                        : 'Bank/cash payments linked to this bill, plus supplier prepaid advance cleared in settlement (newest first).'}
                </p>
            </div>

            <div className="p-4 space-y-3 border-b border-app-border/60">
                <div className="flex justify-between gap-2 text-sm">
                    <span className="text-app-muted">Bill amount</span>
                    <span className="font-semibold text-app-text tabular-nums">
                        {CURRENCY} {display.billAmount.toLocaleString()}
                    </span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                    <span className="text-app-muted">Paid (total)</span>
                    <span className="font-semibold text-ds-success tabular-nums">
                        {CURRENCY} {display.paidAmount.toLocaleString()}
                    </span>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                    <span className="text-app-muted">Remaining</span>
                    <span className="font-semibold text-primary tabular-nums">
                        {CURRENCY} {display.balance.toLocaleString()}
                    </span>
                </div>
                <div className="pt-1">
                    <span
                        className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-md ${statusTone}`}
                    >
                        {display.status}
                    </span>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <h4 className="text-xs font-semibold text-app-text">Recent transactions</h4>
                {settlementsLoading && (
                    <p className="text-[11px] text-app-muted">Loading prepaid settlement details…</p>
                )}
                {recentLines.length === 0 && !settlementsLoading ? (
                    <p className="text-xs text-app-muted leading-relaxed">
                        No payments are linked to this bill yet. Record a payment from the list or use Pay bill — links
                        appear here automatically. If you settled with supplier prepaid, that portion appears here after
                        the bill refreshes.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {recentLines.map((row) =>
                            row.kind === 'transaction' ? (
                                <li
                                    key={row.tx.id}
                                    className="rounded-lg border border-app-border bg-app-card p-2.5 shadow-ds-card text-xs"
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="text-app-muted whitespace-nowrap">
                                            {formatDate(row.tx.date)}
                                        </span>
                                        <span className="font-bold text-app-text tabular-nums">
                                            {CURRENCY}{' '}
                                            {(
                                                typeof row.tx.amount === 'number'
                                                    ? row.tx.amount
                                                    : parseFloat(String(row.tx.amount)) || 0
                                            ).toLocaleString()}
                                        </span>
                                    </div>
                                    <div
                                        className="mt-1 text-[11px] text-app-muted truncate"
                                        title={row.tx.description}
                                    >
                                        {row.tx.description || '—'}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-app-toolbar text-app-muted">
                                            {row.tx.type}
                                        </span>
                                        <span
                                            className="text-[11px] text-app-muted truncate"
                                            title={accountName(row.tx.accountId)}
                                        >
                                            {accountName(row.tx.accountId)}
                                        </span>
                                    </div>
                                </li>
                            ) : (
                                <li
                                    key={row.line.id}
                                    className="rounded-lg border border-violet-200/80 bg-violet-50/60 dark:border-violet-500/30 dark:bg-violet-950/20 p-2.5 shadow-ds-card text-xs"
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="text-app-muted whitespace-nowrap">
                                            {formatDate(row.line.date)}
                                        </span>
                                        <span className="font-bold text-app-text tabular-nums">
                                            {CURRENCY} {row.line.amount.toLocaleString()}
                                        </span>
                                    </div>
                                    <div
                                        className="mt-1 text-[11px] text-app-muted"
                                        title={row.line.description}
                                    >
                                        {row.line.description}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-200/70 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200">
                                            Prepaid advance
                                        </span>
                                        <span className="text-[11px] text-app-muted">Journal / prepaid balance</span>
                                    </div>
                                </li>
                            )
                        )}
                    </ul>
                )}
            </div>
        </aside>
    );
};

export default BillLinkedPaymentsSidePanel;
