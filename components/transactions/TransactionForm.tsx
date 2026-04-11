
import React, { useState, useEffect, useMemo } from 'react';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { Transaction, TransactionType, LoanSubtype, ContactType, Account, InvoiceStatus, AccountType, ContractStatus } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY } from '../../constants';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { resolveExpenseCategoryForBillPayment } from '../../utils/rentalBillPayments';
import { buildLedgerPaidByInvoiceMap, getEffectivePaidForInvoice } from '../../utils/ledgerInvoicePayments';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';
import { validateExpenseCashForProject } from '../../services/accounting/accountingLedgerCore';

interface TransactionFormProps {
    onClose: () => void;
    transactionToEdit?: Transaction | null;
    transactionTypeForNew?: TransactionType | null;
    onShowDeleteWarning: (tx: Transaction) => void;
}

type CostCenterType = 'project' | 'building' | 'general';

const TransactionForm: React.FC<TransactionFormProps> = ({ onClose, transactionToEdit, transactionTypeForNew, onShowDeleteWarning }) => {
    const state = useStateSelector(s => s);
    const dispatch = useDispatchOnly();
    const { showAlert, showConfirm } = useNotification();
    const { openChat } = useWhatsApp();
    const entityFormModal = useEntityFormModal();

    const [type, setType] = useState<TransactionType>(transactionToEdit?.type || transactionTypeForNew || TransactionType.EXPENSE);
    const [subtype, setSubtype] = useState<LoanSubtype | ''>(transactionToEdit?.subtype || '');
    const [amount, setAmount] = useState(transactionToEdit ? Math.abs(transactionToEdit.amount).toString() : '');

    // Get initial date: use preserved date if option is enabled and creating new transaction
    const getInitialDate = () => {
        if (transactionToEdit) {
            return parseStoredDateToYyyyMmDdInput(transactionToEdit.date);
        }
        if (state.enableDatePreservation && state.lastPreservedDate) {
            return state.lastPreservedDate;
        }
        return toLocalDateString(new Date());
    };

    const [date, setDate] = useState(getInitialDate());

    // Save date to preserved date when changed (if option is enabled)
    const handleDateChange = (dateValue: Date) => {
        const dateStr = toLocalDateString(dateValue);
        setDate(dateStr);
        if (state.enableDatePreservation && !transactionToEdit) {
            dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: dateStr });
        }
    };
    const [description, setDescription] = useState(transactionToEdit?.description || '');

    const [accountId, setAccountId] = useState(transactionToEdit?.accountId || '');
    const [toAccountId, setToAccountId] = useState(transactionToEdit?.toAccountId || '');

    const [categoryId, setCategoryId] = useState(transactionToEdit?.categoryId || '');
    const [contactId, setContactId] = useState(transactionToEdit?.contactId || '');
    const [projectId, setProjectId] = useState(transactionToEdit?.projectId || state.defaultProjectId || '');
    const [buildingId, setBuildingId] = useState(transactionToEdit?.buildingId || '');
    const [propertyId, setPropertyId] = useState(transactionToEdit?.propertyId || '');
    const [unitId, setUnitId] = useState(transactionToEdit?.unitId || '');
    const [linkedBillId, setLinkedBillId] = useState(transactionToEdit?.billId || '');
    const [contractId, setContractId] = useState(transactionToEdit?.contractId || '');

    // Derived State for Bill Payment
    const billBeingPaid = useMemo(() => state.bills.find(b => b.id === linkedBillId), [state.bills, linkedBillId]);
    const isPayingBill = !!billBeingPaid;

    /**
     * For a *new* bill payment, max = balance due (amount − paidAmount).
     * When *editing* an existing payment, paidAmount already includes this transaction, so balance due is too low.
     * Max for the edited amount = balanceDue + |this payment| (release then re-apply in reducer).
     */
    const billPaymentCapInfo = useMemo(() => {
        if (!billBeingPaid) {
            return { balanceDue: 0, maxPaymentAmount: 0, isEditingThisBillPayment: false };
        }
        const balanceDue = billBeingPaid.amount - (billBeingPaid.paidAmount || 0);
        const isEditingThisBillPayment =
            !!transactionToEdit?.id &&
            transactionToEdit.billId === billBeingPaid.id;
        const maxPaymentAmount =
            balanceDue + (isEditingThisBillPayment ? Math.abs(transactionToEdit.amount) : 0);
        return { balanceDue, maxPaymentAmount, isEditingThisBillPayment };
    }, [billBeingPaid, transactionToEdit?.id, transactionToEdit?.billId, transactionToEdit?.amount]);

    /** Bill line-item categories often omit bill.categoryId — resolve same as payment save path. */
    const billPaymentCategoryLabel = useMemo(() => {
        if (!billBeingPaid) return 'Uncategorized';
        const cid = resolveExpenseCategoryForBillPayment(billBeingPaid, state.categories, state.rentalAgreements);
        if (!cid) return 'Uncategorized';
        return state.categories.find(c => c.id === cid)?.name || 'Uncategorized';
    }, [billBeingPaid, state.categories, state.rentalAgreements]);

    const billVendorLabel = useMemo(() => {
        if (!billBeingPaid) return '';
        if (billBeingPaid.vendorId) {
            return state.vendors?.find(v => v.id === billBeingPaid.vendorId)?.name || '';
        }
        if (billBeingPaid.contactId) {
            return state.contacts.find(c => c.id === billBeingPaid.contactId)?.name || '';
        }
        return '';
    }, [billBeingPaid, state.vendors, state.contacts]);

    /** Prefill category from bill when editing/creating a payment that has no category stored. */
    useEffect(() => {
        if (!billBeingPaid || type !== TransactionType.EXPENSE) return;
        const resolved = resolveExpenseCategoryForBillPayment(billBeingPaid, state.categories, state.rentalAgreements);
        if (!resolved) return;
        const txHasCategory = transactionToEdit?.categoryId != null && String(transactionToEdit.categoryId).trim() !== '';
        if (!txHasCategory) {
            setCategoryId(resolved);
        }
    }, [billBeingPaid?.id, type, transactionToEdit?.id, transactionToEdit?.categoryId, state.categories, state.rentalAgreements]);

    // Invoice payment context (project/shop selling): balance due for validation and hint
    const ledgerPaidByInvoiceId = useMemo(
        () => buildLedgerPaidByInvoiceMap(state.transactions),
        [state.transactions]
    );

    const invoiceBeingPaid = useMemo(() => {
        if (type !== TransactionType.INCOME || !transactionToEdit?.invoiceId || transactionToEdit?.id) return null;
        return state.invoices.find(i => i.id === transactionToEdit.invoiceId) || null;
    }, [type, transactionToEdit?.invoiceId, transactionToEdit?.id, state.invoices]);

    const invoiceEffectivePaid = useMemo(() => {
        if (!invoiceBeingPaid) return 0;
        return getEffectivePaidForInvoice(
            invoiceBeingPaid.id,
            invoiceBeingPaid.paidAmount,
            ledgerPaidByInvoiceId
        );
    }, [invoiceBeingPaid, ledgerPaidByInvoiceId]);

    const invoiceBalanceDue = invoiceBeingPaid ? invoiceBeingPaid.amount - invoiceEffectivePaid : 0;

    // Filter for Bank Accounts Only (exclude Internal Clearing)
    const bankAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    // Cost Center State Logic
    const [costCenterType, setCostCenterType] = useState<CostCenterType>(() => {
        if (transactionToEdit?.projectId) return 'project';
        if (transactionToEdit?.buildingId) return 'building';
        return 'general';
    });

    // Available Contracts Logic
    const availableContracts = useMemo(() => {
        if (type !== TransactionType.EXPENSE || costCenterType !== 'project' || !projectId || !contactId) return [];

        // Filter contracts for this project and vendor (Active only, unless editing an existing transaction with that contract)
        return (state.contracts || []).filter(c =>
            c.projectId === projectId &&
            c.vendorId === contactId &&
            (c.status === ContractStatus.ACTIVE || c.id === contractId)
        ).map(c => ({ id: c.id, name: `${c.contractNumber} - ${c.name}` }));
    }, [state.contracts, type, costCenterType, projectId, contactId, contractId]);

    // Initialize default account (including when paying a bill — new transaction)
    useEffect(() => {
        const isNew = !transactionToEdit || !transactionToEdit.id;
        if (isNew && !accountId && bankAccounts.length > 0) {
            const cash = bankAccounts.find(a => a.name === 'Cash');
            if (cash) setAccountId(cash.id);
            else setAccountId(bankAccounts[0].id);
        }
    }, [transactionToEdit, transactionToEdit?.id, accountId, bankAccounts]);

    // Reset fields when switching types
    useEffect(() => {
        if (type !== TransactionType.LOAN) setSubtype('');
        else if (!subtype && !transactionToEdit) setSubtype(LoanSubtype.GIVE);
    }, [type]);

    // Auto-update context based on Cost Center selections (only if NOT paying a specific bill or editing one with fixed context)
    useEffect(() => {
        if (type !== TransactionType.TRANSFER && type !== TransactionType.LOAN && !linkedBillId && !transactionToEdit) {
            if (costCenterType === 'project') {
                setBuildingId('');
                setPropertyId('');
                if (!projectId) setContactId('');
            } else if (costCenterType === 'building') {
                setProjectId('');
                setPropertyId('');
                // Keep contactId as it might be a vendor for the building
            } else {
                setProjectId('');
                setBuildingId('');
                setPropertyId('');
            }
        }
    }, [costCenterType, type, linkedBillId, transactionToEdit, projectId]);

    const filteredCategories = useMemo(() => {
        return state.categories.filter(c => c.type === type);
    }, [state.categories, type]);

    const filteredContacts = useMemo(() => {
        const list = (type === TransactionType.LOAN)
            ? state.contacts.filter(c => c.type === ContactType.FRIEND_FAMILY)
            : state.contacts;
        return list.filter(c => c.isActive !== false || c.id === contactId);
    }, [state.contacts, type, contactId]);

    // Filtered Bills for Linking
    const availableBills = useMemo(() => {
        if (type !== TransactionType.EXPENSE) return [];
        return state.bills.filter(b => {
            if (b.status === InvoiceStatus.PAID && b.id !== transactionToEdit?.billId) return false;

            // Match Context
            if (costCenterType === 'project') {
                return b.projectId === projectId;
            }
            if (costCenterType === 'building') {
                return b.buildingId === buildingId;
            }
            return !b.projectId && !b.buildingId; // General bills
        });
    }, [state.bills, type, costCenterType, projectId, buildingId, transactionToEdit]);

    const getAccountLabel = () => {
        if (type === TransactionType.TRANSFER) return "From Account";
        if (type === TransactionType.INCOME) return "Deposit To";
        if (type === TransactionType.LOAN) {
            return subtype === LoanSubtype.RECEIVE ? "Deposit To" : "Pay From";
        }
        return "Pay From";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert('Please enter a valid positive amount.');
            return;
        }
        if (!accountId) {
            await showAlert('Please select an account.');
            return;
        }

        // Cost Center Validation (For Expense OR Income if Project/Building selected)
        // For loans, project/building is optional
        if (type !== TransactionType.TRANSFER && type !== TransactionType.LOAN && !isPayingBill) {
            if (costCenterType === 'project' && !projectId) {
                await showAlert('Please select a Project.');
                return;
            }
            if (costCenterType === 'building' && !buildingId) {
                await showAlert('Please select a Building.');
                return;
            }
        }

        if (type === TransactionType.TRANSFER && !toAccountId) {
            await showAlert('Please select a destination account for transfer.');
            return;
        }
        if (type === TransactionType.TRANSFER && accountId === toAccountId) {
            await showAlert('Source and destination accounts cannot be the same.');
            return;
        }
        if (type === TransactionType.LOAN && !contactId) {
            await showAlert('Please select a contact for the loan.');
            return;
        }

        // Invoice payment: do not allow amount above balance due (project/shop selling invoices)
        if (type === TransactionType.INCOME && transactionToEdit?.invoiceId && !transactionToEdit?.id) {
            const invoice = state.invoices.find(i => i.id === transactionToEdit.invoiceId);
            if (invoice) {
                const effectivePaid = getEffectivePaidForInvoice(
                    invoice.id,
                    invoice.paidAmount,
                    ledgerPaidByInvoiceId
                );
                const balanceDue = invoice.amount - effectivePaid;
                if (numAmount > balanceDue + 0.01) {
                    await showAlert(
                        `Payment amount (${CURRENCY} ${numAmount.toLocaleString()}) cannot exceed the balance due on this invoice (${CURRENCY} ${balanceDue.toLocaleString()}). Please enter an amount up to the balance due.`
                    );
                    return;
                }
            }
        }

        // Bill payment: cap by remaining bill capacity (see billPaymentCapInfo when editing)
        if (linkedBillId && type === TransactionType.EXPENSE && billBeingPaid) {
            const cap = billPaymentCapInfo.maxPaymentAmount;
            if (numAmount > cap + 0.01) {
                await showAlert(
                    billPaymentCapInfo.isEditingThisBillPayment
                        ? `Payment amount (${CURRENCY} ${numAmount.toLocaleString()}) cannot exceed the maximum for this bill (${CURRENCY} ${cap.toLocaleString()}). That is the unpaid balance plus the amount of this payment (so you can raise or lower it).`
                        : `Payment amount (${CURRENCY} ${numAmount.toLocaleString()}) cannot exceed the balance due on this bill (${CURRENCY} ${cap.toLocaleString()}). Please enter an amount up to the balance due.`
                );
                return;
            }
        }

        // Cost center fields: only include when the matching tab is selected, so switching to General clears project/building
        const costCenterProjectId = costCenterType === 'project' ? (projectId || undefined) : undefined;
        const costCenterBuildingId = costCenterType === 'building' ? (buildingId || undefined) : undefined;
        const costCenterPropertyId = costCenterType === 'building' ? (propertyId || undefined) : undefined;
        const costCenterUnitId = costCenterType === 'building' ? (unitId || undefined) : undefined;
        const costCenterContractId = costCenterType === 'project' ? (contractId || undefined) : undefined;

        if (type === TransactionType.EXPENSE) {
            const payAcc = state.accounts.find((a) => a.id === accountId);
            if (payAcc?.name === 'Internal Clearing') {
                // Profit-distribution / clearing legs — not real bank cash; skip project cash guard
            } else if (!isPayingBill) {
            const projectIdForCash = costCenterProjectId ?? undefined;
            const dateYmd = /^\d{4}-\d{2}-\d{2}$/.test(date)
                ? date
                : new Date(date).toISOString().slice(0, 10);
            const cashCheck = validateExpenseCashForProject(state, {
                amount: numAmount,
                accountId,
                projectId: projectIdForCash,
                dateYyyyMmDd: dateYmd,
                excludeTransactionId: transactionToEdit?.id,
            });
            if (!cashCheck.ok) {
                await showAlert(
                    `Insufficient cash on this account for the selected project scope. Available: ${CURRENCY} ${cashCheck.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. This expense needs ${CURRENCY} ${numAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Record funding (capital) first or reduce the amount.`
                );
                return;
            }
            }
        }

        const expenseCategoryForBill =
            isPayingBill && billBeingPaid && type === TransactionType.EXPENSE
                ? resolveExpenseCategoryForBillPayment(billBeingPaid, state.categories, state.rentalAgreements)
                : undefined;
        const categoryForTx =
            type === TransactionType.TRANSFER || type === TransactionType.LOAN
                ? undefined
                : expenseCategoryForBill ?? categoryId;

        const dateIso =
            /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : new Date(date).toISOString();
        const baseTx = {
            type,
            subtype: subtype || undefined,
            amount: numAmount,
            date: dateIso,
            description,
            accountId,
            fromAccountId: type === TransactionType.TRANSFER ? accountId : undefined,
            toAccountId: type === TransactionType.TRANSFER ? toAccountId : undefined,
            categoryId: categoryForTx,
            contactId: contactId || undefined,
            projectId: costCenterProjectId,
            buildingId: costCenterBuildingId,
            propertyId: costCenterPropertyId,
            unitId: costCenterUnitId,
            invoiceId: transactionToEdit?.invoiceId,
            billId: linkedBillId || undefined, // Use state linked bill
            agreementId: transactionToEdit?.agreementId,
            contractId: costCenterContractId,
        };

        if (transactionToEdit && transactionToEdit.id) {
            dispatch({ type: 'UPDATE_TRANSACTION', payload: { ...transactionToEdit, ...baseTx } });
            onClose();
            return;
        }

        // --- Bill payment: local-only uses local DB (dispatch); otherwise API-first ---
        const isPayingBillFlow = !!linkedBillId && type === TransactionType.EXPENSE;
        if (isPayingBillFlow) {
            const txId = `txn-bill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const payload = { ...baseTx, id: txId } as Transaction;

            if (isLocalOnlyMode()) {
                // Local-only: persist via dispatch only (reducer + persistence layer write to local DB)
                dispatch({ type: 'ADD_TRANSACTION', payload });
                onClose();
                return;
            }

            try {
                // Cloud: ensure bill exists on server, then save transaction via API
                const bill = state.bills.find(b => b.id === linkedBillId);
                if (bill) {
                    await getAppStateApiService().saveBill(bill);
                }
                const saved = await getAppStateApiService().saveTransaction(payload) as Transaction;
                dispatch({ type: 'ADD_TRANSACTION', payload: saved });
                if (bill) {
                    const newPaidAmount = (bill.paidAmount || 0) + numAmount;
                    const newStatus = newPaidAmount >= bill.amount - 0.01
                        ? InvoiceStatus.PAID
                        : newPaidAmount > 0.01
                            ? InvoiceStatus.PARTIALLY_PAID
                            : InvoiceStatus.UNPAID;
                    dispatch({ type: 'UPDATE_BILL', payload: { ...bill, paidAmount: newPaidAmount, status: newStatus } });
                }
                onClose();
                return;
            } catch (err: any) {
                const msg = err?.message || err?.error || 'Payment could not be saved to cloud. Please check your account exists in cloud and try again.';
                await showAlert(`Payment failed: ${msg}`);
                return;
            }
        }

        // --- Non–bill-payment: local-first, then sync ---
        dispatch({ type: 'ADD_TRANSACTION', payload: { ...baseTx, id: Date.now().toString() } });

        // --- WhatsApp Receipt Logic for New Invoice Payments ---
        if (type === TransactionType.INCOME && baseTx.invoiceId) {
            const invoice = state.invoices.find(i => i.id === baseTx.invoiceId);
            const contact = state.contacts.find(c => c.id === baseTx.contactId);

            if (invoice && contact && contact.contactNo) {
                const confirmReceipt = await showConfirm(
                    "Payment recorded successfully. Do you want to send the receipt on WhatsApp?",
                    { title: "Send Receipt", confirmLabel: "Send WhatsApp", cancelLabel: "No, Later" }
                );

                if (confirmReceipt) {
                    let subject = 'Invoice';
                    let unitName = '';
                    if (invoice.projectId) {
                        const project = state.projects.find(p => p.id === invoice.projectId);
                        const unit = state.units.find(u => u.id === invoice.unitId);
                        subject = project ? project.name : 'Project';
                        if (unit) {
                            subject += ` - Unit ${unit.name}`;
                            unitName = unit.name;
                        }
                    }

                    const paidBefore = getEffectivePaidForInvoice(
                        invoice.id,
                        invoice.paidAmount,
                        ledgerPaidByInvoiceId
                    );
                    const totalPaid = paidBefore + numAmount;
                    const remainingBalance = Math.max(0, invoice.amount - totalPaid);

                    try {
                        const { whatsAppTemplates } = state;
                        const message = WhatsAppService.generateInvoiceReceipt(
                            whatsAppTemplates.invoiceReceipt,
                            contact,
                            invoice.invoiceNumber,
                            numAmount,
                            remainingBalance,
                            subject,
                            unitName
                        );
                        sendOrOpenWhatsApp(
                            { contact, message, phoneNumber: contact.contactNo },
                            () => state.whatsAppMode,
                            openChat
                        );
                    } catch (error) {
                        await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
                    }
                }
            }
        }
        onClose();
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (transactionToEdit && transactionToEdit.id) {
            onShowDeleteWarning(transactionToEdit);
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-4">

                {/* BILL PAYMENT CONTEXT BANNER */}
                {isPayingBill && (!transactionToEdit?.billId || transactionToEdit.id) && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm mb-4">
                        <div className="flex justify-between items-start mb-2 border-b border-gray-200 pb-2">
                            <div>
                                <span className="font-semibold text-gray-800 block">Paying Bill #{billBeingPaid.billNumber}</span>
                                <span className="text-gray-500 text-xs">Vendor: {billVendorLabel || '—'}</span>
                            </div>
                            {/* Only allow unlinking if we are not in forced edit/pay mode */}
                            {!transactionToEdit?.billId && (
                                <button type="button" onClick={() => setLinkedBillId('')} className="text-xs text-red-600 hover:text-red-700 font-medium">
                                    Unlink Bill
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-gray-600">
                            <div><span className="font-semibold">Category:</span> {billPaymentCategoryLabel}</div>
                            {billBeingPaid.projectId && <div><span className="font-semibold">Project:</span> {state.projects.find(p => p.id === billBeingPaid.projectId)?.name}</div>}
                            {billBeingPaid.buildingId && <div><span className="font-semibold">Building:</span> {state.buildings.find(b => b.id === billBeingPaid.buildingId)?.name}</div>}
                            {billBeingPaid.propertyId && <div><span className="font-semibold">Property:</span> {state.properties.find(p => p.id === billBeingPaid.propertyId)?.name}</div>}
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200 text-xs font-medium text-amber-800 bg-amber-50 rounded px-2 py-1">
                            {billPaymentCapInfo.isEditingThisBillPayment ? (
                                <>
                                    Maximum for this payment: <strong>{CURRENCY} {billPaymentCapInfo.maxPaymentAmount.toLocaleString()}</strong>
                                    {' '}(balance due {CURRENCY} {billPaymentCapInfo.balanceDue.toLocaleString()} plus this payment’s amount — you can change the payment up to the maximum).
                                </>
                            ) : (
                                <>
                                    Balance due: <strong>{CURRENCY} {billPaymentCapInfo.balanceDue.toLocaleString()}</strong> — payment cannot exceed this amount.
                                </>
                            )}
                        </div>
                        {billBeingPaid.contractId && (
                            <div className="text-green-600 font-medium mt-1 pt-1 border-t border-gray-200">
                                Linked to Contract: {state.contracts.find(c => c.id === billBeingPaid.contractId)?.name}
                            </div>
                        )}
                    </div>
                )}

                {/* Top Row: Type & Date */}
                <div className="grid grid-cols-2 gap-4">
                    {!isPayingBill && (
                        <Select
                            id="transaction-type"
                            name="transaction-type"
                            label="Type"
                            value={type}
                            onChange={e => setType(e.target.value as TransactionType)}
                            disabled={!!transactionToEdit}
                        >
                            {Object.values(TransactionType).map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                    )}

                    <div className={isPayingBill ? "col-span-2" : ""}>
                        {type === TransactionType.LOAN ? (
                            <Select
                                id="transaction-action"
                                name="transaction-action"
                                label="Action"
                                value={subtype}
                                onChange={e => setSubtype(e.target.value as LoanSubtype)}
                            >
                                <option value={LoanSubtype.RECEIVE}>Receive Loan</option>
                                <option value={LoanSubtype.GIVE}>Give Loan</option>
                            </Select>
                        ) : (
                            <DatePicker
                                id="transaction-date"
                                name="transaction-date"
                                label="Date"
                                value={date}
                                onChange={handleDateChange}
                                required
                            />
                        )}
                    </div>
                </div>

                {type === TransactionType.LOAN && (
                    <DatePicker
                        id="transaction-loan-date"
                        name="transaction-loan-date"
                        label="Date"
                        value={date}
                        onChange={handleDateChange}
                        required
                    />
                )}

                <Input
                    id="transaction-amount"
                    name="transaction-amount"
                    label="Amount"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    autoFocus={!isPayingBill}
                    className="block w-full px-3 py-3 sm:py-2 border-2 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-base sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors tabular-nums text-lg font-bold"
                />
                {invoiceBeingPaid && invoiceBalanceDue >= 0 && (
                    <p className="text-sm text-slate-500 -mt-2">
                        Balance due on this invoice: <span className="font-semibold text-slate-700">{CURRENCY} {invoiceBalanceDue.toLocaleString()}</span> — payment cannot exceed this amount.
                    </p>
                )}

                {/* Account Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ComboBox
                        id="transaction-account"
                        name="transaction-account"
                        label={getAccountLabel()}
                        items={bankAccounts}
                        selectedId={accountId}
                        onSelect={item => setAccountId(item?.id || '')}
                        required
                        entityType="account"
                        onAddNew={(entityType, name) => {
                            entityFormModal.openForm('account', name, undefined, undefined, (newId) => {
                                setAccountId(newId);
                            });
                        }}
                    />
                    {type === TransactionType.TRANSFER && (
                        <ComboBox
                            id="transaction-to-account"
                            name="transaction-to-account"
                            label="To Account"
                            items={bankAccounts}
                            selectedId={toAccountId}
                            onSelect={item => setToAccountId(item?.id || '')}
                            required
                            entityType="account"
                            onAddNew={(entityType, name) => {
                                entityFormModal.openForm('account', name, undefined, undefined, (newId) => {
                                    setToAccountId(newId);
                                });
                            }}
                        />
                    )}
                </div>

                {/* Hidden inputs when paying bill - Context is managed via bill ID logic */}
                {!isPayingBill && (
                    <>
                        {/* Category */}
                        {type !== TransactionType.TRANSFER && type !== TransactionType.LOAN && (
                            <ComboBox
                                id="transaction-category"
                                name="transaction-category"
                                label="Category"
                                items={filteredCategories}
                                selectedId={categoryId}
                                onSelect={item => setCategoryId(item?.id || '')}
                                placeholder="Select Category"
                                entityType="category"
                                onAddNew={(entityType, name) => {
                                    entityFormModal.openForm('category', name, undefined, type, (newId) => {
                                        setCategoryId(newId);
                                    });
                                }}
                            />
                        )}

                        {/* COST CENTER SELECTION - INCOME, EXPENSE & LOAN */}
                        {type !== TransactionType.TRANSFER && (
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                                <label className="block text-sm font-semibold text-gray-700">Cost Center Allocation {type === TransactionType.LOAN && '(Optional)'}</label>

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setCostCenterType('general')}
                                        className={`flex-1 py-2 text-xs font-medium rounded border ${costCenterType === 'general' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        General
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCostCenterType('project')}
                                        className={`flex-1 py-2 text-xs font-medium rounded border ${costCenterType === 'project' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        Project
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCostCenterType('building')}
                                        className={`flex-1 py-2 text-xs font-medium rounded border ${costCenterType === 'building' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        Building
                                    </button>
                                </div>

                                {costCenterType === 'project' && (
                                    <div className="animate-fade-in space-y-3">
                                        <ComboBox
                                            id="transaction-project"
                                            name="transaction-project"
                                            label="Select Project"
                                            items={state.projects}
                                            selectedId={projectId}
                                            onSelect={item => setProjectId(item?.id || '')}
                                            placeholder="Search Projects..."
                                            entityType="project"
                                            onAddNew={(entityType, name) => {
                                                entityFormModal.openForm('project', name, undefined, undefined, (newId) => {
                                                    setProjectId(newId);
                                                });
                                            }}
                                        />
                                    </div>
                                )}

                                {costCenterType === 'building' && (
                                    <div className="animate-fade-in space-y-3">
                                        <ComboBox
                                            id="transaction-building"
                                            name="transaction-building"
                                            label="Select Building"
                                            items={state.buildings}
                                            selectedId={buildingId}
                                            onSelect={item => setBuildingId(item?.id || '')}
                                            placeholder="Search Buildings..."
                                            entityType="building"
                                            onAddNew={(entityType, name) => {
                                                entityFormModal.openForm('building', name, undefined, undefined, (newId) => {
                                                    setBuildingId(newId);
                                                });
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Link to Bill (Optional) - EXPENSE ONLY */}
                        {type === TransactionType.EXPENSE && (costCenterType !== 'general' || linkedBillId) && (
                            <div className="bg-white border border-gray-200 rounded p-3">
                                <ComboBox
                                    id="transaction-linked-bill"
                                    name="transaction-linked-bill"
                                    label="Link to Bill (Optional)"
                                    items={availableBills.map(b => ({
                                        id: b.id,
                                        name: `#${b.billNumber} - ${state.contacts.find(c => c.id === b.contactId)?.name || 'Supplier'} (${Math.round(b.amount - b.paidAmount)})`
                                    }))}
                                    selectedId={linkedBillId}
                                    onSelect={item => {
                                        setLinkedBillId(item?.id || '');
                                        if (item?.id) {
                                            // Auto-fill context from bill if linked
                                            const bill = state.bills.find(b => b.id === item.id);
                                            if (bill) {
                                                setAmount((bill.amount - bill.paidAmount).toString());
                                                if (bill.projectId) setProjectId(bill.projectId);
                                                if (bill.buildingId) setBuildingId(bill.buildingId);
                                                if (bill.propertyId) setPropertyId(bill.propertyId);

                                                // Check if this is a tenant-allocated bill
                                                let tenantId: string | undefined = undefined;

                                                // Check if bill has a rental agreement (tenant bill)
                                                if (bill.projectAgreementId) {
                                                    const rentalAgreement = state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId);
                                                    if (rentalAgreement) {
                                                        tenantId = rentalAgreement.contactId;
                                                    }
                                                }

                                                // If no rental agreement found via projectAgreementId, check propertyId
                                                if (!tenantId && bill.propertyId) {
                                                    const rentalAgreement = state.rentalAgreements.find(ra =>
                                                        ra.propertyId === bill.propertyId && ra.status === 'Active'
                                                    );
                                                    if (rentalAgreement) {
                                                        tenantId = rentalAgreement.contactId;
                                                    }
                                                }

                                                const resolvedCat = resolveExpenseCategoryForBillPayment(bill, state.categories, state.rentalAgreements);
                                                // For tenant-allocated bills, use tenant contactId; otherwise use vendor contactId
                                                if (tenantId) {
                                                    setContactId(tenantId);
                                                    if (resolvedCat) setCategoryId(resolvedCat);
                                                } else {
                                                    // Not a tenant bill - use vendor contactId
                                                    if (bill.contactId) setContactId(bill.contactId);
                                                    if (resolvedCat) setCategoryId(resolvedCat);
                                                }

                                                if (bill.contractId) setContractId(bill.contractId);
                                            }
                                        }
                                    }}
                                    placeholder="Select unpaid bill..."
                                    allowAddNew={false}
                                />
                            </div>
                        )}

                        {/* Standard Contact Selection */}
                        {(type !== TransactionType.EXPENSE || costCenterType === 'general' || (costCenterType === 'project' && !linkedBillId)) && (
                            <ComboBox
                                id="transaction-contact"
                                name="transaction-contact"
                                label={type === TransactionType.LOAN ? "Contact / Payee" : "Contact"}
                                items={filteredContacts}
                                selectedId={contactId}
                                onSelect={item => { setContactId(item?.id || ''); setContractId(''); }}
                                placeholder={type === TransactionType.LOAN ? "Select Friend & Family" : "Select Contact"}
                                allowAddNew={type !== TransactionType.LOAN}
                                required={type === TransactionType.LOAN}
                                entityType={type !== TransactionType.LOAN ? "contact" : undefined}
                                onAddNew={type !== TransactionType.LOAN ? ((entityType, name) => {
                                    // Determine contact type based on transaction type
                                    let contactType: ContactType | undefined = undefined;
                                    if (type === TransactionType.EXPENSE) {
                                        contactType = ContactType.VENDOR;
                                    } else if (type === TransactionType.INCOME) {
                                        contactType = ContactType.CLIENT;
                                    }
                                    entityFormModal.openForm('contact', name, contactType, undefined, (newId) => {
                                        setContactId(newId);
                                    });
                                }) : undefined}
                            />
                        )}

                        {/* Contract Selection (If Project + Vendor Selected) */}
                        {availableContracts.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded p-3">
                                <ComboBox
                                    id="transaction-contract"
                                    name="transaction-contract"
                                    label="Link to Contract (Optional)"
                                    items={availableContracts}
                                    selectedId={contractId}
                                    onSelect={item => setContractId(item?.id || '')}
                                    placeholder="Select a contract..."
                                    allowAddNew={false}
                                />
                                <p className="text-xs text-green-600 mt-1">Linking to a contract will track this expense against the contract budget.</p>
                            </div>
                        )}
                    </>
                )}

                <Input
                    id="transaction-description"
                    name="transaction-description"
                    label="Description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Details..."
                />

                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4">
                    <div>
                        {transactionToEdit && transactionToEdit.id && (
                            <Button type="button" variant="danger" onClick={handleDelete} className="w-full sm:w-auto">Delete</Button>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
                        <Button type="submit" className="w-full sm:w-auto">{transactionToEdit && transactionToEdit.id ? 'Update' : 'Save'}</Button>
                    </div>
                </div>
            </form>
            <EntityFormModal
                isOpen={entityFormModal.isFormOpen}
                formType={entityFormModal.formType}
                initialName={entityFormModal.initialName}
                contactType={entityFormModal.contactType}
                categoryType={entityFormModal.categoryType}
                onClose={entityFormModal.closeForm}
                onSubmit={entityFormModal.handleSubmit}
            />
        </>
    );
};

export default TransactionForm;
