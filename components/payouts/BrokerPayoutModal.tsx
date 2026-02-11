
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, TransactionType, Transaction, AccountType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { CURRENCY, ICONS } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';

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
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
    const [lastPaidAmount, setLastPaidAmount] = useState(0);
    
    // Filter for Bank Accounts (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);
    
    useEffect(() => {
        if (isOpen && broker) {
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
            
            const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
            const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
            const feeCatId = brokerFeeCategory?.id;
            const rebateCatId = rebateCategory?.id;

            const newItems: CommissionItem[] = [];

            // 1. Rental Agreements
            if (!context || context === 'Rental') {
                state.rentalAgreements.forEach(ra => {
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

        // Create individual transactions per agreement
        selectedItems.forEach(item => {
             const categoryId = item.type === 'Project' ? (rebateCategory?.id || brokerFeeCategory?.id) : brokerFeeCategory?.id;
             
             if (!categoryId) {
                 console.warn("Missing category for broker fee payment");
                 return;
             }

             const payoutTransaction: Omit<Transaction, 'id'> = {
                type: TransactionType.EXPENSE,
                amount: item.paymentAmount,
                date: paymentDate,
                description: `Broker Commission for ${item.entityName}`,
                accountId: payoutAccount.id,
                contactId: broker.id,
                categoryId: categoryId,
                agreementId: item.agreementId,
                propertyId: item.type === 'Rental' ? item.entityId : undefined,
                projectId: item.type === 'Project' ? item.entityId : undefined,
                buildingId: item.type === 'Rental' ? state.properties.find(p => p.id === item.entityId)?.buildingId : undefined
            };
            dispatch({ type: 'ADD_TRANSACTION', payload: { ...payoutTransaction, id: Date.now().toString() + Math.random() } });
        });

        // Show WhatsApp confirmation
        setLastPaidAmount(totalToPay);
        setShowWhatsAppConfirm(true);
    };

    const handleSendWhatsAppConfirmation = () => {
        if (!broker) return;
        const template = state.whatsAppTemplates.payoutConfirmation || 'Dear {contactName}, a {payoutType} payment of {amount} has been made to you. Reference: {reference}';
        const message = WhatsAppService.generatePayoutConfirmation(
            template, broker, lastPaidAmount, 'Broker Commission'
        );
        openChat(broker, broker.contactNo || '', message);
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
                    <div className="p-4 bg-emerald-50 rounded-lg text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                            <div className="w-6 h-6 text-emerald-600">{ICONS.check}</div>
                        </div>
                        <p className="font-semibold text-emerald-800">
                            {CURRENCY} {lastPaidAmount.toLocaleString()} paid to {broker.name}
                        </p>
                        <p className="text-sm text-emerald-600 mt-1">Broker Commission Payment</p>
                    </div>
                    <p className="text-sm text-slate-600 text-center">
                        Would you like to send a payment confirmation via WhatsApp?
                    </p>
                    <div className="flex justify-center gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={handleSkipWhatsApp}>
                            Skip
                        </Button>
                        <button
                            onClick={handleSendWhatsAppConfirmation}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
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
                         <Input 
                            label="Payment Date"
                            type="date"
                            value={paymentDate}
                            onChange={e => setPaymentDate(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-4 py-2 font-semibold text-sm text-slate-700 grid grid-cols-12 gap-2">
                        <div className="col-span-1 text-center">Select</div>
                        <div className="col-span-4">Reference (Unit/Project)</div>
                        <div className="col-span-2 text-right">Total Fee</div>
                        <div className="col-span-2 text-right">Due</div>
                        <div className="col-span-3 text-right">Pay Now</div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {items.length > 0 ? (
                            items.map((item, idx) => (
                                <div key={item.agreementId} className={`grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm items-center ${item.isSelected ? 'bg-indigo-50' : ''}`}>
                                    <div className="col-span-1 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={item.isSelected} 
                                            onChange={() => handleToggle(idx)}
                                            className="w-4 h-4 text-accent rounded focus:ring-accent"
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <div className="font-medium text-slate-800 truncate" title={item.entityName}>
                                            {item.type === 'Project' && <span className="text-[10px] bg-slate-200 px-1 rounded mr-1">PROJ</span>}
                                            {item.entityName}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate" title={item.ownerName}>Client: {item.ownerName}</div>
                                    </div>
                                    <div className="col-span-2 text-right text-slate-600">
                                        {item.totalFee.toLocaleString()}
                                    </div>
                                    <div className="col-span-2 text-right font-medium text-slate-800">
                                        {item.remaining.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                        <input 
                                            type="number" 
                                            className="w-full border rounded px-2 py-1 text-right text-sm focus:ring-2 focus:ring-accent/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            value={item.paymentAmount}
                                            onChange={(e) => handleAmountChange(idx, e.target.value)}
                                            onKeyDown={(e) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                            disabled={!item.isSelected}
                                        />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-4 text-center text-slate-500">No commissions due for this broker in this section.</div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg flex justify-between items-center">
                    <span className="font-semibold text-slate-700">Total Payment:</span>
                    <span className="font-bold text-xl text-accent">{CURRENCY} {totalToPay.toLocaleString()}</span>
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
