import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    useAccounts,
    useCategories,
    useDispatchOnly,
    useRentalReportAppState,
} from '../../hooks/useSelectiveState';
import { useNotification } from '../../context/NotificationContext';
import { AccountType, Contact, Property, Transaction, TransactionType, Bill, AppState } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { formatCurrency } from '../../utils/numberUtils';
import { toLocalDateString } from '../../utils/dateUtils';
import { billAffectsOwnerRentalIncomeLedger } from '../../utils/rentalBillPayments';
import { resolveSystemCategoryId } from '../../services/systemEntityIds';
import { resolveOwnerForPropertyOnDate, resolveOwnerForTransaction, hasMultipleOwnersOnDate, getOwnerSharePercentageOnDate } from '../../services/propertyOwnershipService';

export type ReceiveLineKind = 'bill' | 'serviceCharge';

export interface OwnerRentalIncomeReceiveLine {
    id: string;
    kind: ReceiveLineKind;
    label: string;
    refId: string;
    propertyId: string;
    propertyName: string;
    buildingId: string;
    maxAmount: number;
}

export interface OwnerRentalIncomeReceiveModalProps {
    isOpen: boolean;
    onClose: () => void;
    owner: Contact;
    property: Property | null;
    selectedBuildingId: string;
    selectedOwnerId: string;
    selectedUnitId: string;
    reportClosingBalance: number;
}

/** Rental Income receipts linked to a bill (owner reimbursement from Receive modal). */
function sumOwnerBillReimbursementIncome(
    transactions: Transaction[],
    rentalIncomeCategoryId: string,
    ownerId: string,
    billId: string
): number {
    const bid = String(billId);
    let s = 0;
    for (const tx of transactions) {
        if (tx.type !== TransactionType.INCOME) continue;
        if (tx.categoryId !== rentalIncomeCategoryId) continue;
        if (String(tx.billId || '') !== bid) continue;
        const payer = tx.contactId || tx.ownerId;
        if (payer !== ownerId) continue;
        const a = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        if (!isNaN(a) && a > 0) s += a;
    }
    return Math.round(s * 100) / 100;
}

/**
 * Same debit attributed to the owner on Owner Rental Income ledger (OwnerLedger B3): full bill amount
 * (or shared %) when the bill affects owner/building rental income.
 */
function computeOwnerRentalBillLedgerDebitForReceive(
    bill: Bill,
    owner: Contact,
    state: AppState,
    selectedBuildingId: string,
    selectedUnitId: string,
    selectedOwnerId: string
): number {
    if (!bill.propertyId || bill.projectId) return 0;
    if (!billAffectsOwnerRentalIncomeLedger(bill, state)) return 0;
    const prop = state.properties.find((p) => p.id === bill.propertyId);
    if (!prop) return 0;
    if (selectedBuildingId !== 'all' && prop.buildingId !== selectedBuildingId) return 0;
    if (selectedUnitId !== 'all' && bill.propertyId !== selectedUnitId) return 0;

    const billDateStr = (bill.issueDate || '').slice(0, 10);
    const billOwnerId = billDateStr
        ? resolveOwnerForPropertyOnDate(state, bill.propertyId, billDateStr)
        : prop.ownerId;
    if (selectedOwnerId !== 'all' && billOwnerId !== selectedOwnerId) return 0;
    if (!billOwnerId || billOwnerId !== owner.id) return 0;

    const amount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
    if (isNaN(amount) || amount <= 0) return 0;

    if (billDateStr && hasMultipleOwnersOnDate(state, bill.propertyId, billDateStr)) {
        const pct = getOwnerSharePercentageOnDate(state, bill.propertyId, owner.id, billDateStr);
        if (pct <= 0) return 0;
        return Math.round((amount * pct) / 100) / 100;
    }

    return amount;
}

function sumOwnerSvcPayForPropertyMonth(
    transactions: Transaction[],
    ownerSvcPayCategoryId: string,
    ownerId: string,
    propertyId: string,
    monthKey: string
): number {
    let s = 0;
    for (const tx of transactions) {
        if (tx.type !== TransactionType.INCOME || tx.categoryId !== ownerSvcPayCategoryId) continue;
        if (tx.contactId !== ownerId) continue;
        if (String(tx.propertyId || '') !== String(propertyId)) continue;
        if (!tx.date?.startsWith(monthKey)) continue;
        const a = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        if (!isNaN(a) && a > 0) s += a;
    }
    return s;
}

const OwnerRentalIncomeReceiveModal: React.FC<OwnerRentalIncomeReceiveModalProps> = ({
    isOpen,
    onClose,
    owner,
    property,
    selectedBuildingId,
    selectedOwnerId,
    selectedUnitId,
    reportClosingBalance,
}) => {
    const rentalState = useRentalReportAppState();
    const accounts = useAccounts();
    const categories = useCategories();
    const dispatch = useDispatchOnly();
    const { showToast, showAlert } = useNotification();

    const [date, setDate] = useState(() => toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const rentalIncomeCategory = useMemo(
        () => categories.find((c) => c.name === 'Rental Income'),
        [categories]
    );

    const ownerSvcPayCategory = useMemo(() => {
        const rid = resolveSystemCategoryId(categories, 'sys-cat-own-svc-pay');
        return (
            (rid ? categories.find((c) => c.id === rid) : undefined) ??
            categories.find((c) => c.name === 'Owner Service Charge Payment')
        );
    }, [categories]);

    const svcIncomeCategory = useMemo(
        () => categories.find((c) => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income'),
        [categories]
    );

    const userSelectableAccounts = useMemo(
        () => accounts.filter((a) => a.type === AccountType.BANK && a.name !== 'Internal Clearing'),
        [accounts]
    );

    const accountsWithBalance = useMemo(
        () =>
            userSelectableAccounts.map((acc) => ({
                ...acc,
                name: `${acc.name} (${CURRENCY} ${formatCurrency(typeof acc.balance === 'number' ? acc.balance : Number(acc.balance) || 0)})`,
            })),
        [userSelectableAccounts]
    );

    const lines = useMemo((): OwnerRentalIncomeReceiveLine[] => {
        const rows: OwnerRentalIncomeReceiveLine[] = [];

        for (const bill of rentalState.bills || []) {
            const ledgerDebit = computeOwnerRentalBillLedgerDebitForReceive(
                bill,
                owner,
                rentalState,
                selectedBuildingId,
                selectedUnitId,
                selectedOwnerId
            );
            if (ledgerDebit <= 0.01) continue;

            const prop = rentalState.properties.find((p) => p.id === bill.propertyId);
            if (!prop) continue;

            const rentalIncId = rentalIncomeCategory?.id;
            const reimbursed = rentalIncId
                ? sumOwnerBillReimbursementIncome(rentalState.transactions, rentalIncId, owner.id, bill.id)
                : 0;
            const maxAmount = Math.max(0, Math.round((ledgerDebit - reimbursed) * 100) / 100);
            if (maxAmount <= 0.01) continue;

            rows.push({
                id: `bill:${bill.id}`,
                kind: 'bill',
                label: `Bill: ${prop.name} #${bill.billNumber || bill.id}`,
                refId: bill.id,
                propertyId: bill.propertyId!,
                propertyName: prop.name,
                buildingId: prop.buildingId,
                maxAmount,
            });
        }

        if (ownerSvcPayCategory && svcIncomeCategory) {
            const scByPropMonth = new Map<string, number>();
            for (const tx of rentalState.transactions) {
                if (tx.type !== TransactionType.INCOME || tx.categoryId !== svcIncomeCategory.id) continue;
                if (!tx.propertyId || !tx.date) continue;
                const prop = rentalState.properties.find((p) => p.id === tx.propertyId);
                if (!prop) continue;
                if (selectedBuildingId !== 'all' && prop.buildingId !== selectedBuildingId) continue;
                if (selectedUnitId !== 'all' && tx.propertyId !== selectedUnitId) continue;

                const rowOwner = resolveOwnerForTransaction(rentalState, tx) ?? prop.ownerId;
                if (rowOwner !== owner.id) continue;

                const mk = tx.date.slice(0, 7);
                const k = `${tx.propertyId}|${mk}`;
                const raw = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(raw) || raw <= 0) continue;
                scByPropMonth.set(k, (scByPropMonth.get(k) || 0) + raw);
            }

            for (const [k, scTotal] of scByPropMonth) {
                const [propertyId, monthKey] = k.split('|');
                if (!propertyId || !monthKey) continue;
                const prop = rentalState.properties.find((p) => p.id === propertyId);
                if (!prop) continue;

                const paid = sumOwnerSvcPayForPropertyMonth(
                    rentalState.transactions,
                    ownerSvcPayCategory.id,
                    owner.id,
                    propertyId,
                    monthKey
                );
                const remaining = Math.max(0, scTotal - paid);
                if (remaining <= 0.01) continue;

                rows.push({
                    id: `sc:${propertyId}:${monthKey}`,
                    kind: 'serviceCharge',
                    label: `Service charges ${monthKey} — ${prop.name}`,
                    refId: `${propertyId}|${monthKey}`,
                    propertyId,
                    propertyName: prop.name,
                    buildingId: prop.buildingId,
                    maxAmount: remaining,
                });
            }
        }

        rows.sort((a, b) => {
            const c = a.kind.localeCompare(b.kind);
            if (c !== 0) return c;
            return a.label.localeCompare(b.label);
        });
        return rows;
    }, [
        rentalState.bills,
        rentalState.transactions,
        rentalState.properties,
        rentalState.categories,
        selectedBuildingId,
        selectedOwnerId,
        selectedUnitId,
        owner.id,
        ownerSvcPayCategory,
        svcIncomeCategory,
        rentalIncomeCategory,
        rentalState,
    ]);

    useEffect(() => {
        if (!isOpen) return;
        setDate(toLocalDateString(new Date()));
        const cash = userSelectableAccounts.find((a) => a.name === 'Cash');
        setAccountId(cash?.id || userSelectableAccounts[0]?.id || '');
        setSelectedIds(new Set());
        setAmounts({});
    }, [isOpen, userSelectableAccounts]);

    const toggleLine = useCallback((id: string, line: OwnerRentalIncomeReceiveLine, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
        setAmounts((prev) => {
            const next = { ...prev };
            if (checked) next[id] = line.maxAmount.toFixed(2);
            else delete next[id];
            return next;
        });
    }, []);

    const setLineAmount = useCallback((id: string, raw: string) => {
        setAmounts((prev) => ({ ...prev, [id]: raw }));
    }, []);

    const selectedTotal = useMemo(() => {
        let s = 0;
        for (const id of selectedIds) {
            const n = parseFloat(amounts[id] || '0');
            if (!isNaN(n) && n > 0) s += n;
        }
        return s;
    }, [selectedIds, amounts]);

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (!rentalIncomeCategory) {
            await showAlert("Missing 'Rental Income' category.");
            return;
        }
        if (!ownerSvcPayCategory) {
            await showAlert("Missing 'Owner Service Charge Payment' category.");
            return;
        }
        const acc = accounts.find((a) => a.id === accountId);
        if (!acc) {
            await showAlert('Select an account to receive into.');
            return;
        }

        const ops: { line: OwnerRentalIncomeReceiveLine; amount: number }[] = [];
        for (const id of selectedIds) {
            const line = lines.find((l) => l.id === id);
            if (!line) continue;
            const n = parseFloat(amounts[id] || '0');
            if (isNaN(n) || n <= 0) continue;
            if (n > line.maxAmount + 0.01) {
                await showAlert(`Amount for "${line.label}" cannot exceed ${formatCurrency(line.maxAmount)}.`);
                return;
            }
            ops.push({ line, amount: Math.round(n * 100) / 100 });
        }

        if (ops.length === 0) {
            await showAlert('Select at least one line and enter a positive amount.');
            return;
        }

        setIsSubmitting(true);
        try {

        const ts = Date.now();
        const newTxs: Transaction[] = [];

        for (let i = 0; i < ops.length; i++) {
            const { line, amount } = ops[i];
            const suffix = ` (Ref: owner receive ${toLocalDateString(new Date())})`;
            if (line.kind === 'bill') {
                newTxs.push({
                    id: `ori-bill-${ts}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                    type: TransactionType.INCOME,
                    amount,
                    date,
                    description: `Owner reimbursement — ${line.label}${suffix}`,
                    accountId: acc.id,
                    categoryId: rentalIncomeCategory.id,
                    contactId: owner.id,
                    ownerId: owner.id,
                    buildingId: line.buildingId,
                    propertyId: line.propertyId,
                    billId: line.refId,
                });
            } else {
                newTxs.push({
                    id: `ori-sc-${ts}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                    type: TransactionType.INCOME,
                    amount,
                    date,
                    description: `Owner service charge payment — ${line.propertyName} ${line.refId.split('|')[1] || ''}${suffix}`,
                    accountId: acc.id,
                    categoryId: ownerSvcPayCategory.id,
                    contactId: owner.id,
                    ownerId: owner.id,
                    buildingId: line.buildingId,
                    propertyId: line.propertyId,
                });
            }
        }

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: newTxs });

        const grandTotal = ops.reduce((sum, o) => sum + o.amount, 0);
        showToast(`Recorded ${newTxs.length} receipt(s) totaling ${CURRENCY} ${formatCurrency(grandTotal)}.`, 'success');
        onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    const owedDisplay = Math.max(0, -reportClosingBalance);

    return (
        <Modal isOpen={isOpen} onClose={onClose} preventCloseWhile={isSubmitting} title="Receive amount from owner">
            <div className="space-y-4">
                <div className="p-4 bg-app-toolbar/40 rounded-lg border border-app-border space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                        <span className="text-app-muted">Owner</span>
                        <span className="font-semibold text-app-text text-right">{owner.name}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span className="text-app-muted">Property</span>
                        <span className="font-semibold text-app-text text-right">{property?.name ?? '— (all units in this view)'}</span>
                    </div>
                    <div className="flex justify-between gap-4 items-baseline border-t border-app-border pt-2 mt-2">
                        <span className="text-app-muted">Report closing balance</span>
                        <span className={`font-bold text-lg tabular-nums ${reportClosingBalance < 0 ? 'text-danger' : 'text-app-text'}`}>
                            {CURRENCY} {formatCurrency(reportClosingBalance)}
                        </span>
                    </div>
                    <p className="text-[11px] text-app-muted">
                        Select unpaid or partially paid bills and outstanding service-charge collections. Bill receipts use
                        Rental Income (linked to the bill); service charge receipts use Owner Service Charge Payment.
                    </p>
                </div>

                {lines.length === 0 ? (
                    <p className="text-sm text-app-muted py-2">No unpaid bills or outstanding service charge buckets match this view.</p>
                ) : (
                    <div className="border border-app-border rounded-md overflow-hidden max-h-64 overflow-y-auto">
                        <table className="min-w-full text-xs">
                            <thead className="bg-app-toolbar sticky top-0">
                                <tr>
                                    <th className="w-8 px-2 py-2" />
                                    <th className="text-left px-2 py-2 font-semibold text-app-muted">Item</th>
                                    <th className="text-right px-2 py-2 font-semibold text-app-muted">Due</th>
                                    <th className="text-right px-2 py-2 font-semibold text-app-muted w-28">Receive</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border/60">
                                {lines.map((line) => {
                                    const checked = selectedIds.has(line.id);
                                    return (
                                        <tr key={line.id} className="hover:bg-app-toolbar/30">
                                            <td className="px-2 py-1.5 align-middle">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-app-border"
                                                    aria-label={`Select ${line.label}`}
                                                    checked={checked}
                                                    onChange={(e) => toggleLine(line.id, line, e.target.checked)}
                                                />
                                            </td>
                                            <td className="px-2 py-1.5 text-app-text">
                                                <span className="text-app-muted mr-1">{line.kind === 'bill' ? 'Bill' : 'SC'}</span>
                                                {line.label}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-app-muted">
                                                {formatCurrency(line.maxAmount)}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <Input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={amounts[line.id] ?? ''}
                                                    onChange={(e) => setLineAmount(line.id, e.target.value)}
                                                    disabled={!checked}
                                                    className="py-1 text-xs"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                        <ComboBox
                            label="Receive into account"
                            items={accountsWithBalance}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select an account"
                        />
                    </div>
                    <div className="flex-grow">
                        <DatePicker label="Receipt date" value={date} onChange={(d) => setDate(toLocalDateString(d))} required />
                    </div>
                </div>

                <div className="flex justify-between items-center text-sm border-t border-app-border pt-3">
                    <span className="text-app-muted">Selected total</span>
                    <span className="font-bold text-app-text tabular-nums">
                        {CURRENCY} {formatCurrency(selectedTotal)}
                    </span>
                </div>
                {owedDisplay > 0.01 && (
                    <p className="text-[11px] text-app-muted">
                        Approx. shortfall in this view: {CURRENCY} {formatCurrency(owedDisplay)}. You may receive less or more
                        than individual line dues.
                    </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <LoadingButton type="button" onClick={() => void handleSubmit()} loading={isSubmitting} loadingText="Saving..." disabled={lines.length === 0}>
                        Save receipt(s)
                    </LoadingButton>
                </div>
            </div>
        </Modal>
    );
};

export default OwnerRentalIncomeReceiveModal;
