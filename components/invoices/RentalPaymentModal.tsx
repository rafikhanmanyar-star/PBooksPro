
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
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';

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
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [error, setError] = useState('');

    const isEditMode = !!(transactionToEdit && transactionToEdit.id);

    // Resolve invoice: use prop or from transaction when in edit mode
    const effectiveInvoice = useMemo(() => {
        if (invoice) return invoice;
        if (transactionToEdit?.invoiceId) return state.invoices.find(i => i.id === transactionToEdit.invoiceId) || null;
        return null;
    }, [invoice, transactionToEdit?.invoiceId, state.invoices]);

    // Filter for Bank Accounts (exclude Internal Clearing)
    const depositAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    const { rentRemaining, securityDepositRemaining, totalRemaining } = useMemo(() => {
        if (!effectiveInvoice) return { rentRemaining: 0, securityDepositRemaining: 0, totalRemaining: 0 };

        const rentDue = effectiveInvoice.amount - (effectiveInvoice.securityDepositCharge || 0);
        const securityDepositDue = effectiveInvoice.securityDepositCharge || 0;

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');

        const payments = state.transactions.filter(tx => tx.invoiceId === effectiveInvoice.id && tx.type === TransactionType.INCOME);

        const rentPaid = payments.filter(p => p.categoryId === rentalIncomeCategory?.id).reduce((sum, tx) => sum + tx.amount, 0);
        const securityDepositPaid = payments.filter(p => p.categoryId === securityDepositCategory?.id).reduce((sum, tx) => sum + tx.amount, 0);

        const rentRemaining = Math.max(0, rentDue - rentPaid);
        const securityDepositRemaining = Math.max(0, securityDepositDue - securityDepositPaid);
        const totalRemaining = rentRemaining + securityDepositRemaining;

        return { rentRemaining, securityDepositRemaining, totalRemaining };
    }, [effectiveInvoice, state.transactions, state.categories]);

    useEffect(() => {
        if (isEditMode && transactionToEdit && isOpen) {
            setEditAmount(Math.abs(transactionToEdit.amount).toString());
            setPaymentDate(new Date(transactionToEdit.date).toISOString().split('T')[0]);
            setAccountId(transactionToEdit.accountId || '');
            setError('');
        } else if (effectiveInvoice && isOpen) {
            setRentPaidAmount(String(rentRemaining));
            setSecurityDepositPaidAmount(String(securityDepositRemaining));
            setPaymentDate(new Date().toISOString().split('T')[0]);

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
                    date: new Date(paymentDate).toISOString(),
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

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');

        const baseTransaction = {
            date: paymentDate,
            propertyId: effectiveInvoice.propertyId,
            buildingId: effectiveInvoice.buildingId,
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

            // Create transaction for RENT portion with Rental Income category
            const tx: Omit<Transaction, 'id'> = {
                ...baseTransaction,
                contactId: effectiveInvoice.contactId,
                type: TransactionType.INCOME,
                amount: rentPayment,
                categoryId: categoryId, // Rental Income category
                accountId: accountId,
                description: `Rent payment for Invoice #${effectiveInvoice.invoiceNumber}`,
                invoiceId: effectiveInvoice.id
            };
            dispatch({ type: 'ADD_TRANSACTION', payload: { ...tx, id: Date.now().toString() + Math.random() } });
        }

        // Security Deposit Logic - Create separate transaction with Security Deposit category
        if (securityPayment > 0) {
            if (!securityDepositCategory) {
                await showAlert("Critical Error: 'Security Deposit' income category not found. Please create it in Settings.");
                return;
            }
            // Create transaction for SECURITY DEPOSIT portion with Security Deposit category
            const tx: Omit<Transaction, 'id'> = {
                ...baseTransaction,
                contactId: effectiveInvoice.contactId,
                type: TransactionType.INCOME,
                amount: securityPayment,
                categoryId: securityDepositCategory.id, // Security Deposit category
                accountId: accountId,
                description: `Security Deposit for Invoice #${effectiveInvoice.invoiceNumber}`,
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

                    // Open WhatsApp side panel with pre-filled message
                    openChat(contact, contact.contactNo, message);
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
                        <DatePicker label="Payment Date" value={paymentDate} onChange={d => setPaymentDate(d.toISOString().split('T')[0])} required />
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

                        {(effectiveInvoice.securityDepositCharge || 0) > 0 && (
                            <Input
                                label={`Security Deposit Paid (Due: ${CURRENCY} ${securityDepositRemaining.toLocaleString()})`}
                                type="text"
                                inputMode="decimal"
                                min="0"
                                value={securityDepositPaidAmount}
                                onChange={e => setSecurityDepositPaidAmount(e.target.value)}
                            />
                        )}
                        <DatePicker label="Payment Date" value={paymentDate} onChange={d => setPaymentDate(d.toISOString().split('T')[0])} required />

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
