
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, InvoiceType, ContactType } from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numberUtils';

interface OwnerLedgerProps {
    ownerId: string | null;
    ledgerType?: 'Rent' | 'Security';
    buildingId?: string; // New Optional Prop
    onPayoutClick?: (transaction: any) => void; // Callback when payout record is clicked
}

type SortKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

const OwnerLedger: React.FC<OwnerLedgerProps> = ({ ownerId, ledgerType = 'Rent', buildingId, onPayoutClick }) => {
    const { state } = useAppContext();
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const ledgerItems = useMemo(() => {
        if (!ownerId) return [];
        
        // Filter properties by Owner AND Building (if provided)
        const ownerProperties = state.properties
            .filter(p => p.ownerId === ownerId && (!buildingId || p.buildingId === buildingId));
        
        const ownerPropertyIds = new Set(ownerProperties.map(p => p.id));
        
        let items: any[] = [];

        if (ledgerType === 'Rent') {
            const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
            if (!rentalIncomeCategory) return [];

            const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
            const ownerSvcPayCategory = state.categories.find(c => c.name === 'Owner Service Charge Payment');
            
            // 1. Rental Income (Credit) - Must match filtered property list
            // Include both positive (rent collected) and negative (service charge deductions) amounts
            const income = state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id && tx.propertyId && ownerPropertyIds.has(tx.propertyId));

            income.forEach(tx => {
                const property = state.properties.find(p => p.id === tx.propertyId);
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(amount)) return;
                
                // If negative (service charge deduction), show as debit; if positive (rent), show as credit
                if (amount < 0) {
                    items.push({
                        id: `ded-${tx.id}`,
                        date: tx.date,
                        particulars: tx.description || `Service Charge: ${property?.name || 'Unit'}`,
                        debit: Math.abs(amount),
                        credit: 0,
                        type: 'Service Charge'
                    });
                } else {
                    items.push({
                        id: `inc-${tx.id}`,
                        date: tx.date,
                        particulars: `Rent: ${property?.name || 'Unit'}`,
                        debit: 0,
                        credit: amount,
                        type: 'Rent'
                    });
                }
            });

            // 1b. Owner Service Charge Payments (Credit) - money received from owner to cover service charges
            if (ownerSvcPayCategory) {
                const ownerPayments = state.transactions.filter(tx =>
                    tx.type === TransactionType.INCOME &&
                    tx.categoryId === ownerSvcPayCategory.id &&
                    tx.contactId === ownerId &&
                    (!buildingId || tx.buildingId === buildingId)
                );

                ownerPayments.forEach(tx => {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (isNaN(amount) || amount <= 0) return;

                    items.push({
                        id: `own-svc-${tx.id}`,
                        date: tx.date,
                        particulars: tx.description || 'Owner Service Charge Payment',
                        debit: 0,
                        credit: amount,
                        type: 'Owner Payment'
                    });
                });
            }

            // 2. Expenses (Debit)
            // A. Direct Payouts to Owner
            const payouts = state.transactions.filter(tx => 
                tx.type === TransactionType.EXPENSE && 
                tx.contactId === ownerId && 
                tx.categoryId === ownerPayoutCategory?.id &&
                (!buildingId || tx.buildingId === buildingId)
            );

            payouts.forEach(tx => {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                items.push({
                    id: `pay-${tx.id}`,
                    date: tx.date,
                    particulars: tx.description || 'Owner Payout',
                    debit: isNaN(amount) ? 0 : amount,
                    credit: 0,
                    type: 'Payout',
                    transactionId: tx.id, // Store transaction ID for editing
                    transaction: tx // Store full transaction for editing
                });
            });

            // B. Property Expenses (Bills, Repairs, Broker Fees) - Deductible from Owner Income
            const expenses = state.transactions.filter(tx => {
                if (tx.type !== TransactionType.EXPENSE) return false;
                if (!tx.propertyId || !ownerPropertyIds.has(tx.propertyId)) return false;
                
                // Exclude tenant-allocated expenses (where contactId is a tenant)
                if (tx.contactId) {
                    const contact = state.contacts.find(c => c.id === tx.contactId);
                    if (contact?.type === ContactType.TENANT) return false;
                }
                
                return true;
            });

            expenses.forEach(tx => {
                // Skip if this is actually a Payout (handled in A)
                if (tx.categoryId === ownerPayoutCategory?.id) return;

                const category = state.categories.find(c => c.id === tx.categoryId);
                const catName = category?.name || '';

                // Exclude Security/Tenant items from Rent Ledger
                if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;

                const property = state.properties.find(p => p.id === tx.propertyId);
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                items.push({
                    id: `exp-${tx.id}`,
                    date: tx.date,
                    particulars: `${category?.name || 'Expense'}: ${property?.name}`,
                    debit: isNaN(amount) ? 0 : amount,
                    credit: 0,
                    type: 'Expense'
                });
            });

        } else {
            // Security Logic
            const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
            const secRefCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
            const ownerSecPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');

            if (secDepCategory) {
                const deposits = state.transactions.filter(tx => 
                    tx.type === TransactionType.INCOME && 
                    tx.categoryId === secDepCategory.id && 
                    tx.propertyId && ownerPropertyIds.has(tx.propertyId)
                );
                deposits.forEach(tx => {
                    const property = state.properties.find(p => p.id === tx.propertyId);
                    items.push({
                        id: `sec-in-${tx.id}`,
                        date: tx.date,
                        particulars: `Deposit: ${property?.name}`,
                        debit: 0,
                        credit: tx.amount,
                        type: 'Deposit'
                    });
                });

                // Debits
                const payouts = state.transactions.filter(tx => 
                    tx.type === TransactionType.EXPENSE && 
                    tx.contactId === ownerId && 
                    ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id &&
                    (!buildingId || tx.buildingId === buildingId)
                );
                payouts.forEach(tx => {
                    items.push({
                         id: `sec-pay-${tx.id}`,
                         date: tx.date,
                         particulars: tx.description || 'Security Payout',
                         debit: tx.amount,
                         credit: 0,
                         type: 'Payout',
                         transactionId: tx.id, // Store transaction ID for editing
                         transaction: tx // Store full transaction for editing
                    });
                });

                // Refunds/Deductions linked to properties
                const refunds = state.transactions.filter(tx => 
                    tx.type === TransactionType.EXPENSE &&
                    tx.propertyId && ownerPropertyIds.has(tx.propertyId)
                );
                refunds.forEach(tx => {
                    const category = state.categories.find(c => c.id === tx.categoryId);
                    if (category && (category.id === secRefCategory?.id || category.name.includes('(Tenant)'))) {
                        const property = state.properties.find(p => p.id === tx.propertyId);
                         items.push({
                             id: `sec-ref-${tx.id}`,
                             date: tx.date,
                             particulars: `${category.name}: ${property?.name}`,
                             debit: tx.amount,
                             credit: 0,
                             type: 'Refund/Deduction'
                        });
                    }
                });
            }
        }

        // Sort
        items.sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        let runningBalance = 0;
        // Ensure chronological order for balance calculation regardless of display sort? 
        // Usually ledger is displayed chronologically. If user sorts by amount, balance doesn't make sense line-by-line.
        // For now, calculate balance based on current sort to match display.
        return items.map(item => {
            runningBalance += item.credit - item.debit;
            return { ...item, balance: runningBalance };
        });

    }, [ownerId, ledgerType, buildingId, state.transactions, state.properties, state.categories, sortConfig]);

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    if (!ownerId) return null;
    
    if (ledgerItems.length === 0) {
        return <p className="text-slate-500 text-center py-8">No {ledgerType === 'Rent' ? 'rental' : 'security deposit'} activity found.</p>;
    }

    return (
        <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                    <table className="min-w-full divide-y divide-slate-300">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('date')} scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0 cursor-pointer hover:bg-slate-50 select-none">Date <SortIcon column="date"/></th>
                                <th onClick={() => handleSort('particulars')} scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-slate-50 select-none">Particulars <SortIcon column="particulars"/></th>
                                <th onClick={() => handleSort('credit')} scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-slate-50 select-none">Collected <SortIcon column="credit"/></th>
                                <th onClick={() => handleSort('debit')} scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-slate-50 select-none">Paid Out <SortIcon column="debit"/></th>
                                <th onClick={() => handleSort('balance')} scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-slate-50 select-none">Balance <SortIcon column="balance"/></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {ledgerItems.map((item) => {
                                const isPayoutClickable = item.type === 'Payout' && item.transaction && onPayoutClick;
                                const handleRowClick = () => {
                                    if (isPayoutClickable) {
                                        onPayoutClick(item.transaction);
                                    }
                                };
                                
                                return (
                                    <tr 
                                        key={item.id}
                                        onClick={handleRowClick}
                                        className={isPayoutClickable ? 'cursor-pointer hover:bg-indigo-50 transition-colors group' : ''}
                                    >
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-slate-700 sm:pl-0">{formatDate(item.date)}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 max-w-xs truncate" title={item.particulars}>
                                            <div className="flex items-center gap-2">
                                                {item.particulars}
                                                {isPayoutClickable && (
                                                    <span className="text-xs text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                                                        (Click to edit)
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-success">{item.credit > 0 ? formatCurrency(item.credit) : '-'}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-danger">{item.debit > 0 ? formatCurrency(item.debit) : '-'}</td>
                                        <td className={`relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0 ${item.balance > 0 ? 'text-danger' : 'text-slate-800'}`}>{formatCurrency(item.balance || 0)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default OwnerLedger;
