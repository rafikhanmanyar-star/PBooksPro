
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, TransactionType, Transaction, AccountType, InvoiceType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { getOwnerIdForPropertyOnDate } from '../../services/ownershipHistoryUtils';
import { getOwnershipSharesForPropertyOnDate, primaryOwnerIdFromShares } from '../../services/propertyOwnershipService';
import {
    buildOwnerRentAllocationTransactions,
    multiOwnerShareSplitError,
    shouldPostOwnerRentAllocation,
} from '../../services/rentOwnerAllocation';
import { accountIdMatchesLogical } from '../../services/systemEntityIds';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';

interface RentalPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: Invoice | null;
    /** When provided, shows edit form for this payment transaction instead of recording new payment */
    transactionToEdit?: Transaction | null;
    /** Called when user clicks Delete in edit mode */
    onShowDeleteWarning?: (tx: Transaction) => void;
}

const RentalPaymentModal: React.FC<RentalPaymentModalProps> = ({ isOpen, onClose, invoice, transactionToEdit, onShowDeleteWarning }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showConfirm } = useNotification();
    const { openChat } = useWhatsApp();

    const [rentPaidAmount, setRentPaidAmount] = useState('0');
    const [securityDepositPaidAmount, setSecurityDepositPaidAmount] = useState('0');
    const [paymentDate, setPaymentDate] = useState(toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [description, setDescription] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [error, setError] = useState('');

    const isEditMode = !!(transactionToEdit && transactionToEdit.id);

    // Resolve invoice: use prop or from transaction when in edit mode
    const effectiveInvoice = useMemo(() => {
        if (invoice) return invoice;
        if (transactionToEdit?.invoiceId) return state.invoices.find(i => i.id === transactionToEdit.invoiceId) || null;
        return null;
    }, [invoice, transactionToEdit?.invoiceId, state.invoices]);

    // Bank + Cash are valid deposit targets for rental receipts (Cash was wrongly excluded before, leaving the list empty when only the default Cash account exists).
    const depositAccounts = useMemo(
        () =>
            state.accounts.filter(
                a =>
                    (a.type === AccountType.BANK || a.type === AccountType.CASH) &&
                    a.name !== 'Internal Clearing'
            ),
        [state.accounts]
    );

    const isSecurityOnlyInvoice = effectiveInvoice?.invoiceType === InvoiceType.SECURITY_DEPOSIT;

    const { rentRemaining, securityDepositRemaining, totalRemaining } = useMemo(() => {
        if (!effectiveInvoice) return { rentRemaining: 0, securityDepositRemaining: 0, totalRemaining: 0 };

        const effectiveSecurityCharge = isSecurityOnlyInvoice
            ? effectiveInvoice.amount
            : (effectiveInvoice.securityDepositCharge || 0);

        const rentDue = effectiveInvoice.amount - effectiveSecurityCharge;
        const securityDepositDue = effectiveSecurityCharge;

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');

        const payments = state.transactions.filter(tx => tx.invoiceId === effectiveInvoice.id && tx.type === TransactionType.INCOME);

        const rentPaid = payments.filter(p => p.categoryId === rentalIncomeCategory?.id).reduce((sum, tx) => sum + tx.amount, 0);
        const securityDepositPaid = payments.filter(p => p.categoryId === securityDepositCategory?.id).reduce((sum, tx) => sum + tx.amount, 0);

        const rentRemaining = Math.max(0, rentDue - rentPaid);
        const securityDepositRemaining = Math.max(0, securityDepositDue - securityDepositPaid);
        const totalRemaining = rentRemaining + securityDepositRemaining;

        return { rentRemaining, securityDepositRemaining, totalRemaining };
    }, [effectiveInvoice, isSecurityOnlyInvoice, state.transactions, state.categories]);

    useEffect(() => {
        if (isEditMode && transactionToEdit && isOpen) {
            setEditAmount(Math.abs(transactionToEdit.amount).toString());
            setPaymentDate(parseStoredDateToYyyyMmDdInput(transactionToEdit.date));
            setAccountId(transactionToEdit.accountId || '');
            setDescription(transactionToEdit.description || '');
            setError('');
        } else if (effectiveInvoice && isOpen) {
            setRentPaidAmount(String(rentRemaining));
            setSecurityDepositPaidAmount(String(securityDepositRemaining));
            setPaymentDate(toLocalDateString(new Date()));
            setDescription('');
            const cashAccount = depositAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || depositAccounts[0]?.id || '');

            setError('');
        }
    }, [effectiveInvoice, isOpen, rentRemaining, securityDepositRemaining, depositAccounts, isEditMode, transactionToEdit]);


    useEffect(() => {
        if (isEditMode) {
            const amt = parseFloat(editAmount) || 0;
            setError(amt <= 0 ? 'Amount must be positive.' : '');
            return;
        }
        const rentPayment = parseFloat(rentPaidAmount) || 0;
        const securityPayment = parseFloat(securityDepositPaidAmount) || 0;
        const totalPayment = rentPayment + securityPayment;

        if (totalPayment <= 0) {
            setError('Total payment amount must be positive.');
        } else if (rentPayment > rentRemaining + 0.01) { // Epsilon for float issues
            setError(`Amount cannot exceed remaining balance of ${CURRENCY} ${rentRemaining.toLocaleString()}.`);
        } else if (securityPayment > securityDepositRemaining + 0.01) {
            setError(`Security deposit payment cannot exceed remaining deposit of ${CURRENCY} ${securityDepositRemaining.toLocaleString()}.`);
        }
        else {
            setError('');
        }
    }, [isEditMode, editAmount, rentPaidAmount, securityDepositPaidAmount, rentRemaining, securityDepositRemaining]);

    const handleSubmit = async () => {
        if (error) return;

        // Edit mode: update single transaction
        if (isEditMode && transactionToEdit) {
            const numAmount = parseFloat(editAmount) || 0;
            if (numAmount <= 0) return;
            if (!accountId) {
                await showAlert("Error: Please select an account.");
                return;
            }
            dispatch({
                type: 'UPDATE_TRANSACTION',
                payload: {
                    ...transactionToEdit,
                    amount: numAmount,
                    accountId,
                    date: /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
                        ? `${paymentDate}T00:00:00.000Z`
                        : new Date(paymentDate).toISOString(),
                    description: description.trim() || undefined,
                }
            });
            onClose();
            return;
        }

        if (!effectiveInvoice) return;

        const rentPayment = parseFloat(rentPaidAmount) || 0;
        const securityPayment = parseFloat(securityDepositPaidAmount) || 0;
        const totalPaidNow = rentPayment + securityPayment;

        if (totalPaidNow <= 0) return;

        // Block overpayment: do not accept more than balance due
        if (totalPaidNow > totalRemaining + 0.01) {
            await showAlert(`Total payment (${CURRENCY} ${totalPaidNow.toLocaleString()}) cannot exceed the balance due on this invoice (${CURRENCY} ${totalRemaining.toLocaleString()}).`);
            return;
        }
        if (rentPayment > rentRemaining + 0.01) {
            await showAlert(`Rent payment cannot exceed remaining rent due (${CURRENCY} ${rentRemaining.toLocaleString()}).`);
            return;
        }
        if (securityPayment > securityDepositRemaining + 0.01) {
            await showAlert(`Security deposit payment cannot exceed remaining deposit due (${CURRENCY} ${securityDepositRemaining.toLocaleString()}).`);
            return;
        }

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');

        const property = effectiveInvoice.propertyId
            ? state.properties.find(p => p.id === effectiveInvoice.propertyId)
            : null;

        // Resolve owner from the agreement that generated this invoice.
        // After a property transfer the old agreement stores ownerId = old owner
        // and the new agreement stores ownerId = new owner, so rental income
        // is attributed to whoever owned the property when the agreement was active
        // — not whoever owns it on the day the tenant happens to pay.
        const linkedAgreement = effectiveInvoice.agreementId
            ? state.rentalAgreements.find(a => a.id === effectiveInvoice.agreementId)
            : null;
        const ownerFromAgreement = linkedAgreement?.ownerId;

        // Fallback: resolve from property_ownership using the INVOICE issue date,
        // not the payment date — rent earned under the old owner stays with them.
        const ownerResolveDate = (effectiveInvoice.issueDate || paymentDate).slice(0, 10);
        const sharesForDay = effectiveInvoice.propertyId
            ? getOwnershipSharesForPropertyOnDate(state, effectiveInvoice.propertyId, ownerResolveDate)
            : [];
        const ownerId =
            ownerFromAgreement ??
            primaryOwnerIdFromShares(sharesForDay) ??
            (effectiveInvoice.propertyId
                ? getOwnerIdForPropertyOnDate(
                      effectiveInvoice.propertyId,
                      ownerResolveDate,
                      state.propertyOwnershipHistory || [],
                      property?.ownerId
                  )
                : undefined);
        const baseTransaction = {
            date: paymentDate,
            propertyId: effectiveInvoice.propertyId,
            buildingId: effectiveInvoice.buildingId,
            ownerId,
        };

        if (!accountId) {
            await showAlert("Error: Please select an account to deposit the payment into.");
            return;
        }

        // Rental invoices use TWO income categories:
        // 1. Rental Income - for the rent portion (stored in invoice.categoryId)
        // 2. Security Deposit - for the security deposit portion (stored in invoice.securityDepositCharge)
        // When payment is received, we create separate transactions for each category

        if (rentPayment > 0) {
            // Use invoice.categoryId (should be "Rental Income" for rental invoices)
            // This represents the rent portion of the invoice
            let categoryId = effectiveInvoice.categoryId;

            // If invoice doesn't have categoryId, try to determine from invoice type
            if (!categoryId) {
                if (effectiveInvoice.invoiceType === InvoiceType.RENTAL) {
                    categoryId = rentalIncomeCategory?.id;
                } else if (effectiveInvoice.invoiceType === InvoiceType.SECURITY_DEPOSIT) {
                    categoryId = securityDepositCategory?.id;
                } else if (effectiveInvoice.invoiceType === InvoiceType.SERVICE_CHARGE) {
                    const serviceChargeCategory = state.categories.find(c => c.name === 'Service Charge Income');
                    categoryId = serviceChargeCategory?.id;
                }
            }

            // Final fallback: use Rental Income category
            if (!categoryId) {
                categoryId = rentalIncomeCategory?.id;
            }

            if (!categoryId) {
                await showAlert("Critical Error: 'Rental Income' category not found. Please check settings.");
                return;
            }

            const defaultRentDesc = isSecurityOnlyInvoice
                ? `Security Deposit for Invoice #${effectiveInvoice.invoiceNumber}`
                : `Rent payment for Invoice #${effectiveInvoice.invoiceNumber}`;
            const rentDescription = (description && description.trim())
                ? description.trim()
                : defaultRentDesc;
            const tx: Omit<Transaction, 'id'> = {
                ...baseTransaction,
                contactId: effectiveInvoice.contactId,
                type: TransactionType.INCOME,
                amount: rentPayment,
                categoryId: categoryId,
                accountId: accountId,
                description: rentDescription,
                invoiceId: effectiveInvoice.id
            };
            const mkId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
            const grossTx: Transaction = { ...tx, id: mkId() };
            if (
                effectiveInvoice.propertyId &&
                shouldPostOwnerRentAllocation(state, effectiveInvoice.propertyId, paymentDate)
            ) {
                const splitErr = multiOwnerShareSplitError(
                    state,
                    effectiveInvoice.propertyId,
                    paymentDate.slice(0, 10)
                );
                if (splitErr) {
                    await showAlert(splitErr);
                    return;
                }
                const batchId = `rent-alloc-${mkId()}`;
                const allocLegs = buildOwnerRentAllocationTransactions(state, {
                    propertyId: effectiveInvoice.propertyId,
                    buildingId: effectiveInvoice.buildingId,
                    paymentDateYyyyMmDd: paymentDate.slice(0, 10),
                    rentAmount: rentPayment,
                    accountId,
                    invoiceId: effectiveInvoice.id,
                    baseDescription: rentDescription,
                    batchId,
                }).map((leg) => ({ ...leg, id: mkId() })) as Transaction[];
                dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: [grossTx, ...allocLegs] });
            } else {
                dispatch({ type: 'ADD_TRANSACTION', payload: grossTx });
            }
        }

        // Security Deposit Logic - Credits both Bank and Security Liability
        // Security deposits are liabilities (money held on behalf of tenant), not income.
        // We use TRANSFER type: Bank receives money (toAccountId), Security Liability increases (tracked via category).
        if (securityPayment > 0) {
            const securityLiabilityAccount = state.accounts.find(a => accountIdMatchesLogical(a.id, 'sys-acc-sec-liability'));
            if (!securityLiabilityAccount) {
                await showAlert("Critical Error: 'Security Liability' account not found. Please check system accounts.");
                return;
            }
            const securityDescription = (description && description.trim())
                ? description.trim()
                : `Security Deposit for Invoice #${effectiveInvoice.invoiceNumber}`;
            const tx: Omit<Transaction, 'id'> = {
                ...baseTransaction,
                contactId: effectiveInvoice.contactId,
                type: TransactionType.INCOME,
                amount: securityPayment,
                categoryId: securityDepositCategory?.id,
                accountId: accountId,
                description: securityDescription,
                invoiceId: effectiveInvoice.id
            };
            dispatch({ type: 'ADD_TRANSACTION', payload: { ...tx, id: Date.now().toString() + Math.random() } });
        }

        // --- WhatsApp Confirmation Logic ---
        const contact = state.contacts.find(c => c.id === effectiveInvoice.contactId);
        if (contact && contact.contactNo) {
            const shouldSendWhatsapp = await showConfirm(
                "Payment recorded successfully. Do you want to send the receipt on WhatsApp?",
                { title: "Send Receipt", confirmLabel: "Send WhatsApp", cancelLabel: "No, Later" }
            );

            if (shouldSendWhatsapp) {
                const property = state.properties.find(p => p.id === effectiveInvoice.propertyId);
                const building = property ? state.buildings.find(b => b.id === property.buildingId) : null;

                let subject = property?.name || 'your unit';
                if (building) subject += ` (${building.name})`;

                const newBalance = Math.max(0, totalRemaining - totalPaidNow);

                try {
                    const { whatsAppTemplates } = state;
                    const message = WhatsAppService.generateInvoiceReceipt(
                        whatsAppTemplates.invoiceReceipt,
                        contact,
                        effectiveInvoice.invoiceNumber,
                        totalPaidNow,
                        newBalance,
                        subject,
                        property?.name || ''
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

        onClose();
    };

    if (!effectiveInvoice && !transactionToEdit) return null;

    const modalTitle = isEditMode && effectiveInvoice
        ? `Edit Payment for Invoice #${effectiveInvoice.invoiceNumber}`
        : effectiveInvoice
            ? `Receive Payment for Invoice #${effectiveInvoice.invoiceNumber}`
            : 'Edit Payment';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <div className="space-y-4">

                {isEditMode ? (
                    <>
                        <ComboBox
                            label="Deposit to Account"
                            items={depositAccounts}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select an account"
                            required
                        />
                        <Input
                            label="Amount"
                            type="text"
                            inputMode="decimal"
                            min="0"
                            value={editAmount}
                            onChange={e => setEditAmount(e.target.value)}
                        />
                        <DatePicker label="Payment Date" value={paymentDate} onChange={d => setPaymentDate(toLocalDateString(d))} required />
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                            <textarea
                                className="w-full min-h-[80px] px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Notes related to this payment (optional)"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                            />
                        </div>
                        {error && <p className="text-sm text-danger">{error}</p>}
                        <div className="flex justify-between gap-2 pt-4">
                            <div>
                                {onShowDeleteWarning && transactionToEdit && (
                                    <Button type="button" variant="danger" onClick={() => onShowDeleteWarning(transactionToEdit)}>
                                        Delete Payment
                                    </Button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                                <Button type="button" onClick={handleSubmit} disabled={!!error}>Save Changes</Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="p-4 bg-slate-50 rounded-lg">
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total Remaining Due:</span>
                                <span>{CURRENCY} {totalRemaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        <ComboBox
                            label="Deposit to Account"
                            items={depositAccounts}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select an account"
                            required
                        />

                        {rentRemaining > 0 && (
                            <Input
                                label={`Rent Amount (Due: ${CURRENCY} ${rentRemaining.toLocaleString()})`}
                                type="text"
                                inputMode="decimal"
                                min="0"
                                value={rentPaidAmount}
                                onChange={e => setRentPaidAmount(e.target.value)}
                            />
                        )}

                        {(isSecurityOnlyInvoice || (effectiveInvoice.securityDepositCharge || 0) > 0) && (
                            <Input
                                label={`Security Deposit Paid (Due: ${CURRENCY} ${securityDepositRemaining.toLocaleString()})`}
                                type="text"
                                inputMode="decimal"
                                min="0"
                                value={securityDepositPaidAmount}
                                onChange={e => setSecurityDepositPaidAmount(e.target.value)}
                            />
                        )}
                        <DatePicker label="Payment Date" value={paymentDate} onChange={d => setPaymentDate(toLocalDateString(d))} required />

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                            <textarea
                                className="w-full min-h-[80px] px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Notes related to this payment (optional)"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {error && <p className="text-sm text-danger">{error}</p>}

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                            <Button type="button" onClick={handleSubmit} disabled={!!error}>Record Payment</Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};
export default RentalPaymentModal;
