
import React, { useState, useEffect, useMemo } from 'react';
import {
    useAccounts,
    useBills,
    useBuildings,
    useCategories,
    useContacts,
    useDispatchOnly,
    useProperties,
    useRentalAgreements,
} from '../../hooks/useSelectiveState';
import { useNotification } from '../../context/NotificationContext';
import { InvoiceStatus, Transaction, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Select from '../ui/Select';
import { CURRENCY } from '../../constants';
import { resolveSystemCategoryId } from '../../services/systemEntityIds';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { getExpenseBearerType } from '../../utils/rentalBillPayments';

function fmtMoney(n: number): string {
    return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface OwnerBearerBillRow {
    id: string;
    billNumber: string;
    propertyName: string;
    /** Owner-bearer (property) vs building-bearer (shared building cost). */
    allocation: 'Owner' | 'Building';
    issueDate: string;
    amount: number;
    paid: number;
    balance: number;
}

const ReceiveFromOwnerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    ownerId: string;
    ownerName: string;
    suggestedAmount: number;
}> = ({ isOpen, onClose, ownerId, ownerName, suggestedAmount }) => {
    const properties = useProperties();
    const buildings = useBuildings();
    const bills = useBills();
    const rentalAgreements = useRentalAgreements();
    const accounts = useAccounts();
    const categories = useCategories();
    const dispatch = useDispatchOnly();
    const { showToast, showAlert } = useNotification();

    const [amount, setAmount] = useState('');
    const [date, setDate] = useState('');
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const propertyById = useMemo(
        () => new Map(properties.map((p) => [p.id, p])),
        [properties]
    );

    const buildingById = useMemo(
        () => new Map(buildings.map((b) => [b.id, b])),
        [buildings]
    );

    const ownerBearerBillRows = useMemo((): OwnerBearerBillRow[] => {
        const ownerProps = properties.filter((p) => p.ownerId === ownerId);
        const propIds = new Set(ownerProps.map((p) => p.id));
        const ownerBuildingIds = new Set(
            ownerProps.map((p) => p.buildingId).filter((id): id is string => !!id && id.trim() !== '')
        );
        if (propIds.size === 0 && ownerBuildingIds.size === 0) return [];

        const raState = { rentalAgreements: rentalAgreements };
        const rows: OwnerBearerBillRow[] = [];

        for (const b of bills) {
            if (b.status === InvoiceStatus.DRAFT) continue;

            const bearer = getExpenseBearerType(b, raState);
            if (bearer === 'tenant') continue;

            const amt = Number(b.amount) || 0;
            const paid = Number(b.paidAmount) || 0;
            const balance = Math.max(0, amt - paid);

            if (bearer === 'owner') {
                if (!b.propertyId || !propIds.has(b.propertyId)) continue;
                const prop = propertyById.get(b.propertyId);
                rows.push({
                    id: b.id,
                    billNumber: b.billNumber || b.id,
                    propertyName: prop?.name ?? '—',
                    allocation: 'Owner',
                    issueDate: b.issueDate || '',
                    amount: amt,
                    paid,
                    balance,
                });
                continue;
            }

            if (bearer === 'building') {
                if (!b.buildingId || !ownerBuildingIds.has(b.buildingId)) continue;
                if (b.propertyId && !propIds.has(b.propertyId)) continue;

                const building = buildingById.get(b.buildingId);
                let propertyName: string;
                if (b.propertyId && propIds.has(b.propertyId)) {
                    propertyName = propertyById.get(b.propertyId)?.name ?? building?.name ?? '—';
                } else {
                    propertyName = building ? `Building: ${building.name}` : 'Building';
                }

                rows.push({
                    id: b.id,
                    billNumber: b.billNumber || b.id,
                    propertyName,
                    allocation: 'Building',
                    issueDate: b.issueDate || '',
                    amount: amt,
                    paid,
                    balance,
                });
            }
        }

        rows.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
        return rows;
    }, [bills, properties, buildings, rentalAgreements, ownerId, propertyById, buildingById]);

    const billTotals = useMemo(() => {
        return ownerBearerBillRows.reduce(
            (acc, r) => ({
                amount: acc.amount + r.amount,
                paid: acc.paid + r.paid,
                balance: acc.balance + r.balance,
            }),
            { amount: 0, paid: 0, balance: 0 }
        );
    }, [ownerBearerBillRows]);

    const accountOptions = useMemo(() => {
        return accounts.filter((a) => a.type === 'Bank' || a.type === 'Cash' || a.name === 'Cash');
    }, [accounts]);

    useEffect(() => {
        if (isOpen) {
            setAmount(Number.isFinite(suggestedAmount) ? suggestedAmount.toFixed(2) : '0');
            setDate(toLocalDateString(new Date()));
            const cashAccount = accounts.find((a) => a.name === 'Cash');
            setAccountId(cashAccount?.id || accountOptions[0]?.id || '');
            setReference('');
        }
    }, [isOpen, suggestedAmount, accounts, accountOptions]);

    const vacantProperties = useMemo(() => {
        return properties
            .filter((p) => p.ownerId === ownerId && (p.monthlyServiceCharge || 0) > 0)
            .map((p) => p.name);
    }, [properties, ownerId]);

    const handleSubmit = async () => {
        if (isSubmitting) return;
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert('Please enter a valid positive amount.');
            return;
        }

        if (!date) {
            await showAlert('Please select a valid date.');
            return;
        }

        if (!accountId) {
            await showAlert('Please select an account.');
            return;
        }

        const ownSvcResolved = resolveSystemCategoryId(categories, 'sys-cat-own-svc-pay');
        let ownerSvcPayCategory =
            (ownSvcResolved ? categories.find((c) => c.id === ownSvcResolved) : undefined) ??
            categories.find((c) => c.name === 'Owner Service Charge Payment');

        if (!ownerSvcPayCategory) {
            ownerSvcPayCategory = {
                id: ownSvcResolved ?? 'sys-cat-own-svc-pay',
                name: 'Owner Service Charge Payment',
                type: TransactionType.INCOME,
                isPermanent: true,
                isRental: true,
            };
            dispatch({ type: 'ADD_CATEGORY', payload: ownerSvcPayCategory });
        }

        const baseTimestamp = Date.now();

        const receiveTx: Transaction = {
            id: `own-svc-pay-${baseTimestamp}`,
            type: TransactionType.INCOME,
            amount: numAmount,
            date: date,
            description: reference || `Owner payment received from ${ownerName}`,
            accountId: accountId,
            categoryId: ownerSvcPayCategory.id,
            contactId: ownerId,
            isSystem: false,
        };

        setIsSubmitting(true);
        try {
            dispatch({ type: 'ADD_TRANSACTION', payload: receiveTx });
            showToast(`Payment of ${CURRENCY} ${numAmount.toLocaleString()} received from ${ownerName}.`, 'success');
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} preventCloseWhile={isSubmitting} title="Receive payment from owner">
            <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-1">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                    <p className="font-medium">Service charges, owner &amp; building bills</p>
                    <p className="mt-1 text-blue-700">
                        Use this to record cash received from the owner. That typically covers{' '}
                        <strong>monthly service charge</strong> deductions and <strong>vendor bills</strong> allocated to
                        the owner or <strong>building</strong> (shared costs for buildings where this owner has units) on
                        the rental owner income ledger.
                        {vacantProperties.length > 0 ? (
                            <>
                                {' '}
                                Vacant units with a configured charge: {vacantProperties.join(', ')}.
                            </>
                        ) : null}
                    </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center gap-3">
                        <div>
                            <p className="text-sm text-slate-500">Owner</p>
                            <p className="font-semibold text-slate-800">{ownerName}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-sm text-slate-500">Suggested amount</p>
                            <p className="font-bold text-red-600">{fmtMoney(suggestedAmount)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5 max-w-[14rem] leading-tight">
                                From ledger / balance; adjust if needed. May include charges not itemized below.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100 border-b border-slate-200">
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                            Owner &amp; building-bearer bills
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            <strong>Owner</strong>: bill allocation Owner on this owner&apos;s properties.{' '}
                            <strong>Building</strong>: allocation Building on a building that contains one of this
                            owner&apos;s properties (includes paid and outstanding).
                        </p>
                    </div>
                    {ownerBearerBillRows.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-500 italic">
                            No owner- or building-bearer bills found for this owner&apos;s properties or buildings.
                        </p>
                    ) : (
                        <div className="max-h-52 overflow-y-auto">
                            <table className="min-w-full text-xs">
                                <thead className="bg-slate-50/80 sticky top-0">
                                    <tr className="text-left text-slate-600">
                                        <th className="px-2 py-1.5 font-semibold">Bill</th>
                                        <th className="px-2 py-1.5 font-semibold">Property / building</th>
                                        <th className="px-2 py-1.5 font-semibold">Allocation</th>
                                        <th className="px-2 py-1.5 font-semibold">Issue</th>
                                        <th className="px-2 py-1.5 font-semibold text-right">Amount</th>
                                        <th className="px-2 py-1.5 font-semibold text-right">Paid</th>
                                        <th className="px-2 py-1.5 font-semibold text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {ownerBearerBillRows.map((r) => (
                                        <tr key={r.id} className="hover:bg-slate-50/80">
                                            <td className="px-2 py-1.5 font-mono text-slate-800">{r.billNumber}</td>
                                            <td className="px-2 py-1.5 text-slate-700">{r.propertyName}</td>
                                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">
                                                <span
                                                    className={
                                                        r.allocation === 'Building'
                                                            ? 'text-amber-800 font-medium'
                                                            : 'text-slate-700'
                                                    }
                                                >
                                                    {r.allocation}
                                                </span>
                                            </td>
                                            <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">
                                                {r.issueDate ? formatDate(r.issueDate) : '—'}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.amount)}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                                                {fmtMoney(r.paid)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900">
                                                {fmtMoney(r.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-100/90 border-t border-slate-200 font-semibold text-slate-800">
                                    <tr>
                                        <td colSpan={4} className="px-2 py-1.5 text-right">
                                            Totals
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(billTotals.amount)}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(billTotals.paid)}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(billTotals.balance)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>

                <Input
                    label="Amount to receive"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                />

                <DatePicker label="Payment date" value={date} onChange={(d) => setDate(toLocalDateString(d))} required />

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Receive into account</label>
                    <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                        {accountOptions.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                                {acc.name}
                            </option>
                        ))}
                    </Select>
                </div>

                <Input
                    label="Reference / description (optional)"
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={`Payment from ${ownerName}`}
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <LoadingButton onClick={() => void handleSubmit()} loading={isSubmitting} loadingText="Saving...">
                        Receive payment
                    </LoadingButton>
                </div>
            </div>
        </Modal>
    );
};

export default ReceiveFromOwnerModal;
