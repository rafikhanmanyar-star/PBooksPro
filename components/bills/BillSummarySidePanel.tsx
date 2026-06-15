import React, { useEffect, useMemo, useState } from 'react';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { CURRENCY } from '../../constants';
import { TransactionType, type Bill, type Transaction } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import {
    getEffectiveBillPaymentDisplay,
    getPaymentTransactionsForRentalBill,
} from '../../utils/rentalBillPayments';
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

export type BillSidebarPreview = {
    billNumber?: string;
    amount: number;
    issueDate?: string;
    dueDate?: string;
    description?: string;
    status?: string;
    vendorName?: string;
    projectName?: string;
    buildingName?: string;
    propertyName?: string;
    contractNumber?: string;
    contractName?: string;
    contractRemaining?: number | null;
    allocationLabel?: string;
    expenseLineItems?: Array<{ name: string; amount: number }>;
    paidAmount?: number;
    isDraft?: boolean;
};

export interface BillSummarySidePanelProps {
    billId?: string;
    preview?: BillSidebarPreview | null;
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

function resolveBillInfo(
    bill: Bill | undefined,
    preview: BillSidebarPreview | null | undefined,
    lookups: {
        vendorName?: string;
        projectName?: string;
        buildingName?: string;
        propertyName?: string;
        contractNumber?: string;
        contractName?: string;
        expenseLineItems?: Array<{ name: string; amount: number }>;
    }
) {
    if (!bill && !preview) return null;

    const amount =
        preview?.amount ??
        (bill != null
            ? typeof bill.amount === 'number'
                ? bill.amount
                : parseFloat(String(bill.amount ?? 0)) || 0
            : 0);

    return {
        billNumber: preview?.billNumber ?? bill?.billNumber,
        amount,
        issueDate: preview?.issueDate ?? bill?.issueDate,
        dueDate: preview?.dueDate ?? bill?.dueDate,
        description: preview?.description ?? bill?.description,
        status: preview?.status ?? bill?.status ?? (preview?.isDraft ? 'Draft' : 'Unpaid'),
        vendorName: preview?.vendorName ?? lookups.vendorName,
        projectName: preview?.projectName ?? lookups.projectName,
        buildingName: preview?.buildingName ?? lookups.buildingName,
        propertyName: preview?.propertyName ?? lookups.propertyName,
        contractNumber: preview?.contractNumber ?? lookups.contractNumber,
        contractName: preview?.contractName ?? lookups.contractName,
        contractRemaining: preview?.contractRemaining ?? null,
        allocationLabel: preview?.allocationLabel,
        expenseLineItems:
            preview?.expenseLineItems && preview.expenseLineItems.length > 0
                ? preview.expenseLineItems
                : lookups.expenseLineItems ?? [],
        isDraft: preview?.isDraft ?? !bill?.id,
    };
}

const BillSummarySidePanel: React.FC<BillSummarySidePanelProps> = ({
    billId,
    preview,
    className = '',
    includeRentalOrphanPayments = false,
}) => {
    const state = useStateSelector((s) => s);
    const { bills, transactions, accounts, categories, properties, vendors, contacts, projects, buildings, contracts } =
        state;

    const savedBill = useMemo(
        () => (billId ? bills.find((b) => b.id === billId) : undefined),
        [bills, billId]
    );

    const lookups = useMemo(() => {
        const bill = savedBill;
        const vendorId = bill?.vendorId ?? bill?.contactId;
        const vendor =
            vendors?.find((v) => v.id === vendorId) ?? contacts?.find((c) => c.id === vendorId);
        const project = bill?.projectId ? projects.find((p) => p.id === bill.projectId) : undefined;
        const building = bill?.buildingId ? buildings.find((b) => b.id === bill.buildingId) : undefined;
        const property = bill?.propertyId ? properties.find((p) => p.id === bill.propertyId) : undefined;
        const contract = bill?.contractId ? contracts.find((c) => c.id === bill.contractId) : undefined;
        const expenseLineItems =
            bill?.expenseCategoryItems?.map((item) => ({
                name: categories.find((c) => c.id === item.categoryId)?.name ?? 'Category',
                amount: item.netValue ?? 0,
            })) ?? [];

        return {
            vendorName: vendor?.name,
            projectName: project?.name,
            buildingName: building?.name,
            propertyName: property?.name,
            contractNumber: contract?.contractNumber,
            contractName: contract?.name,
            expenseLineItems,
        };
    }, [savedBill, vendors, contacts, projects, buildings, properties, contracts, categories]);

    const billInfo = useMemo(
        () => resolveBillInfo(savedBill, preview, lookups),
        [savedBill, preview, lookups]
    );

    const [apiSettlements, setApiSettlements] = useState<VendorBillSettlementRow[] | null>(() =>
        null
    );

    useEffect(() => {
        if (!billId ) {
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
    }, [billId, savedBill?.version, savedBill?.paidAmount, savedBill?.description]);

    const linkedPayments = useMemo(() => {
        if (!billId) return [];
        const id = String(billId);
        const explicit = transactions.filter((t) => {
            if (t.type !== TransactionType.EXPENSE && t.type !== TransactionType.INCOME) return false;
            return txBillId(t) === id;
        });
        if (includeRentalOrphanPayments && savedBill) {
            const rentalMatched = getPaymentTransactionsForRentalBill(
                transactions,
                savedBill,
                categories,
                properties
            );
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
    }, [transactions, billId, includeRentalOrphanPayments, savedBill, categories, properties]);

    const prepaidAppliedLines = useMemo((): PrepaidAppliedLine[] => {
        if (!savedBill) return [];
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
        return prepaidLinesFromDescription(savedBill);
    }, [savedBill, apiSettlements]);

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
        const billAmount = billInfo?.amount ?? preview?.amount ?? 0;
        if (savedBill) {
            const eff = getEffectiveBillPaymentDisplay(savedBill, transactions);
            const paidAmount = eff.paidAmount;
            const balance = Math.max(0, billAmount - paidAmount);
            let status = eff.status;
            if (preview) {
                if (paidAmount <= 0.01) status = preview.isDraft ? 'Draft' : 'Unpaid';
                else if (balance <= 0.01) status = 'Paid';
                else status = 'Partially Paid';
            }
            return { billAmount, paidAmount, balance, status };
        }
        const paidAmount = preview?.paidAmount ?? 0;
        return {
            billAmount,
            paidAmount,
            balance: Math.max(0, billAmount - paidAmount),
            status: preview?.isDraft ? 'Draft' : preview?.status ?? 'Unpaid',
        };
    }, [savedBill, transactions, billInfo, preview]);

    const accountName = (accountId: string) =>
        accounts.find((a) => a.id === accountId)?.name ?? 'Account';

    const isPreview = !billId;
    const settlementsLoading = billId != null && apiSettlements === null;

    const statusTone =
        display.status === 'Paid'
            ? 'text-ds-success bg-ds-success/10'
            : display.status === 'Overdue'
              ? 'text-ds-danger bg-ds-danger/10'
              : display.status === 'Partially Paid' || display.status === 'Partial'
                ? 'text-ds-warning bg-[color:var(--badge-partial-bg)]'
                : display.status === 'Draft'
                  ? 'text-primary bg-primary/10'
                  : 'text-app-muted bg-app-toolbar';

    if (!billInfo) {
        return (
            <aside
                className={`flex flex-col border-t lg:border-t-0 lg:border-l border-app-border bg-app-toolbar/25 p-4 text-sm text-app-muted ${className}`}
            >
                <p>Enter bill details to see a live summary here.</p>
            </aside>
        );
    }

    return (
        <aside
            className={`flex flex-col border-t lg:border-t-0 lg:border-l border-app-border bg-app-toolbar/20 min-h-[180px] lg:min-h-0 ${className}`}
        >
            <div className="p-4 border-b border-app-border/80 bg-app-card/40">
                <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider">Bill information</h3>
                <p className="text-[11px] text-app-muted mt-1">
                    {isPreview
                        ? 'Live summary while you create or edit this bill.'
                        : 'Saved bill details and linked payment activity.'}
                </p>
            </div>

            <div className="p-4 space-y-3 border-b border-app-border/60 text-sm">
                <div>
                    <p className="font-mono text-[10px] text-app-muted">
                        {billInfo.billNumber?.trim() ? `#${billInfo.billNumber}` : 'New bill'}
                    </p>
                    <p className="font-semibold text-app-text leading-tight mt-0.5">
                        {billInfo.vendorName?.trim() || '—'}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                    {billInfo.allocationLabel ? (
                        <div>
                            <span className="text-app-muted block uppercase tracking-wide text-[10px]">Allocation</span>
                            <span className="text-app-text font-medium">{billInfo.allocationLabel}</span>
                        </div>
                    ) : null}
                    {billInfo.projectName ? (
                        <div>
                            <span className="text-app-muted block uppercase tracking-wide text-[10px]">Project</span>
                            <span className="text-app-text font-medium">{billInfo.projectName}</span>
                        </div>
                    ) : null}
                    {billInfo.buildingName ? (
                        <div>
                            <span className="text-app-muted block uppercase tracking-wide text-[10px]">Building</span>
                            <span className="text-app-text font-medium">{billInfo.buildingName}</span>
                        </div>
                    ) : null}
                    {billInfo.propertyName ? (
                        <div>
                            <span className="text-app-muted block uppercase tracking-wide text-[10px]">Property</span>
                            <span className="text-app-text font-medium">{billInfo.propertyName}</span>
                        </div>
                    ) : null}
                    {billInfo.contractNumber ? (
                        <div className="col-span-2">
                            <span className="text-app-muted block uppercase tracking-wide text-[10px]">Contract</span>
                            <span className="text-app-text font-medium">
                                {billInfo.contractNumber}
                                {billInfo.contractName ? ` — ${billInfo.contractName}` : ''}
                            </span>
                        </div>
                    ) : null}
                    {billInfo.issueDate ? (
                        <div>
                            <span className="text-app-muted block uppercase tracking-wide text-[10px]">Issue date</span>
                            <span className="text-app-text font-medium">{formatDate(billInfo.issueDate)}</span>
                        </div>
                    ) : null}
                    {billInfo.dueDate ? (
                        <div>
                            <span className="text-app-muted block uppercase tracking-wide text-[10px]">Due date</span>
                            <span className="text-app-text font-medium">{formatDate(billInfo.dueDate)}</span>
                        </div>
                    ) : null}
                </div>

                {billInfo.expenseLineItems.length > 0 ? (
                    <div className="pt-2 border-t border-app-border/60 space-y-1.5">
                        <span className="text-[10px] font-bold text-app-muted uppercase tracking-wide">Line items</span>
                        <ul className="space-y-1">
                            {billInfo.expenseLineItems.slice(0, 5).map((line, idx) => (
                                <li key={`${line.name}-${idx}`} className="flex justify-between gap-2 text-xs">
                                    <span className="text-app-muted truncate">{line.name}</span>
                                    <span className="font-medium tabular-nums text-app-text shrink-0">
                                        {CURRENCY} {line.amount.toLocaleString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {billInfo.expenseLineItems.length > 5 ? (
                            <p className="text-[10px] text-app-muted">
                                +{billInfo.expenseLineItems.length - 5} more line items
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {billInfo.contractRemaining != null ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs">
                        <span className="text-app-muted block text-[10px] uppercase">Contract remaining</span>
                        <span className="font-bold tabular-nums text-app-text">
                            {CURRENCY} {billInfo.contractRemaining.toLocaleString()}
                        </span>
                    </div>
                ) : null}

                {billInfo.description?.trim() ? (
                    <p className="text-[11px] text-app-muted leading-relaxed border-t border-app-border/60 pt-2 line-clamp-3">
                        {billInfo.description.trim()}
                    </p>
                ) : null}
            </div>

            <div className="p-4 space-y-3 border-b border-app-border/60">
                <h4 className="text-xs font-semibold text-app-muted uppercase tracking-wider">Payments & balance</h4>
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
                    <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-md ${statusTone}`}>
                        {display.status}
                    </span>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <h4 className="text-xs font-semibold text-app-text">Recent transactions</h4>
                {isPreview ? (
                    <p className="text-xs text-app-muted leading-relaxed">
                        Save the bill first, then record payments from the bills list. Linked payments will appear here
                        automatically.
                    </p>
                ) : settlementsLoading ? (
                    <p className="text-[11px] text-app-muted">Loading prepaid settlement details…</p>
                ) : recentLines.length === 0 ? (
                    <p className="text-xs text-app-muted leading-relaxed">
                        No payments are linked to this bill yet. Record a payment from the list or use Pay bill — links
                        appear here automatically.
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

export default BillSummarySidePanel;
