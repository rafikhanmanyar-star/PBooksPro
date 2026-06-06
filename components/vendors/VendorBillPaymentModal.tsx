
import { useAccounts, useBills, useCategories, useDispatchOnly, useFinancialReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useEffect } from 'react';
import { Vendor, Transaction, TransactionType, InvoiceStatus, AccountType, Bill } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { ContractorLedgerAdvance, contractorApi, type VendorBillSettlementRow } from '../../services/api/contractorApi';
import { allocateFifoAcrossVendorBills, type BillAllocationPlan } from '../../utils/vendorAdvanceAllocation';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { formatApiErrorMessage } from '../../utils/formatApiErrorMessage';
import {
    computeBillAfterPayment,
    offerConstructionBillPaymentWhatsApp,
} from '../../utils/constructionBillPaymentWhatsApp';
import { resolveBillLinkedExpenseCategoryId } from '../../utils/billExpenseCategory';

const EPS = 0.015;

interface VendorBillPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called after a successful payment (before `onClose`); omit if you only need to toggle `isOpen` on dismiss. */
    onPaymentSuccess?: () => void;
    vendor: Vendor;
    /** Restrict listed unpaid bills (e.g. project bills sidebar); omit for all unpaid vendor bills. */
    restrictToBillIds?: string[] | null;
    /** Bills to pre-select when the modal opens (must be in restricted list when `restrictToBillIds` set). */
    presetSelectedBillIds?: string[] | null;
    /** API mode: edit an existing hybrid settlement (same modal, replace on save). */
    editSettlement?: VendorBillSettlementRow | null;
}

const VendorBillPaymentModal: React.FC<VendorBillPaymentModalProps> = ({
    isOpen,
    onClose,
    onPaymentSuccess,
    vendor,
    restrictToBillIds,
    presetSelectedBillIds,
    editSettlement,
}) => {
    const accounts = useAccounts();
    const allBills = useBills();
    const categories = useCategories();
    const dispatch = useDispatchOnly();
    const { showToast, showAlert, showConfirm } = useNotification();
    const { openChat } = useWhatsApp();

    const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
    const [totalAmount, setTotalAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');
    const [supplierAdvances, setSupplierAdvances] = useState<ContractorLedgerAdvance[]>([]);
    const [expenseGlAccountId, setExpenseGlAccountId] = useState('');
    const [advancesLoaded, setAdvancesLoaded] = useState(false);
    /** User can turn off FIFO prepaid and pay only via bank/cash (legacy transaction flow). */
    const [applyPrepaidFifo, setApplyPrepaidFifo] = useState(true);
    /** One bill only: type any split of prepaid vs bank; total can be less than full due (partial payment). */
    const [manualSettlementSplit, setManualSettlementSplit] = useState(false);
    const [manualAdvanceAmounts, setManualAdvanceAmounts] = useState<Record<string, string>>({});

    const restrictSet = useMemo(
        () => (restrictToBillIds?.length ? new Set(restrictToBillIds) : null),
        [restrictToBillIds]
    );

    const pendingBills = useMemo(() => {
        let bills = bills.filter((b) => {
            if (b.vendorId !== vendor.id) return false;
            if (editSettlement && b.id === editSettlement.billId) return true;
            return b.status !== InvoiceStatus.PAID;
        }).sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());
        if (restrictSet) {
            bills = bills.filter((b) => restrictSet.has(b.id));
        }
        return bills;
    }, [bills, vendor.id, restrictSet, editSettlement?.billId]);

    const userSelectableAccounts = useMemo(
        () =>
            accounts.filter(
                (a) =>
                    (a.type === AccountType.BANK || a.type === AccountType.CASH) && a.name !== 'Internal Clearing'
            ),
        [accounts]
    );

    const glExpenseCandidates = useMemo(
        () =>
            accounts.filter(
                (a) => a.type !== AccountType.BANK && a.type !== AccountType.CASH && a.name !== 'Internal Clearing'
            ),
        [accounts]
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

    const supplierPartiesMixed = !editSettlement && supplierParties.length > 1;

    const effectiveSupplierContactId = editSettlement?.supplierContactId?.trim()?.length
        ? editSettlement.supplierContactId.trim()
        : selectedSorted.length > 0
          ? supplierParties[0]
          : preloadPartyId;

    /** FIFO suggestion only (no typed manual overrides) — used for auto cash field and "copy FIFO" into manual mode. */
    const fifoSuggestedPlans = useMemo((): Map<string, BillAllocationPlan> => {
        if (
            !applyPrepaidFifo ||
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
        return allocateFifoAcrossVendorBills(advRows, dueRows);
    }, [applyPrepaidFifo, supplierPartiesMixed, selectedSorted, supplierAdvances]);

    const fifoPlans = useMemo((): Map<string, BillAllocationPlan> => {
        if (editSettlement) {
            const adjustments = editSettlement.adjustments
                .map((a) => ({
                    advanceId: a.advanceId,
                    amount: Math.round(parseFloat(manualAdvanceAmounts[a.advanceId] ?? 'NaN') * 100) / 100,
                }))
                .filter((row) => Number.isFinite(row.amount) && row.amount > EPS);
            const cash = Math.round(parseFloat(totalAmount || '0') * 100) / 100;
            const map = new Map<string, BillAllocationPlan>();
            map.set(editSettlement.billId, {
                adjustments,
                cash: Number.isFinite(cash) ? cash : 0,
            });
            return map;
        }
        if (
            manualSettlementSplit &&
            selectedSorted.length === 1 &&
            applyPrepaidFifo &&
            !supplierPartiesMixed &&
            !isLocalOnlyMode()
        ) {
            const bill = selectedSorted[0];
            const adjustments = supplierAdvances
                .map((a) => ({
                    advanceId: a.id,
                    amount: Math.round(parseFloat(manualAdvanceAmounts[a.id] ?? 'NaN') * 100) / 100,
                }))
                .filter((row) => Number.isFinite(row.amount) && row.amount > EPS);
            const cash = Math.round(parseFloat(totalAmount || '0') * 100) / 100;
            const map = new Map<string, BillAllocationPlan>();
            map.set(bill.id, {
                adjustments,
                cash: Number.isFinite(cash) ? cash : 0,
            });
            return map;
        }
        return fifoSuggestedPlans;
    }, [
        editSettlement,
        manualSettlementSplit,
        manualAdvanceAmounts,
        totalAmount,
        applyPrepaidFifo,
        selectedSorted,
        supplierAdvances,
        supplierPartiesMixed,
        fifoSuggestedPlans,
    ]);

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

    const hasPrepaidFifoRows =
        advancesLoaded && supplierAdvances.some((a) => a.remainingAmount > EPS);

    const advanceSettlementPath =
        !isLocalOnlyMode() &&
        selectedSorted.length > 0 &&
        (!!editSettlement || (applyPrepaidFifo && !supplierPartiesMixed && hasPrepaidFifoRows));

    useEffect(() => {
        if (isOpen && !editSettlement) setApplyPrepaidFifo(true);
    }, [isOpen, editSettlement?.journalEntryId]);

    useEffect(() => {
        let cancel = false;
        if (!isOpen || isLocalOnlyMode()) {
            setSupplierAdvances([]);
            setAdvancesLoaded(false);
            return;
        }
        if (editSettlement) {
            const partyId = editSettlement.supplierContactId.trim();
            if (!partyId) {
                setSupplierAdvances([]);
                setAdvancesLoaded(true);
                return;
            }
            setAdvancesLoaded(false);
            (async () => {
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
    }, [
        isOpen,
        editSettlement?.journalEntryId,
        supplierPartiesMixed,
        effectiveSupplierContactId,
        preloadPartyId,
    ]);

    useEffect(() => {
        if (!isOpen) return;
        if (!editSettlement) {
            setManualSettlementSplit(false);
            setManualAdvanceAmounts({});
        }
    }, [isOpen, editSettlement?.journalEntryId]);

    useEffect(() => {
        if (!isOpen || !editSettlement) return;
        const m: Record<string, string> = {};
        editSettlement.adjustments.forEach((a) => {
            m[a.advanceId] = String(a.amount);
        });
        setManualAdvanceAmounts(m);
        setTotalAmount(String(editSettlement.cashAmount));
        setPaymentDate(editSettlement.entryDate);
        setExpenseGlAccountId(editSettlement.expenseAccountId || '');
        setAccountId(editSettlement.paymentAccountId || '');
        setSelectedBillIds(new Set([editSettlement.billId]));
    }, [isOpen, editSettlement?.journalEntryId]);

    useEffect(() => {
        if (!applyPrepaidFifo && !editSettlement) setManualSettlementSplit(false);
    }, [applyPrepaidFifo, editSettlement?.journalEntryId]);

    useEffect(() => {
        if (!isOpen || editSettlement) return;
        if (manualSettlementSplit && selectedSorted.length !== 1) {
            setManualSettlementSplit(false);
            setManualAdvanceAmounts({});
        }
    }, [isOpen, editSettlement, manualSettlementSplit, selectedSorted.length]);

    /** Project bills bulk pay passes preset selections; works with or without restrictToBillIds. */
    useEffect(() => {
        if (!isOpen || editSettlement || !presetSelectedBillIds?.length) return;
        const usable = presetSelectedBillIds.filter((id) => {
            if (restrictSet && !restrictSet.has(id)) return false;
            return pendingBills.some((b) => b.id === id);
        });
        if (usable.length === 0) return;
        setSelectedBillIds(new Set(usable));
    }, [isOpen, editSettlement, presetSelectedBillIds, restrictSet, pendingBills]);

    /** When restricted to a bill set and no preset: pre-select all restricted unpaid rows. */
    useEffect(() => {
        if (!isOpen || editSettlement || restrictSet === null || (presetSelectedBillIds?.length ?? 0) > 0) return;
        const allRestricted = pendingBills.filter((b) => restrictSet.has(b.id)).map((b) => b.id);
        if (allRestricted.length > 0) setSelectedBillIds(new Set(allRestricted));
    }, [isOpen, editSettlement, restrictSet, presetSelectedBillIds, pendingBills]);

    useEffect(() => {
        const selected = pendingBills.filter((b) => selectedBillIds.has(b.id));
        const sumDue = Math.round(selected.reduce((acc, b) => acc + (b.amount - b.paidAmount), 0) * 100) / 100;
        if (
            !isLocalOnlyMode() &&
            advanceSettlementPath &&
            !editSettlement &&
            !manualSettlementSplit &&
            selected.length > 0 &&
            fifoPlans.size > 0
        ) {
            setTotalAmount((cashToPayFromBank > EPS ? cashToPayFromBank : '').toString());
        } else if (!(advanceSettlementPath && (editSettlement || manualSettlementSplit))) {
            setTotalAmount(sumDue > 0 ? String(sumDue) : '');
        }
    }, [
        selectedBillIds,
        pendingBills,
        advanceSettlementPath,
        cashToPayFromBank,
        fifoPlans,
        editSettlement?.journalEntryId,
        manualSettlementSplit,
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
        if (editSettlement && billId !== editSettlement.billId) return;
        const newSet = new Set(selectedBillIds);
        if (newSet.has(billId)) newSet.delete(billId);
        else newSet.add(billId);
        setSelectedBillIds(newSet);
    };

    const handleSelectAll = () => {
        if (editSettlement) return;
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
            if (editSettlement) {
                if (!expenseGlAccountId.trim()) {
                    await showAlert('Pick the expense GL account used to recognise this bill (posted on journal).');
                    return;
                }
                if (!selectedBillIds.has(editSettlement.billId)) {
                    await showAlert('The bill for this settlement must remain selected.');
                    return;
                }
                const plan = fifoPlans.get(editSettlement.billId);
                if (!plan) {
                    await showAlert('Could not compute advance and cash split for this bill.');
                    return;
                }
                const advApplied = Math.round(plan.adjustments.reduce((s, a) => s + a.amount, 0) * 100) / 100;
                const cashPart = Math.round(plan.cash * 100) / 100;
                const combined = Math.round((advApplied + cashPart) * 100) / 100;
                if (combined <= EPS) {
                    await showAlert(
                        `Enter prepaid and/or bank amounts so the settlement total is greater than zero (${CURRENCY} 0).`
                    );
                    return;
                }
                const batchId = `replace-settle-${Date.now()}`;
                try {
                    const res = await contractorApi.replaceVendorBillSettlement({
                        journalEntryId: editSettlement.journalEntryId,
                        supplierContactId: effectiveSupplierContactId.trim(),
                        paymentAccountId: accountId,
                        entryDate: paymentDate,
                        bill: {
                            billId: editSettlement.billId,
                            adjustments: plan.adjustments,
                            cashAmount: cashPart,
                            expenseAccountId: expenseGlAccountId.trim(),
                        },
                        reference: reference.trim() || undefined,
                        description: description.trim() || undefined,
                        batchId,
                    });
                    for (const b of res.bills || []) {
                        dispatch({ type: 'UPDATE_BILL', payload: b });
                    }
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new Event('pbooks:request-api-refresh'));
                        window.dispatchEvent(
                            new CustomEvent<{ vendorId: string }>('pbooks:supplier-advance-recorded', {
                                detail: { vendorId: vendor.id.trim() },
                            })
                        );
                    }
                    showToast('Settlement updated (bill and prepaid balances refreshed).', 'success');
                    onPaymentSuccess?.();
                    onClose();
                } catch (e: unknown) {
                    console.error(e);
                    await showAlert(`Could not update settlement: ${formatApiErrorMessage(e)}`);
                }
                return;
            }

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

            const usingManualPartial = manualSettlementSplit && selectedSorted.length === 1;

            if (!usingManualPartial) {
                const cashEntered = Number.isFinite(numericTotal) ? numericTotal : 0;
                if (cashToPayFromBank > EPS && (isNaN(numericTotal) || numericTotal <= 0)) {
                    await showAlert('Enter cash to pay from the bank/cash account (remainder after advances).');
                    return;
                }
                if (cashToPayFromBank > EPS && Math.abs(cashEntered - cashToPayFromBank) > EPS) {
                    await showAlert(
                        `Cash payment must equal the planned remainder (${CURRENCY} ${cashToPayFromBank.toLocaleString()}). Adjust selections or allocations.`
                    );
                    return;
                }
                if (cashToPayFromBank <= EPS && cashEntered > EPS) {
                    await showAlert('No cash remainder is planned; clear the cash amount field or refresh.');
                    return;
                }
            }

            for (const bill of selectedBillsSorted) {
                const plan = fifoPlans.get(bill.id);
                if (!plan) {
                    await showAlert(`No prepaid/bank allocation for bill #${bill.billNumber}.`);
                    return;
                }
                const due = Math.round((bill.amount - bill.paidAmount) * 100) / 100;
                const payTotal =
                    Math.round((plan.cash + plan.adjustments.reduce((s, a) => s + a.amount, 0)) * 100) / 100;
                if (payTotal <= EPS) {
                    await showAlert(
                        `For bill #${bill.billNumber}, enter prepaid and/or bank so the payment total is greater than zero.`
                    );
                    return;
                }
                const allowPartial = usingManualPartial && bill.id === selectedSorted[0]?.id;
                if (allowPartial) {
                    if (payTotal > due + EPS) {
                        await showAlert(
                            `For bill #${bill.billNumber}, payment total (${CURRENCY} ${payTotal.toLocaleString()}) cannot exceed unpaid due (${CURRENCY} ${due.toLocaleString()}).`
                        );
                        return;
                    }
                } else if (Math.abs(payTotal - due) > EPS) {
                    await showAlert(
                        `For bill #${bill.billNumber}, the prepaid + bank breakdown must match unpaid due (${CURRENCY} ${due.toLocaleString()}) exactly. For a smaller payment or a custom prepaid/bank split, select one bill only and enable “Set prepaid and bank manually”.`
                    );
                    return;
                }
            }

            const batchId = `batch-pay-${Date.now()}`;
            const billLines = selectedBillsSorted.map((bill) => {
                const plan = fifoPlans.get(bill.id)!;
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
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('pbooks:request-api-refresh'));
                    window.dispatchEvent(
                        new CustomEvent<{ vendorId: string }>('pbooks:supplier-advance-recorded', {
                            detail: { vendorId: vendor.id.trim() },
                        })
                    );
                }
                showToast(`Settled ${res.bills?.length ?? 0} bill(s) with prepaid advances where applicable.`, 'success');
                await offerConstructionBillPaymentWhatsApp({
                    state,
                    updatedBills: (res.bills || []) as Bill[],
                    showConfirm,
                    showAlert,
                    openChat,
                });
                onPaymentSuccess?.();
                onClose();
            } catch (e: unknown) {
                console.error(e);
                let msg =
                    e && typeof e === 'object' && 'message' in e ? String((e as { message?: string }).message) : String(e);
                if (/vendor_bill_advance_clearings/i.test(msg) && /does not exist/i.test(msg)) {
                    msg +=
                        ' Your API database needs latest migrations. From the PBooks repo with DATABASE_URL in .env, run: npm run db:migrate:lan';
                }
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
                    categoryId: resolveBillLinkedExpenseCategoryId(bill, categories),
                    billId: bill.id,
                    contractId: bill.contractId,
                    batchId,
                });
                remainingToDistribute -= roundedPayAmount;
            }
        }

        if (transactions.length > 0) {
            const billPayTotals = new Map<string, number>();
            for (const tx of transactions) {
                if (tx.billId) {
                    billPayTotals.set(tx.billId, (billPayTotals.get(tx.billId) || 0) + tx.amount);
                }
            }
            const updatedBillsForWhatsApp: Bill[] = [];
            for (const [billId, amt] of billPayTotals) {
                const b = bills.find((x) => x.id === billId);
                if (b) updatedBillsForWhatsApp.push(computeBillAfterPayment(b, amt));
            }

            if (isLocalOnlyMode()) {
                dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
                showToast(`Payment recorded for ${transactions.length} bills.`, 'success');
                await offerConstructionBillPaymentWhatsApp({
                    state,
                    updatedBills: updatedBillsForWhatsApp,
                    showConfirm,
                    showAlert,
                    openChat,
                });
                onPaymentSuccess?.();
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
                const okIds = new Set(savedTransactions.map((t) => t.billId).filter(Boolean) as string[]);
                const updatedApi = updatedBillsForWhatsApp.filter((b) => okIds.has(b.id));
                await offerConstructionBillPaymentWhatsApp({
                    state,
                    updatedBills: updatedApi,
                    showConfirm,
                    showAlert,
                    openChat,
                });
                onPaymentSuccess?.();
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

    const advancesForSettlementEdit = useMemo(() => {
        if (!editSettlement) return [];
        const adjIds = new Set(editSettlement.adjustments.map((a) => a.advanceId));
        return supplierAdvances.filter((a) => {
            if (adjIds.has(a.id)) return true;
            if (a.remainingAmount > EPS) return true;
            const typed = parseFloat(manualAdvanceAmounts[a.id] || '');
            return Number.isFinite(typed) && typed > EPS;
        });
    }, [editSettlement, supplierAdvances, manualAdvanceAmounts]);

    const advancesForManualNewPay = useMemo(() => {
        if (!manualSettlementSplit || editSettlement || selectedSorted.length !== 1) return [];
        const want = new Set<string>();
        for (const a of supplierAdvances) {
            if (a.remainingAmount > EPS) want.add(a.id);
        }
        for (const id of Object.keys(manualAdvanceAmounts)) {
            const v = parseFloat(manualAdvanceAmounts[id] || '');
            if (Number.isFinite(v) && v > EPS) want.add(id);
        }
        return supplierAdvances.filter((a) => want.has(a.id));
    }, [manualSettlementSplit, editSettlement, selectedSorted.length, supplierAdvances, manualAdvanceAmounts]);

    if (!isOpen) return null;

    const showAdvanceBreakdownPanel =
        advanceSettlementPath &&
        advancesLoaded &&
        (editSettlement || (manualSettlementSplit && selectedSorted.length === 1));

    const advanceInputRowsForUi = editSettlement ? advancesForSettlementEdit : advancesForManualNewPay;
    const allocationTotalUi = appliedFromAdvances + cashToPayFromBank;
    const singleSelectedBillDueUi =
        selectedSorted.length === 1
            ? Math.round((selectedSorted[0].amount - selectedSorted[0].paidAmount) * 100) / 100
            : 0;
    const cashFieldEditable =
        !advanceSettlementPath || !!editSettlement || (manualSettlementSplit && selectedSorted.length === 1);
    const totalDueSelectedUi = pendingBills
        .filter((b) => selectedBillIds.has(b.id))
        .reduce((acc, b) => acc + (b.amount - b.paidAmount), 0);

    const modalTitle = editSettlement
        ? `Edit bill settlement — ${vendor.name}`
        : `Pay Vendor: ${vendor.name}`;
    const primaryActionLabel = editSettlement
        ? 'Save settlement'
        : advanceSettlementPath
          ? 'Settle bills (advances + bank)'
          : 'Confirm payment';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="xl">
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

                    {!isLocalOnlyMode() &&
                        advancesLoaded &&
                        (supplierAdvances.some((a) => a.remainingAmount > EPS) || !!editSettlement) && (
                        <div className="mb-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/90 text-xs text-emerald-900 leading-relaxed space-y-2">
                            <p className="font-semibold text-sm">
                                {editSettlement ? 'Editing hybrid settlement (prepaid + bank)' : 'Supplier prepaid advances detected'}
                            </p>
                            <p>
                                Outstanding prepaid balance for advances issued to{' '}
                                <strong>{vendor.name}</strong>:
                               {' '}
                                <strong>{CURRENCY} {supplierAdvances.reduce((s, a) => s + Math.max(0, a.remainingAmount), 0).toLocaleString()}</strong>
                                . Advances are allocated <strong>FIFO</strong> (oldest advances / oldest unpaid bills).
                                Remaining prepaid stays on the supplier for future bills when an advance exceeds a bill&apos;s balance.
                            </p>
                            {!supplierPartiesMixed && !editSettlement && (
                                <>
                                    <label className="flex items-start gap-2.5 cursor-pointer rounded-md bg-white/60 border border-emerald-100 px-3 py-2">
                                        <input
                                            type="checkbox"
                                            checked={applyPrepaidFifo}
                                            onChange={(e) => {
                                                setApplyPrepaidFifo(e.target.checked);
                                                if (!e.target.checked) {
                                                    setManualSettlementSplit(false);
                                                    setManualAdvanceAmounts({});
                                                }
                                            }}
                                            className="mt-0.5 rounded text-emerald-700 border-emerald-300 focus:ring-emerald-500"
                                            aria-label="Apply supplier prepaid advances toward this payment"
                                        />
                                        <span>
                                            <span className="font-semibold">Apply prepaid to this payment (FIFO).</span>{' '}
                                            Turn off to pay selected bills normally from your bank/cash account only (no prepaid
                                            allocation).
                                        </span>
                                    </label>
                                    {applyPrepaidFifo && (
                                        <label
                                            className={`flex flex-col gap-1 rounded-md border px-3 py-2 ${
                                                selectedSorted.length !== 1
                                                    ? 'border-slate-200 bg-slate-50/90 text-slate-500 cursor-not-allowed'
                                                    : 'cursor-pointer bg-white/60 border-emerald-100'
                                            }`}
                                            title={
                                                selectedSorted.length !== 1
                                                    ? 'Select exactly one bill to type your own prepaid and bank amounts.'
                                                    : undefined
                                            }
                                        >
                                            <span className="flex items-start gap-2.5">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 rounded text-emerald-700 border-emerald-300 focus:ring-emerald-500 disabled:opacity-50"
                                                    aria-label="Set prepaid and bank amounts manually"
                                                    checked={manualSettlementSplit}
                                                    disabled={selectedSorted.length !== 1}
                                                    onChange={(e) => {
                                                        const next = e.target.checked;
                                                        setManualSettlementSplit(next);
                                                        if (!next) {
                                                            setManualAdvanceAmounts({});
                                                            return;
                                                        }
                                                        const bill = selectedSorted[0];
                                                        if (!bill) return;
                                                        const plan = fifoSuggestedPlans.get(bill.id);
                                                        if (plan) {
                                                            const m: Record<string, string> = {};
                                                            plan.adjustments.forEach((adj) => {
                                                                m[adj.advanceId] = String(adj.amount);
                                                            });
                                                            setManualAdvanceAmounts(m);
                                                            setTotalAmount(plan.cash > EPS ? String(plan.cash) : '');
                                                        } else {
                                                            setManualAdvanceAmounts({});
                                                            setTotalAmount('');
                                                        }
                                                    }}
                                                />
                                                <span>
                                                    <span className="font-semibold">
                                                        Set prepaid and bank manually (partial payment).
                                                    </span>{' '}
                                                    Use prepaid only, bank only, both, or any partial split — total must stay within
                                                    the selected bill&apos;s unpaid balance. With several bills selected, FIFO above
                                                    still clears each bill in full.
                                                </span>
                                            </span>
                                        </label>
                                    )}
                                </>
                            )}
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
                                            aria-label="Select all bills"
                                            checked={selectedBillIds.size > 0 && selectedBillIds.size === pendingBills.length}
                                            onChange={handleSelectAll}
                                            disabled={!!editSettlement}
                                            className="rounded text-accent focus:ring-accent disabled:opacity-50"
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
                                                        aria-label={`Select bill ${bill.billNumber}`}
                                                        checked={selectedBillIds.has(bill.id)}
                                                        onChange={() => handleToggleBill(bill.id)}
                                                        disabled={!!editSettlement && bill.id !== editSettlement.billId}
                                                        className="rounded text-accent focus:ring-accent disabled:opacity-50"
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

                    {showAdvanceBreakdownPanel && (
                        <div className="mt-3 p-3 rounded-lg border border-slate-200 bg-white shadow-sm space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-700">
                                    {editSettlement
                                        ? 'Prepaid applied from each advance'
                                        : 'Prepaid — edit amounts (0 = none from this advance)'}
                                </p>
                                {!editSettlement && manualSettlementSplit && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="!text-[10px] !py-1 !px-2"
                                        onClick={() => {
                                            const bill = selectedSorted[0];
                                            if (!bill) return;
                                            const plan = fifoSuggestedPlans.get(bill.id);
                                            if (plan) {
                                                const m: Record<string, string> = {};
                                                plan.adjustments.forEach((adj) => {
                                                    m[adj.advanceId] = String(adj.amount);
                                                });
                                                setManualAdvanceAmounts(m);
                                                setTotalAmount(plan.cash > EPS ? String(plan.cash) : '');
                                            }
                                        }}
                                    >
                                        Fill from FIFO suggestion
                                    </Button>
                                )}
                            </div>
                            {editSettlement ? (
                                <p className="text-[11px] text-slate-500">
                                    You may increase or decrease this settlement after reversal limits (server validates). Prepaid plus
                                    bank/cash total must stay positive.
                                </p>
                            ) : (
                                manualSettlementSplit && (
                                    <p className="text-[11px] text-slate-500">
                                        Unpaid on selected bill{' '}
                                        <span className="font-mono font-semibold text-slate-800">
                                            {CURRENCY} {singleSelectedBillDueUi.toLocaleString()}
                                        </span>
                                        . Paid this time{' '}
                                        <span className="font-mono font-semibold text-slate-800">
                                            {CURRENCY} {allocationTotalUi.toLocaleString()}
                                        </span>
                                        {allocationTotalUi > singleSelectedBillDueUi + EPS ? (
                                            <span className="text-rose-700"> — exceeds due; reduce amounts.</span>
                                        ) : null}
                                        {allocationTotalUi > EPS &&
                                        allocationTotalUi < singleSelectedBillDueUi - EPS ? (
                                            <span className="text-amber-800"> — partial bill payment.</span>
                                        ) : null}
                                    </p>
                                )
                            )}
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {advanceInputRowsForUi.length > 0 ? (
                                    advanceInputRowsForUi.map((a) => (
                                        <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                                            <span className="flex-1 text-slate-600 text-xs">
                                                {a.advanceDate ? formatDate(a.advanceDate) : '—'} — prepaid remaining{' '}
                                                <span className="font-mono">{CURRENCY} {a.remainingAmount.toLocaleString()}</span>
                                            </span>
                                            <Input
                                                id={`advance-amt-${a.id}`}
                                                name={`advance-amt-${a.id}`}
                                                aria-label={`Amount from prepaid advance dated ${a.advanceDate ? formatDate(a.advanceDate) : 'unknown'}`}
                                                type="number"
                                                compact
                                                className="!max-w-[140px]"
                                                value={manualAdvanceAmounts[a.id] ?? ''}
                                                onChange={(e) =>
                                                    setManualAdvanceAmounts((prev) => ({
                                                        ...prev,
                                                        [a.id]: e.target.value,
                                                    }))
                                                }
                                                placeholder="0"
                                            />
                                        </div>
                                    ))
                                ) : (
                                    manualSettlementSplit &&
                                    !editSettlement && (
                                        <p className="text-[11px] text-slate-500">
                                            No separate prepaid advances — pay from bank/cash below (or{' '}
                                            <span className="font-semibold">0</span> there for prepaid-only if you allocate above when
                                            advances appear).
                                        </p>
                                    )
                                )}
                            </div>
                            <p className={`text-[11px] font-medium ${allocationTotalUi > EPS ? 'text-emerald-800' : 'text-rose-700'}`}>
                                Allocated — prepaid: {CURRENCY} {appliedFromAdvances.toLocaleString()} | bank/cash:{' '}
                                {CURRENCY} {cashToPayFromBank.toLocaleString()} | total: {CURRENCY}{' '}
                                {allocationTotalUi.toLocaleString()}
                            </p>
                        </div>
                    )}
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <ComboBox
                            id="payment-account"
                            name="payment-account"
                            label={
                                advanceSettlementPath
                                    ? 'Bank / cash account (remainder after advances)'
                                    : 'Bank / cash account'
                            }
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
                                    ? editSettlement || (manualSettlementSplit && selectedSorted.length === 1)
                                        ? `Bank / cash portion (0 = prepaid-only; editable — current bank leg ${CURRENCY} ${cashToPayFromBank.toLocaleString()})`
                                        : `Cash payable from bank (FIFO remainder — ${CURRENCY} ${cashToPayFromBank.toLocaleString()} planned)`
                                    : 'Total payment amount'
                            }
                            type="number"
                            value={totalAmount}
                            onChange={(e) => setTotalAmount(e.target.value)}
                            disabled={!cashFieldEditable}
                            required={!advanceSettlementPath}
                            readOnly={!cashFieldEditable}
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
                        {primaryActionLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default VendorBillPaymentModal;
