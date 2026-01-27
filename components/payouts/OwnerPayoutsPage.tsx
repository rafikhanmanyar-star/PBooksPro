
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType, InvoiceType, Transaction } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatCurrency } from '../../utils/numberUtils';
import OwnerPayoutModal from './OwnerPayoutModal';
import OwnerLedger from './OwnerLedger';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Tabs from '../ui/Tabs';
import BrokerPayouts from './BrokerPayouts';
import Input from '../ui/Input';
import Select from '../ui/Select';

export interface OwnerBalance {
    ownerId: string;
    ownerName: string;
    collected: number;
    paid: number;
    balance: number;
}

const OwnerPayoutsPage: React.FC = () => {
    const { state } = useAppContext();
    const [activeTab, setActiveTab] = useState('Property Owners');
    const [payoutType, setPayoutType] = useState<'Rent' | 'Security'>('Rent');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | undefined>(undefined);

    // Reset building filter when owner changes
    useEffect(() => {
        setSelectedBuildingId('all');
    }, [selectedOwnerId]);

    // --- Rental Income Balances (Global List) ---
    const ownerRentalBalances = useMemo<OwnerBalance[]>(() => {
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        if (!rentalIncomeCategory) {
            console.warn('⚠️ Rental Income category not found. Available categories:', state.categories.map(c => c.name));
            return [];
        }

        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        
        const ownerData: { [ownerId: string]: { collected: number; paid: number } } = {};

        state.contacts.filter(c => c.type === ContactType.OWNER).forEach(owner => {
            ownerData[owner.id] = { collected: 0, paid: 0 };
        });

        // 1. Add Rental Income
        const rentalIncomeTxs = state.transactions.filter(tx => 
            tx.type === TransactionType.INCOME && 
            tx.categoryId === rentalIncomeCategory.id
        );
        
        // Debug logging
        if (rentalIncomeTxs.length > 0) {
            console.log(`📊 Found ${rentalIncomeTxs.length} rental income transactions`);
        }
        
        rentalIncomeTxs.forEach(tx => {
            if (tx.propertyId) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property && property.ownerId && ownerData[property.ownerId]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount)) {
                        // Include both positive (rent collected) and negative (service charge deductions) amounts
                        ownerData[property.ownerId].collected += amount;
                    }
                } else {
                    // Debug: log transactions that couldn't be matched
                    if (tx.propertyId && !property) {
                        console.warn(`⚠️ Transaction ${tx.id} has propertyId ${tx.propertyId} but property not found`);
                    } else if (property && !property.ownerId) {
                        console.warn(`⚠️ Property ${property.name} (${tx.propertyId}) has no ownerId`);
                    } else if (property && property.ownerId && !ownerData[property.ownerId]) {
                        console.warn(`⚠️ Owner ${property.ownerId} not found in ownerData`);
                    }
                }
            } else {
                // Debug: log transactions without propertyId
                console.warn(`⚠️ Rental income transaction ${tx.id} (${tx.description || 'no desc'}) has no propertyId`);
            }
        });
        
        // 2. Subtract Owner Payouts and Property Expenses
        const expenseTxs = state.transactions.filter(tx => tx.type === TransactionType.EXPENSE);
        
        expenseTxs.forEach(tx => {
             let isOwnerPayout = false;

             // Case A: Direct Owner Expense (Payouts)
             if (tx.categoryId === ownerPayoutCategory?.id) {
                 isOwnerPayout = true;
                 if (tx.contactId && ownerData[tx.contactId]) {
                     const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                     if (!isNaN(amount) && amount > 0) {
                         ownerData[tx.contactId].paid += amount;
                     }
                 }
             }
             
             // Case B: Property-linked Expense (Repairs, Bills, etc) - Deduct from Property Owner
             // If NOT a Payout, NOT Security related, NOT Tenant related -> It is an Owner Expense
             if (!isOwnerPayout && tx.propertyId) {
                 const category = state.categories.find(c => c.id === tx.categoryId);
                 const catName = category?.name || '';

                 // Exclude Security/Tenant items
                 if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;

                 const property = state.properties.find(p => p.id === tx.propertyId);
                 if (property && property.ownerId && ownerData[property.ownerId]) {
                     const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                     if (!isNaN(amount) && amount > 0) {
                         ownerData[property.ownerId].paid += amount;
                     }
                 }
             }
        });
        
        return Object.entries(ownerData).map(([ownerId, data]) => {
            const owner = state.contacts.find(c => c.id === ownerId);
            return {
                ownerId,
                ownerName: owner?.name || 'Unknown Owner',
                ...data,
                balance: data.collected - data.paid,
            };
        }).filter(item => Math.abs(item.balance) > 0.01 || item.collected > 0 || item.paid > 0).sort((a,b) => b.balance - a.balance);

    }, [state.transactions, state.categories, state.properties, state.contacts]);

    // --- Security Deposit Balances (Global List) ---
    const ownerSecurityBalances = useMemo<OwnerBalance[]>(() => {
        const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
        const secRefCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
        const ownerSecPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');

        if (!secDepCategory) return [];

        const ownerData: { [ownerId: string]: { collected: number; paid: number } } = {};

        state.contacts.filter(c => c.type === ContactType.OWNER).forEach(owner => {
            ownerData[owner.id] = { collected: 0, paid: 0 };
        });

        // 1. Inflows (Security Deposit Income)
        const incomeTxs = state.transactions.filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === secDepCategory.id);
        incomeTxs.forEach(tx => {
             if (tx.propertyId) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property && property.ownerId && ownerData[property.ownerId]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) {
                        ownerData[property.ownerId].collected += amount;
                    }
                }
            }
        });

        // 2. Outflows (Refunds to Tenant OR Payouts to Owner)
        const expenseTxs = state.transactions.filter(tx => tx.type === TransactionType.EXPENSE);
        expenseTxs.forEach(tx => {
            let ownerId = '';
            
            // Direct Payout to Owner (Security Payout)
            if (tx.contactId && ownerData[tx.contactId] && ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id) {
                ownerId = tx.contactId;
            }
            // Property-based expenses (Refunds to Tenant or Payouts linked to property)
            else if (tx.propertyId) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property) ownerId = property.ownerId;
            }

            if (ownerId && ownerData[ownerId]) {
                // Check categories
                if ( (secRefCategory && tx.categoryId === secRefCategory.id) || 
                     (ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id) ) {
                     const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                     if (!isNaN(amount) && amount > 0) {
                         ownerData[ownerId].paid += amount;
                     }
                }
            }
        });

        return Object.entries(ownerData).map(([ownerId, data]) => {
            const owner = state.contacts.find(c => c.id === ownerId);
            return {
                ownerId,
                ownerName: owner?.name || 'Unknown Owner',
                ...data,
                balance: data.collected - data.paid,
            };
        }).filter(item => Math.abs(item.balance) > 0.01 || item.collected > 0 || item.paid > 0).sort((a,b) => b.balance - a.balance);

    }, [state.transactions, state.categories, state.properties, state.contacts]);

    // Determine which list to use
    const currentBalances = payoutType === 'Rent' ? ownerRentalBalances : ownerSecurityBalances;

    const filteredOwnerBalances = useMemo(() => {
        if (!searchQuery) return currentBalances;
        const lower = searchQuery.toLowerCase();
        return currentBalances.filter(ob => {
            // Match Owner Name
            if (ob.ownerName.toLowerCase().includes(lower)) return true;
            // Match Property Names owned by this owner
            const properties = state.properties.filter(p => p.ownerId === ob.ownerId);
            if (properties.some(p => p.name.toLowerCase().includes(lower))) return true;
            return false;
        });
    }, [currentBalances, searchQuery, state.properties]);

    // --- Specific Building Calculation Logic ---
    const availableBuildingsForOwner = useMemo(() => {
        if (!selectedOwnerId) return [];
        const propertyIds = new Set(state.properties.filter(p => p.ownerId === selectedOwnerId).map(p => p.buildingId));
        return state.buildings.filter(b => propertyIds.has(b.id));
    }, [selectedOwnerId, state.properties, state.buildings]);

    // Calculate Data for Selected Owner (optionally filtered by building)
    const displayedOwnerData = useMemo(() => {
        const globalData = currentBalances.find(ob => ob.ownerId === selectedOwnerId);
        if (!globalData) return null;
        if (selectedBuildingId === 'all') return globalData;

        // Recalculate based on specific building
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const ownerSecPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');
        
        let collected = 0;
        let paid = 0;

        const ownerPropertiesInBuilding = new Set(
            state.properties
                .filter(p => p.ownerId === selectedOwnerId && p.buildingId === selectedBuildingId)
                .map(p => p.id)
        );

        state.transactions.forEach(tx => {
            // Filter by Building Context
            let txBuildingId = tx.buildingId;
            // Try to resolve building from property if direct link missing
            if (!txBuildingId && tx.propertyId) {
                const prop = state.properties.find(p => p.id === tx.propertyId);
                if (prop) txBuildingId = prop.buildingId;
            }

            // Must match selected building (Directly or via Property)
            if (txBuildingId !== selectedBuildingId) return;

            // --- RENT MODE ---
            if (payoutType === 'Rent') {
                if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory?.id) {
                     // Check ownership via property
                     if (tx.propertyId && ownerPropertiesInBuilding.has(tx.propertyId)) {
                         const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                         if (!isNaN(amount)) {
                             // Include both positive (rent collected) and negative (service charge deductions) amounts
                             collected += amount;
                         }
                     }
                } else if (tx.type === TransactionType.EXPENSE) {
                    // Payouts specifically tagged to this building for this owner
                    if (tx.contactId === selectedOwnerId && tx.categoryId === ownerPayoutCategory?.id) {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount) && amount > 0) {
                            paid += amount;
                        }
                    }
                    // Property Expenses
                    if (tx.propertyId && ownerPropertiesInBuilding.has(tx.propertyId)) {
                         const category = state.categories.find(c => c.id === tx.categoryId);
                         const catName = category?.name || '';
                         
                         // Exclude Payouts (handled above), Security, Tenant
                         if (tx.categoryId === ownerPayoutCategory?.id) return;
                         if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout') return;
                         if (catName.includes('(Tenant)')) return;

                         const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                         if (!isNaN(amount) && amount > 0) {
                             paid += amount;
                         }
                    }
                }
            } 
            // --- SECURITY MODE ---
            else {
                 if (tx.type === TransactionType.INCOME && tx.categoryId === secDepCategory?.id) {
                     if (tx.propertyId && ownerPropertiesInBuilding.has(tx.propertyId)) {
                         const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                         if (!isNaN(amount) && amount > 0) {
                             collected += amount;
                         }
                     }
                 } else if (tx.type === TransactionType.EXPENSE) {
                     // Security Payouts tagged to building
                     if (tx.contactId === selectedOwnerId && tx.categoryId === ownerSecPayoutCategory?.id) {
                         const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                         if (!isNaN(amount) && amount > 0) {
                             paid += amount;
                         }
                     }
                     // Refunds / Deductions
                     if (tx.propertyId && ownerPropertiesInBuilding.has(tx.propertyId)) {
                         const catName = state.categories.find(c => c.id === tx.categoryId)?.name || '';
                         if (catName === 'Security Deposit Refund' || catName.includes('(Tenant)')) {
                             // Note: Tenant deductions technically don't reduce owner liability to tenant, but reduce CASH held.
                             // However, usually we track "Liability to Owner" or "Liability to Tenant". 
                             // Keeping consistent with global calculation logic.
                             const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                             if (!isNaN(amount) && amount > 0) {
                                 paid += amount;
                             }
                         }
                     }
                 }
            }
        });

        return {
            ...globalData,
            collected,
            paid,
            balance: collected - paid
        };

    }, [selectedOwnerId, selectedBuildingId, payoutType, currentBalances, state.transactions, state.properties, state.categories]);
    
    const selectedOwnerContact = state.contacts.find(c => c.id === selectedOwnerId);

    const renderOwnersView = () => (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full overflow-hidden">
            <Card className="md:col-span-1 h-full flex flex-col overflow-hidden">
                <div className="flex-shrink-0 mb-4">
                    <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg mb-4">
                        <button
                            onClick={() => { setPayoutType('Rent'); setSelectedOwnerId(null); }}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                payoutType === 'Rent' ? 'bg-white text-accent shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Rental Income
                        </button>
                        <button
                            onClick={() => { setPayoutType('Security'); setSelectedOwnerId(null); }}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                payoutType === 'Security' ? 'bg-white text-accent shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Security Deposit
                        </button>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <Input 
                            placeholder="Search owner..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-9 py-1.5 text-sm"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')} 
                                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="overflow-y-auto flex-grow -mx-2 px-2">
                    {filteredOwnerBalances.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                            {filteredOwnerBalances.map(owner => (
                                <button 
                                    key={owner.ownerId} 
                                    onClick={() => setSelectedOwnerId(owner.ownerId)} 
                                    className={`w-full text-left p-2 rounded-md flex justify-between items-center gap-2 ${selectedOwnerId === owner.ownerId ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                >
                                    <span className={`font-semibold truncate ${selectedOwnerId === owner.ownerId ? 'text-accent' : 'text-slate-800'}`}>
                                        {owner.ownerName}
                                    </span>
                                    <span className="text-sm text-slate-600 whitespace-nowrap">
                                        {CURRENCY} {formatCurrency(owner.balance)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-4">
                            {searchQuery ? 'No owners found matching your search.' : `No pending ${payoutType === 'Rent' ? 'rental' : 'security'} payouts.`}
                        </p>
                    )}
                </div>
            </Card>

            <div className="md:col-span-3 h-full overflow-y-auto space-y-4 pb-4">
                {displayedOwnerData && selectedOwnerContact ? (
                    <>
                        <Card>
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-xl font-bold">{selectedOwnerContact.name}</h3>
                                    <p className="text-sm text-slate-500">{payoutType} Payout</p>
                                </div>
                                <div className="flex gap-2 items-center">
                                    {/* Building Filter */}
                                    <div className="w-48">
                                        <Select
                                            value={selectedBuildingId}
                                            onChange={(e) => setSelectedBuildingId(e.target.value)}
                                            className="text-sm py-1.5"
                                        >
                                            <option value="all">All Buildings</option>
                                            {availableBuildingsForOwner.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    {displayedOwnerData.balance > 0 && (
                                        <Button onClick={() => { setTransactionToEdit(undefined); setIsModalOpen(true); }}>Pay Owner</Button>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-sm text-slate-500">Collected {selectedBuildingId !== 'all' ? '(Selected)' : ''}</p>
                                    <p className="font-semibold text-lg text-success">{CURRENCY} {formatCurrency(displayedOwnerData.collected)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Paid/Expenses {selectedBuildingId !== 'all' ? '(Selected)' : ''}</p>
                                    <p className="font-semibold text-lg text-slate-700">{CURRENCY} {formatCurrency(displayedOwnerData.paid)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Balance Held {selectedBuildingId !== 'all' ? '(Selected)' : ''}</p>
                                    <p className="font-bold text-xl text-danger">{CURRENCY} {formatCurrency(displayedOwnerData.balance)}</p>
                                </div>
                            </div>
                        </Card>
                        <Card>
                            <h3 className="text-lg font-semibold mb-3">Transaction Ledger ({payoutType})</h3>
                            <OwnerLedger 
                                ownerId={selectedOwnerId} 
                                ledgerType={payoutType} 
                                buildingId={selectedBuildingId === 'all' ? undefined : selectedBuildingId}
                                onPayoutClick={(transaction) => {
                                    setTransactionToEdit(transaction);
                                    setIsModalOpen(true);
                                }}
                            />
                        </Card>
                    </>
                ) : (
                    <Card>
                        <div className="text-center py-20">
                            <p className="text-slate-500">Select an owner to view details and payment history.</p>
                        </div>
                    </Card>
                )}
            </div>
            
            {displayedOwnerData && selectedOwnerContact && (
                 <OwnerPayoutModal
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setTransactionToEdit(undefined); }}
                    owner={selectedOwnerContact}
                    balanceDue={displayedOwnerData.balance}
                    payoutType={payoutType}
                    preSelectedBuildingId={selectedBuildingId === 'all' ? undefined : selectedBuildingId}
                    transactionToEdit={transactionToEdit}
                />
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex-shrink-0">
                <Tabs tabs={['Property Owners', 'Brokers']} activeTab={activeTab} onTabClick={setActiveTab} />
            </div>
            <div className="flex-grow overflow-hidden">
                {activeTab === 'Property Owners' ? renderOwnersView() : (
                    <div className="h-full overflow-y-auto">
                        <BrokerPayouts context="Rental" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default OwnerPayoutsPage;
