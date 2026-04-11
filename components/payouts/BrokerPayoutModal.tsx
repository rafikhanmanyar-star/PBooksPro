
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAppContext, _getAppState } from '../../context/AppContext';
import { Contact, TransactionType, Transaction, AccountType } from '../../types';
import { flushAppStateToDatabase } from '../../services/database/criticalPersistence';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { getAppStateApiService } from '../../services/api/appStateApi';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { CURRENCY, ICONS } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { toLocalDateString } from '../../utils/dateUtils';

interface BrokerPayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    broker: Contact | null;
    balanceDue: number; 
    context?: 'Rental' | 'Project';
}

interface CommissionItem {
    agreementId: string;
    type: 'Rental' | 'Project';
    entityId: string; // Property ID or Project ID
    entityName: string;
    ownerName: string;
    totalFee: number;
    paidAlready: number;
    remaining: number;
    paymentAmount: number; 
    isSelected: boolean;
}

const BrokerPayoutModal: React.FC<BrokerPayoutModalProps> = ({ isOpen, onClose, broker, context }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert } = useNotification();
    const { openChat } = useWhatsApp();
    const [items, setItems] = useState<CommissionItem[]>([]);
    const [paymentDate, setPaymentDate] = useState(toLocalDateString(new Date()));
    const [paymentParticulars, setPaymentParticulars] = useState('');
    const [accountId, setAccountId] = useState('');
    const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
    const [lastPaidAmount, setLastPaidAmount] = useState(0);
    
    // Filter for Bank Accounts (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);
    
    useEffect(() => {
        if (isOpen && broker) {
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
            setPaymentParticulars('');
            
            const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
            const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
            const feeCatId = brokerFeeCategory?.id;
            const rebateCatId = rebateCategory?.id;

            const newItems: CommissionItem[] = [];

            // 1. Rental Agreements (exclude renewed agreements so broker is not charged again on renewal)
            if (!context || context === 'Rental') {
                state.rentalAgreements.forEach(ra => {
                    if (ra.previousAgreementId) return;
                    if (ra.brokerId === broker.id && (ra.brokerFee || 0) > 0) {
                        const property = state.properties.find(p => p.id === ra.propertyId);
                        const owner = state.contacts.find(c => c.id === property?.ownerId);
                        
                        const paidAlready = state.transactions
                            .filter(tx => 
                                tx.type === TransactionType.EXPENSE &&
                                tx.contactId === broker.id &&
                                (tx.categoryId === feeCatId || tx.categoryId === rebateCatId) &&
                                (tx.agreementId === ra.id || (tx.propertyId === ra.propertyId))
                            )
                            .reduce((sum, tx) => sum + tx.amount, 0);

                        const remaining = Math.max(0, (ra.brokerFee || 0) - paidAlready);

                        if ((ra.brokerFee || 0) > 0) {
                            newItems.push({
                                agreementId: ra.id,
                                type: 'Rental',
                                entityId: ra.propertyId,
                                entityName: property?.name || 'Unknown Property',
                                ownerName: owner?.name || 'Unknown Owner',
                                totalFee: ra.brokerFee || 0,
                                paidAlready,
                                remaining,
                                paymentAmount: remaining,
                                isSelected: remaining > 0
                            });
                        }
                    }
                });
            }

            // 2. Project Agreements
            if (!context || context === 'Project') {
                state.projectAgreements.forEach(pa => {
                    if (pa.rebateBrokerId === broker.id && (pa.rebateAmount || 0) > 0) {
                        const project = state.projects.find(p => p.id === pa.projectId);
                        const client = state.contacts.find(c => c.id === pa.clientId);

                        const paidAlready = state.transactions
                            .filter(tx => 
                                tx.type === TransactionType.EXPENSE &&
                                tx.contactId === broker.id &&
                                (tx.categoryId === feeCatId || tx.categoryId === rebateCatId) &&
                                (tx.agreementId === pa.id)
                            )
                            .reduce((sum, tx) => sum + tx.amount, 0);

                        const remaining = Math.max(0, (pa.rebateAmount || 0) - paidAlready);

                        if ((pa.rebateAmount || 0) > 0) {
                            newItems.push({
                                agreementId: pa.id,
                                type: 'Project',
                                entityId: pa.projectId,
                                entityName: project?.name || 'Unknown Project',
                                ownerName: client?.name || 'Unknown Client',
                                totalFee: pa.rebateAmount || 0,
                                paidAlready,
                                remaining,
                                paymentAmount: remaining,
                                isSelected: remaining > 0
                            });
                        }
                    }
                });
            }

            setItems(newItems);
        }
    }, [isOpen, broker, context, state.rentalAgreements, state.projectAgreements, state.transactions, state.properties, state.contacts, state.categories, userSelectableAccounts, state.projects]);

    const selectAllRef = useRef<HTMLInputElement>(null);
    const allSelected = items.length > 0 && items.every(i => i.isSelected);
    const noneSelected = items.length === 0 || !items.some(i => i.isSelected);

    useEffect(() => {
        const el = selectAllRef.current;
        if (!el) return;
        el.indeterminate = items.length > 0 && !allSelected && !noneSelected;
    }, [items.length, allSelected, noneSelected]);

    const handleSelectAll = () => {
        if (items.length === 0) return;
        const next = !allSelected;
        setItems(items.map(i => ({ ...i, isSelected: next })));
    };

    const handleToggle = (index: number) => {
        const newItems = [...items];
        newItems[index].isSelected = !newItems[index].isSelected;
        setItems(newItems);
    };

    const handleAmountChange = (index: number, val: string) => {
        const newItems = [...items];
        const num = parseFloat(val);
        newItems[index].paymentAmount = isNaN(num) ? 0 : num;
        setItems(newItems);
    };

    const totalToPay = items.filter(i => i.isSelected).reduce((sum, i) => sum + i.paymentAmount, 0);

    const handleSubmit = async () => {
        if (!broker) return;
        if (totalToPay <= 0) {
            await showAlert("Please select at least one commission to pay.");
            return;
        }

        const payoutAccount = state.accounts.find(a => a.id === accountId);
        if (!payoutAccount) {
            await showAlert(`Error: Please select a valid account to pay from.`);
            return;
        }

        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        
        const selectedItems = items.filter(i => i.isSelected && i.paymentAmount > 0);
        const particularsNote = paymentParticulars.trim();

        const newTransactions: Transaction[] = [];
        for (const item of selectedItems) {
            const categoryId = item.type === 'Project' ? (rebateCategory?.id || brokerFeeCategory?.id) : brokerFeeCategory?.id;
            if (!categoryId) {
                await showAlert('Missing Broker Fee / Rebate category. Add categories in Settings, then try again.');
                return;
            }
            const baseDescription = `Broker Commission for ${item.entityName}`;
            const description = particularsNote
                ? `${baseDescription} — ${particularsNote}`
                : baseDescription;
            const payoutTransaction: Omit<Transaction, 'id'> = {
                type: TransactionType.EXPENSE,
                amount: item.paymentAmount,
                date: paymentDate,
                description,
                accountId: payoutAccount.id,
                contactId: broker.id,
                categoryId,
                agreementId: item.agreementId,
                propertyId: item.type === 'Rental' ? item.entityId : undefined,
                projectId: item.type === 'Project' ? item.entityId : undefined,
                buildingId: item.type === 'Rental' ? state.properties.find(p => p.id === item.entityId)?.buildingId : undefined
            };
            newTransactions.push({
                ...payoutTransaction,
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            });
        }

        if (isLocalOnlyMode()) {
            flushSync(() => {
                dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: newTransactions });
            });
            try {
                await flushAppStateToDatabase(_getAppState());
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await showAlert(`Could not save payment to the database: ${msg}`);
                return;
            }
        } else {
            // LAN/API: save first (normalized rows + server version), then merge into state once — matches bulk bill / PM payout migration.
            try {
                const api = getAppStateApiService();
                const savedTransactions: Transaction[] = [];
                for (const tx of newTransactions) {
                    const saved = await api.saveTransaction(tx);
                    savedTransactions.push(saved as Transaction);
                }
                flushSync(() => {
                    dispatch({
                        type: 'BATCH_ADD_TRANSACTIONS',
                        payload: savedTransactions,
                        _isRemote: true,
                    } as any);
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await showAlert(`Failed to record commission payment: ${msg}`);
                return;
            }
        }

        setLastPaidAmount(totalToPay);
        setShowWhatsAppConfirm(true);
    };

    const handleSendWhatsAppConfirmation = () => {
        if (!broker) return;
        const template = state.whatsAppTemplates.payoutConfirmation || 'Dear {contactName}, a {payoutType} payment of {amount} has been made to you. Reference: {reference}';
        const message = WhatsAppService.generatePayoutConfirmation(
            template, broker, lastPaidAmount, 'Broker Commission'
        );
        sendOrOpenWhatsApp(
            { contact: broker, message, phoneNumber: broker.contactNo || undefined },
            () => state.whatsAppMode,
            openChat
        );
        setShowWhatsAppConfirm(false);
        onClose();
    };

    const handleSkipWhatsApp = () => {
        setShowWhatsAppConfirm(false);
        onClose();
    };
    
    if (!broker) return null;
    
    const accountsWithBalance = userSelectableAccounts.map(acc => ({
        ...acc,
        name: `${acc.name} (${CURRENCY} ${acc.balance.toLocaleString()})`
    }));

    // WhatsApp confirmation step
    if (showWhatsAppConfirm) {
        return (
            <Modal isOpen={isOpen} onClose={handleSkipWhatsApp} title="Commission Payment Recorded">
                <div className="space-y-4">
                    <div className="p-4 bg-app-toolbar border border-app-border rounded-lg text-center">
                        <div className="w-12 h-12 rounded-full bg-[color:var(--badge-paid-bg)] border border-ds-success/30 flex items-center justify-center mx-auto mb-3">
                            <div className="w-6 h-6 text-ds-success">{ICONS.check}</div>
                        </div>
                        <p className="font-semibold text-app-text">
                            {CURRENCY} {lastPaidAmount.toLocaleString()} paid to {broker.name}
                        </p>
                        <p className="text-sm text-ds-success mt-1">Broker Commission Payment</p>
                    </div>
                    <p className="text-sm text-app-muted text-center">
                        Would you like to send a payment confirmation via WhatsApp?
                    </p>
                    <div className="flex justify-center gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={handleSkipWhatsApp}>
                            Skip
                        </Button>
                        <button
                            type="button"
                            onClick={handleSendWhatsAppConfirmation}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-ds-on-primary bg-ds-success hover:opacity-90 transition-colors duration-ds"
                        >
                            <div className="w-4 h-4">{ICONS.whatsapp}</div>
                            Send via WhatsApp
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay Commissions: ${broker.name}`} size="xl">
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                        <ComboBox 
                            label="Pay From Account"
                            items={accountsWithBalance}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select an account"
                        />
                    </div>
                     <div className="flex-grow">
                         <DatePicker
                            label="Payment Date"
                            value={paymentDate}
                            onChange={d => setPaymentDate(toLocalDateString(d))}
                            required
                        />
                    </div>
                </div>

                <Textarea
                    label="Description / Particulars"
                    placeholder="Optional notes for this payment (e.g. bank reference, cheque #). Shown on broker ledger and project broker reports."
                    value={paymentParticulars}
                    onChange={e => setPaymentParticulars(e.target.value)}
                    rows={2}
                />

                <div className="border border-app-border rounded-lg overflow-hidden bg-app-card">
                    <div className="bg-app-table-header px-4 py-2 font-semibold text-sm text-app-muted grid grid-cols-12 gap-2 border-b border-app-border items-center">
                        <div className="col-span-1 flex justify-center">
                            <input
                                ref={selectAllRef}
                                type="checkbox"
                                checked={allSelected}
                                onChange={handleSelectAll}
                                disabled={items.length === 0}
                                className="w-4 h-4 rounded border-app-border text-primary focus:ring-primary/30 disabled:opacity-40"
                                aria-label="Select or deselect all commission records"
                                title={allSelected ? 'Deselect all' : 'Select all'}
                            />
                        </div>
                        <div className="col-span-4">Reference (Unit/Project)</div>
                        <div className="col-span-2 text-right">Total Fee</div>
                        <div className="col-span-2 text-right">Due</div>
                        <div className="col-span-3 text-right">Pay Now</div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {items.length > 0 ? (
                            items.map((item, idx) => (
                                <div key={item.agreementId} className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-app-border text-sm items-center transition-colors duration-ds ${item.isSelected ? 'bg-nav-active/50' : 'bg-app-card'}`}>
                                    <div className="col-span-1 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={item.isSelected} 
                                            onChange={() => handleToggle(idx)}
                                            className="w-4 h-4 rounded border-app-border text-primary focus:ring-primary/30"
                                            aria-label={`Select ${item.entityName} for payout`}
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <div className="font-medium text-app-text truncate" title={item.entityName}>
                                            {item.type === 'Project' && <span className="text-[10px] bg-app-toolbar px-1 rounded mr-1 border border-app-border text-app-muted">PROJ</span>}
                                            {item.entityName}
                                        </div>
                                        <div className="text-xs text-app-muted truncate" title={item.ownerName}>Client: {item.ownerName}</div>
                                    </div>
                                    <div className="col-span-2 text-right text-app-muted tabular-nums">
                                        {item.totalFee.toLocaleString()}
                                    </div>
                                    <div className="col-span-2 text-right font-medium text-app-text tabular-nums">
                                        {item.remaining.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                        <input 
                                            type="number" 
                                            className="ds-input-field w-full rounded px-2 py-1 text-right text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                            value={item.paymentAmount}
                                            onChange={(e) => handleAmountChange(idx, e.target.value)}
                                            onKeyDown={(e) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                            disabled={!item.isSelected}
                                            aria-label={`Pay now amount for ${item.entityName}`}
                                        />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-4 text-center text-app-muted">No commissions due for this broker in this section.</div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-app-toolbar border border-app-border rounded-lg flex justify-between items-center">
                    <span className="font-semibold text-app-text">Total Payment:</span>
                    <span className="font-bold text-xl text-primary">{CURRENCY} {totalToPay.toLocaleString()}</span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSubmit} disabled={totalToPay <= 0}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default BrokerPayoutModal;
