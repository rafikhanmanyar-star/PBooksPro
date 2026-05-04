
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Vendor, Transaction, TransactionType, InvoiceStatus, AccountType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { ContractorLedgerAdvance, contractorApi } from '../../services/api/contractorApi';
import { allocateFifoAcrossVendorBills, type BillAllocationPlan } from '../../utils/vendorAdvanceAllocation';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';

const EPS = 0.015;

interface VendorBillPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    vendor: Vendor;
}

const VendorBillPaymentModal: React.FC<VendorBillPaymentModalProps> = ({ isOpen, onClose, vendor }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
    const [totalAmount, setTotalAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');
    const [supplierAdvances, setSupplierAdvances] = useState<ContractorLedgerAdvance[]>([]);
    const [expenseGlAccountId, setExpenseGlAccountId] = useState('');
    const [advancesLoaded, setAdvancesLoaded] = useState(false);

    const pendingBills = useMemo(() => {
        return state.bills
            .filter((b) => b.vendorId === vendor.id && b.status !== InvoiceStatus.PAID)
            .sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());
    }, [state.bills, vendor.id]);

    const userSelectableAccounts = useMemo(
        () => state.accounts.filter((a) => a.type === AccountType.BANK && a.name !== 'Internal Clearing'),
        [state.accounts]
    );

    const glExpenseCandidates = useMemo(
        () =>
            state.accounts.filter(
                (a) => a.type !== AccountType.BANK && a.type !== AccountType.CASH && a.name !== 'Internal Clearing'
            ),
        [state.accounts]
    );

    const preloadPartyId = useMemo(() => {
        const b = pendingBills[0];
        if (!b) return vendor.id;
        return ((b.contactId || '').trim() || (b.vendorId || '').trim() || vendor.id).trim();
    }, [pendingBills, vendor.id]);

    const selectedSorted = useMemo(() => {
        return pendingBills
            .filter((b) => selectedBillIds.has(b.id))
            .sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());
    }, [pendingBills, selectedBillIds]);

    const supplierParties = useMemo(() => {
        const keys = selectedSorted.map((b) => (b.contactId || '').trim() || (b.vendorId || '').trim() || vendor.id);
        return [...new Set(keys)];
    }, [selectedSorted, vendor.id]);

    const supplierPartiesMixed = supplierParties.length > 1;
    const effectiveSupplierContactId = selectedSorted.length > 0 ? supplierParties[0] : preloadPartyId;

    const fifoPlans = useMemo((): Map<string, BillAllocationPlan> => {
        if (
            supplierPartiesMixed ||
            !selectedSorted.length ||
            !supplierAdvances.length ||
            isLocalOnlyMode()
        ) {
            return new Map<string, BillAllocationPlan>();
        }
        const advRows = supplierAdvances
            .filter((a) => a.remainingAmount > EPS)
            .map((a) => ({
                id: a.id,
                advanceDate: a.advanceDate,
                remainingAmount: a.remainingAmount,
            }));
        if (!advRows.length) return new Map<string, BillAllocationPlan>();
        const dueRows = selectedSorted.map((b) => ({
            id: b.id,
            issueDate: b.issueDate,
            dueAmount: Math.round((b.amount - b.paidAmount) * 100) / 100,
        }));
        return allocateFifoAcrossVendorBills(adRows, dueRows);
    }, [selectedSorted, supplierAdvances, supplierPartiesMixed]);

    let appliedFromAdvances = 0;
    let cashToPayFromBank = 0;
    for (const bill of selectedSorted) {
        const p = fifoPlans.get(bill.id);
        if (!p) continue;
        for (const adj of p.adjustments) appliedFromAdvances += adj.amount;
        cashToPayFromBank += p.cash;
    }
    appliedFromAdvances = Math.round(appliedFromAdvances * 100) / 100;
    cashToPayFromBank = Math.round(cashToPayFromBank * 100) / 100;

    const advanceSettlementPath =
        !isLocalOnlyMode() &&
        selectedSorted.length > 0 &&
        !supplierPartiesMixed &&
        advancesLoaded &&
        supplierAdvances.some((a) => a.remainingAmount > EPS) &&
        appliedFromAdvances >= EPS;

    useEffect(() => {
        let cancel = false;
        if (!isOpen || isLocalOnlyMode()) {
            setSupplierAdvances([]);
            setAdvancesLoaded(false);
            return;
        }
        if (supplierPartiesMixed) {
            setSupplierAdvances([]);
            setAdvancesLoaded(true);
            return;
        }
        const partyId = (effectiveSupplierContactId || preloadPartyId).trim();
        (async () => {
            setAdvancesLoaded(false);
            try {
                const rows = await contractorApi.getAdvances(partyId);
                if (!cancel) {
                    setSupplierAdvances(rows);
                    setAdvancesLoaded(true);
                }
            } catch {
                if (!cancel) {
                    setSupplierAdvances([]);
                    setAdvancesLoaded(true);
                }
            }
        })();
        return () => {
            cancel = true;
        };
    }, [isOpen, supplierPartiesMixed, effectiveSupplierContactId, preloadPartyId]);

    useEffect(() => {
        const selected = pendingBills.filter((b) => selectedBillIds.has(b.id));
        const sumDue = Math.round(selected.reduce((acc, b) => acc + (b.amount - b.paidAmount), 0) * 100) / 100;
        if (
            !isLocalOnlyMode() &&
            advanceSettlementPath &&
            selected.length > 0 &&
            fifoPlans.size > 0
        ) {
            setTotalAmount((cashToPayFromBank > EPS ? cashToPayFromBank : '').toString());
        } else {
            setTotalAmount(sumDue > 0 ? String(sumDue) : '');
        }
    }, [
        selectedBillIds,
        pendingBills,
        advanceSettlementPath,
        cashToPayFromBank,
        fifoPlans,
    ]);

    useEffect(() => {
        if (!isOpen) return;
        if (advanceSettlementPath && !expenseGlAccountId && glExpenseCandidates.length > 0) {
            const pick =
                glExpenseCandidates.find((a) => /expense/i.test(a.name || '')) || glExpenseCandidates[0];
            if (pick) setExpenseGlAccountId(pick.id);
        }
    }, [isOpen, advanceSettlementPath, expenseGlAccountId, glExpenseCandidates]);

    const handleToggleBill = (billId: string) => {
        const newSet = new Set(selectedBillIds);
        if (newSet.has(billId)) newSet.delete(billId);
        else newSet.add(billId);
        setSelectedBillIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedBillIds.size === pendingBills.length) {
            setSelectedBillIds(new Set());
        } else {
            setSelectedBillIds(new Set(pendingBills.map((b) => b.id)));
        }
    };

    const handleSubmit = async () => {
        if (!accountId) {
            await showAlert('Please select a payment account.');
            return;
        }

        const numericTotal = parseFloat(totalAmount);
        const selectedCount = selectedBillIds.size;
        if (selectedCount === 0) {
            await showAlert('Please select at least one bill to pay.');
            return;
        }

        const selectedBillsSorted = [...selectedSorted];

        /* --- Advance + journal settlement (API mode) ------------------------------------ */
        if (advanceSettlementPath) {
            if (supplierPartiesMixed) {
                await showAlert(
                    'Selected bills are linked to different supplier contacts for advances. Select bills for one supplier/contact at a time.'
                );
                return;
            }
            if (!expenseGlAccountId.trim()) {
                await showAlert('Pick the expense GL account used to recognise this bill (posted on journal).');
                return;
            }
            if (
                numericTotal <= 0 &&
                cashToPayFromBank > EPS
            ) {
                await showAlert('Cash payable from bank is positive but Total Payment Amount is zero. Please refresh allocations.');
                return;
            }
            if (cashToPayFromBank > EPS && (isNaN(numericTotal) || numericTotal <= 0)) {
                await showAlert('Enter cash to pay from the bank account (remainder after advances).');
                return;
            }
            if (Math.abs((isNaN(numericTotal) ? 0 : numericTotal) - cashToPayFromBank) > EPS) {
                await showAlert(
                    `Cash payment must equal the planned bank portion (${CURRENCY} ${cashToPayFromBank.toLocaleString()}). Adjust selections or allocations.`
                );
                return;
            }

            const batchId = `batch-pay-${Date.now()}`;
            const billLines = selectedBillsSorted.map((bill) => {
                const plan = fifoPlans.get(bill.id);
                const due = Math.round((bill.amount - bill.paidAmount) * 100) / 100;
                if (!plan || Math.abs(plan.cash + plan.adjustments.reduce((s, a) => s + a.amount, 0) - due) > EPS) {
                    throw new Error(`Allocation mismatch for bill ${bill.billNumber}`);
                }
                return {
                    billId: bill.id,
                    adjustments: plan.adjustments,
                    cashAmount: plan.cash,
                    expenseAccountId: expenseGlAccountId.trim(),
                };
            });

            try {
                const res = await contractorApi.settleBillsWithAdvances({
                    supplierContactId: effectiveSupplierContactId.trim(),
                    paymentAccountId: accountId,
                    entryDate: paymentDate,
                    bills: billLines,
                    reference: reference.trim() || undefined,
                    description: description.trim() || undefined,
                    batchId,
                });
                for (const b of res.bills || []) {
                    dispatch({ type: 'UPDATE_BILL', payload: b });
                }
                showToast(`Settled ${res.bills?.length ?? 0} bill(s) with prepaid advances where applicable.`, 'success');
                onClose();
            } catch (e: unknown) {
                console.error(e);
                const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: string }).message) : String(e);
                await showAlert(`Settlement failed: ${msg}`);
            }
            return;
        }

        /* --- Legacy cash ledger transactions -------------------------------------------- */
        if (isNaN(numericTotal) || numericTotal <= 0) {
            await showAlert('Please enter a valid amount.');
            return;
        }

        const totalDueSelected = selectedBillsSorted.reduce((acc, b) => acc + (b.amount - b.paidAmount), 0);

        if (numericTotal > totalDueSelected + 0.01) {
            await showAlert(
                `Payment amount cannot exceed the total due for selected bills (${CURRENCY} ${totalDueSelected.toLocaleString()})`
            );
            return;
        }

        let remainingToDistribute = numericTotal;
        const transactions: Transaction[] = [];

        const batchId = `batch-pay-${Date.now()}`;

        for (const bill of selectedBillsSorted) {
            if (remainingToDistribute <= 0.001) break;

            const due = bill.amount - bill.paidAmount;
            const payAmount = Math.min(due, remainingToDistribute);

            const roundedPayAmount = Math.round(payAmount * 100) / 100;

            if (roundedPayAmount > 0) {
                transactions.push({
                    id: `txn-bp-${Date.now()}-${bill.id}`,
                    type: TransactionType.EXPENSE,
                    amount: roundedPayAmount,
                    date: paymentDate,
                    description: description || `Bill Payment: #${bill.billNumber}` + (reference ? ` (Ref: ${reference})` : ''),
                    accountId,
                    vendorId: vendor.id,
                    projectId: bill.projectId,
                    buildingId: bill.buildingId,
                    propertyId: bill.propertyId,
                    agreementId: bill.projectAgreementId,
                    categoryId: bill.categoryId,
                    billId: bill.id,
                    contractId: bill.contractId,
                    batchId,
                });
                remainingToDistribute -= roundedPayAmount;
            }
        }

        if (transactions.length > 0) {
            if (isLocalOnlyMode()) {
                dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
                showToast(`Payment recorded for ${transactions.length} bills.`, 'success');
                onClose();
                return;
            }

            try {
                const apiService = getAppStateApiService();
                const savedTransactions: Transaction[] = [];
                const failedBills: { billId: string; error: any }[] = [];

                for (const tx of transactions) {
                    try {
                        const saved = await apiService.saveTransaction(tx);
                        savedTransactions.push(saved as Transaction);
                    } catch (error: any) {
                        failedBills.push({ billId: tx.billId!, error });
                        if (
                            error.status === 409 ||
                            error.code === 'BILL_LOCKED' ||
                            error.code === 'BILL_VERSION_MISMATCH'
                        ) {
                            console.warn(`Payment conflict for bill ${tx.billId}:`, error.message);
                        } else if (error.status === 400 && error.code === 'PAYMENT_OVERPAYMENT') {
                            console.error(`Overpayment for bill ${tx.billId}:`, error.message);
                        }
                    }
                }

                if (savedTransactions.length === 0) {
                    const firstError = failedBills[0]?.error;
                    if (
                        firstError?.status === 409 ||
                        firstError?.code === 'BILL_LOCKED' ||
                        firstError?.code === 'BILL_VERSION_MISMATCH'
                    ) {
                        await showAlert(
                            'Payment conflict detected. One or more bills are being processed by another user. Please refresh and try again.'
                        );
                    } else if (firstError?.status === 400 && firstError?.code === 'PAYMENT_OVERPAYMENT') {
                        await showAlert(
                            `Overpayment detected. ${firstError.message || 'One or more payments exceed the bill amount.'}`
                        );
                    } else {
                        await showAlert(`Failed to process payments: ${firstError?.message || 'Unknown error occurred'}`);
                    }
                    return;
                }

                dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: savedTransactions });
                if (failedBills.length > 0) {
                    showToast(
                        `Payment recorded for ${savedTransactions.length} bill(s). ${failedBills.length} payment(s) failed due to conflicts. Please refresh and try again.`,
                        'warning'
                    );
                } else {
                    showToast(`Payment recorded for ${savedTransactions.length} bills.`, 'success');
                }
                onClose();
            } catch (error: any) {
                console.error('Error processing vendor bill payment:', error);
                const errorMessage = error.message || 'An unexpected error occurred while processing payments.';
                await showAlert(`Payment failed: ${errorMessage}`);
            }
        } else {
            await showAlert('Could not generate valid transactions. Please check amounts.');
        }
    };

    useEffect(() => {
        if (isOpen && !accountId) {
            const cash = userSelectableAccounts.find((a) => a.name === 'Cash');
            if (cash) setAccountId(cash.id);
            else if (userSelectableAccounts.length > 0) setAccountId(userSelectableAccounts[0].id);
        }
    }, [isOpen, userSelectableAccounts, accountId]);

    if (!isOpen) return null;

    const totalDueSelectedUi = pendingBills
        .filter((b) => selectedBillIds.has(b.id))
        .reduce((acc, b) => acc + (b.amount - b.paidAmount), 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay Vendor: ${vendor.name}`} size="xl">
            <div className="flex flex-col h-full max-h-[80vh]">
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-slate-700">Pending Bills</h3>
                        <div className="text-sm text-slate-500">
                            {selectedBillIds.size} selected | Due (selected){' '}
                            <span className="font-bold text-slate-800">
                                {CURRENCY} {totalDueSelectedUi.toLocaleString()}
                            </span>
                            {advanceSettlementPath ? (
                                <>
                                    {' '}
                                    | From prepaid:{' '}
                                    <span className="font-bold text-emerald-800">
                                        {CURRENCY} {appliedFromAdvances.toLocaleString()}
                                    </span>
                                    {' '}
                                    | Cash (bank){' '}
                                    <span className="font-bold text-slate-800">
                                        {CURRENCY} {cashToPayFromBank.toLocaleString()}
                                    </span>
                                </>
                            ) : (
                                <>
                                    {' '}
                                    | Paying now:{' '}
                                    <span className="font-bold text-slate-800">{CURRENCY} {parseFloat(totalAmount || '0').toLocaleString()}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {!isLocalOnlyMode() && advancesLoaded && supplierAdvances.some((a) => a.remainingAmount > EPS) && (
                        <div className="mb-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/90 text-xs text-emerald-900 leading-relaxed space-y-1">
                            <p className="font-semibold text-sm">Supplier prepaid advances detected</p>
                            <p>
                                Outstanding prepaid balance for advances issued to{' '}
                                <span className="font-mono">{effectiveSupplierContactId.slice(0, 8)}…</span>:
                               {' '}
                                <strong>{CURRENCY} {supplierAdvances.reduce((s, a) => s + Math.max(0, a.remainingAmount), 0).toLocaleString()}</strong>
                                . Advances are allocated <strong>FIFO</strong> (oldest advances / oldest unpaid bills).
                                Remaining prepaid stays on the supplier for future bills when an advance exceeds a bill&apos;s balance.
                            </p>
                            {supplierPartiesMixed && (
                                <p className="text-rose-700 font-semibold">
                                    Mixed contact/vendor linkage on selection — unsettle-able until you select bills for one party only.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="max-h-64 overflow-y-auto border rounded-lg bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-100 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-center w-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedBillIds.size > 0 && selectedBillIds.size === pendingBills.length}
                                            onChange={handleSelectAll}
                                            className="rounded text-accent focus:ring-accent"
                                        />
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-slate-600">Date</th>
                                    <th className="px-4 py-2 text-left font-medium text-slate-600">Bill #</th>
                                    <th className="px-4 py-2 text-left font-medium text-slate-600">Description</th>
                                    <th className="px-4 py-2 text-right font-medium text-slate-600">Due</th>
                                    {advanceSettlementPath && (
                                        <>
                                            <th className="px-4 py-2 text-right font-medium text-slate-600">From advance</th>
                                            <th className="px-4 py-2 text-right font-medium text-slate-600">Cash</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {pendingBills.length > 0 ? (
                                    pendingBills.map((bill) => {
                                        const due = bill.amount - bill.paidAmount;
                                        const p = fifoPlans.get(bill.id);
                                        const advPart = advanceSettlementPath ? p?.adjustments.reduce((s, a) => s + a.amount, 0) ?? 0 : 0;
                                        const cashPart = advanceSettlementPath ? p?.cash ?? 0 : 0;
                                        return (
                                            <tr
                                                key={bill.id}
                                                className={selectedBillIds.has(bill.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}
                                            >
                                                <td className="px-4 py-2 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedBillIds.has(bill.id)}
                                                        onChange={() => handleToggleBill(bill.id)}
                                                        className="rounded text-accent focus:ring-accent"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-slate-700">{formatDate(bill.issueDate)}</td>
                                                <td className="px-4 py-2 font-medium text-slate-800">{bill.billNumber}</td>
                                                <td className="px-4 py-2 text-slate-500 truncate max-w-[180px]" title={bill.description}>
                                                    {bill.description}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-slate-700">{CURRENCY} {due.toLocaleString()}</td>
                                                {advanceSettlementPath && (
                                                    <>
                                                        <td className="px-4 py-2 text-right font-mono text-emerald-800">{CURRENCY} {advPart.toLocaleString()}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-slate-700">{CURRENCY} {cashPart.toLocaleString()}</td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={advanceSettlementPath ? 8 : 5}
                                            className="px-4 py-8 text-center text-slate-500"
                                        >
                                            No pending bills found for this vendor.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <ComboBox
                            id="payment-account"
                            name="payment-account"
                            label="Bank account (remainder after advances)"
                            items={userSelectableAccounts}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select Account"
                            required
                        />
                        <Input
                            id="payment-amount"
                            name="payment-amount"
                            label={
                                advanceSettlementPath
                                    ? `Cash payable from bank (remainder — ${CURRENCY} ${cashToPayFromBank.toLocaleString()} planned)`
                                    : 'Total payment amount'
                            }
                            type="number"
                            value={totalAmount}
                            onChange={(e) => setTotalAmount(e.target.value)}
                            disabled={advanceSettlementPath}
                            required={!advanceSettlementPath}
                            readOnly={advanceSettlementPath}
                        />
                        {advanceSettlementPath && (
                            <ComboBox
                                id="expense-gl-account"
                                name="expense-gl-account"
                                label={'Expense (P&L) debit account'}
                                items={glExpenseCandidates}
                                selectedId={expenseGlAccountId}
                                onSelect={(item) => setExpenseGlAccountId(item?.id || '')}
                                placeholder="Select expense GL posted on settlement"
                                required
                            />
                        )}
                    </div>
                    <div className="space-y-4">
                        <DatePicker
                            id="payment-date"
                            name="payment-date"
                            label="Settlement / payment date"
                            value={paymentDate}
                            onChange={(d) => setPaymentDate(toLocalDateString(d))}
                            required
                        />
                        <Input
                            id="payment-reference"
                            name="payment-reference"
                            label="Reference"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Cheque No, Transaction ID..."
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Input
                            id="payment-description"
                            name="payment-description"
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional notes..."
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => void handleSubmit()} disabled={pendingBills.length === 0}>
                        {advanceSettlementPath ? 'Settle bills (advances + bank)' : 'Confirm payment'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default VendorBillPaymentModal;
