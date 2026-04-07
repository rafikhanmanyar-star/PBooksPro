
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';

interface BrokerLedgerProps {
    brokerId: string | null;
    context?: 'Rental' | 'Project';
    buildingId?: string;
    propertyId?: string;
}

type SortKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

const BrokerLedger: React.FC<BrokerLedgerProps> = ({ brokerId, context, buildingId, propertyId }) => {
    const { state } = useAppContext();
    const { openChat } = useWhatsApp();
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Property scope for Rental context: when building/property filter is applied, ledger shows only that scope.
    const rentalPropertyIdsInScope = useMemo(() => {
        if (context !== 'Rental' || (!buildingId && !propertyId)) return null;
        if (propertyId) return new Set<string>([String(propertyId)]);
        return new Set(
            state.properties
                .filter(p => p.buildingId === buildingId)
                .map(p => String(p.id))
        );
    }, [context, buildingId, propertyId, state.properties]);

    const ledgerItems = useMemo(() => {
        if (!brokerId) return [];
        
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const relevantCategoryIds = [brokerFeeCategory?.id, rebateCategory?.id].filter(Boolean) as string[];

        const items: any[] = [];

        // 1. Broker Fees from Rental Agreements (Credit). Exclude renewed agreements so broker is not charged again on renewal.
        // When filter is applied, only include agreements for in-scope properties.
        if (!context || context === 'Rental') {
            state.rentalAgreements
                .filter(ra => {
                    if (ra.previousAgreementId || ra.brokerId !== brokerId || !(ra.brokerFee || 0)) return false;
                    if (rentalPropertyIdsInScope && (!ra.propertyId || !rentalPropertyIdsInScope.has(String(ra.propertyId)))) return false;
                    return true;
                })
                .forEach(ra => {
                    const property = state.properties.find(p => p.id === ra.propertyId);
                    items.push({
                        id: `fee-rent-${ra.id}`,
                        date: ra.startDate,
                        particulars: `Commission for ${property?.name || 'Unit'} (Agr #${ra.agreementNumber})`,
                        debit: 0,
                        credit: ra.brokerFee || 0,
                        type: 'Fee'
                    });
                });
        }

        // 2. Broker Fees from Project Agreements (Credit)
        // Include only if context is Project or undefined (All)
        if (!context || context === 'Project') {
            state.projectAgreements
                .filter(pa => pa.rebateBrokerId === brokerId && (pa.rebateAmount || 0) > 0)
                .forEach(pa => {
                    const project = state.projects.find(p => p.id === pa.projectId);
                    items.push({
                        id: `fee-proj-${pa.id}`,
                        date: pa.issueDate,
                        particulars: `Commission for ${project?.name || 'Project'} (Agr #${pa.agreementNumber})`,
                        debit: 0,
                        credit: pa.rebateAmount || 0,
                        type: 'Fee'
                    });
                });
        }
            
        // 3. Payments to Broker (Debit). When Rental filter is applied, only include payments for in-scope properties (tx.propertyId).
        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE && tx.contactId === brokerId && tx.categoryId && relevantCategoryIds.includes(tx.categoryId))
            .filter(tx => {
                const category = state.categories.find(c => c.id === tx.categoryId);
                const isRebate = category?.name === 'Rebate Amount';
                
                if (context === 'Project') {
                    return !!tx.projectId || isRebate;
                } else if (context === 'Rental') {
                    if (tx.projectId || isRebate) return false;
                    if (rentalPropertyIdsInScope) {
                        if (!tx.propertyId) return false;
                        return rentalPropertyIdsInScope.has(String(tx.propertyId));
                    }
                    return true;
                }
                return true;
            })
            .forEach(tx => {
                let desc = tx.description || 'Commission Payment';
                if (tx.projectId) {
                    const p = state.projects.find(p => p.id === tx.projectId);
                    desc += ` (${p?.name})`;
                }
                items.push({
                    id: `pay-${tx.id}`,
                    date: tx.date,
                    particulars: desc,
                    debit: tx.amount,
                    credit: 0,
                    type: 'Payment'
                });
            });

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
        return items.map(item => {
            runningBalance += item.credit - item.debit;
            return { ...item, balance: runningBalance };
        });

    }, [brokerId, context, rentalPropertyIdsInScope, state.transactions, state.rentalAgreements, state.projectAgreements, state.properties, state.projects, state.categories, sortConfig]);

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className={`ml-1 text-[10px] ${sortConfig.key === column ? 'text-primary' : 'text-app-muted'}`}>
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    if (!brokerId) return null;

    if (ledgerItems.length === 0) {
        return <p className="text-slate-500 text-center py-8">No commissions or payments recorded for this broker in this section.</p>
    }

    const handleSendWhatsApp = () => {
        if (!brokerId) return;
        const brokerContact = state.contacts.find(c => c.id === brokerId);
        if (!brokerContact) return;

        const totalEarned = ledgerItems.reduce((sum, item) => sum + item.credit, 0);
        const totalPaid = ledgerItems.reduce((sum, item) => sum + item.debit, 0);
        const finalBalance = totalEarned - totalPaid;

        const template = state.whatsAppTemplates.brokerPayoutLedger || 'Dear {contactName}, your commission balance is {balance}.';
        const message = WhatsAppService.generateBrokerPayoutLedger(
            template, brokerContact, totalEarned, totalPaid, finalBalance
        );
        sendOrOpenWhatsApp(
            { contact: brokerContact, message, phoneNumber: brokerContact.contactNo || undefined },
            () => state.whatsAppMode,
            openChat
        );
    };

    return (
        <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                    <table className="min-w-full divide-y divide-app-border">
                        <thead className="bg-app-table-header">
                            <tr>
                                <th onClick={() => handleSort('date')} scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-app-muted sm:pl-0 cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none">Date <SortIcon column="date"/></th>
                                <th onClick={() => handleSort('particulars')} scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none">Particulars <SortIcon column="particulars"/></th>
                                <th onClick={() => handleSort('credit')} scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none">Fee Earned (+) <SortIcon column="credit"/></th>
                                <th onClick={() => handleSort('debit')} scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none">Paid (-) <SortIcon column="debit"/></th>
                                <th onClick={() => handleSort('balance')} scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0 text-right text-sm font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar transition-colors duration-ds select-none">Balance <SortIcon column="balance"/></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border">
                            {ledgerItems.map((item) => (
                                <tr key={item.id} className="hover:bg-app-table-hover transition-colors duration-ds">
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-app-muted sm:pl-0">{formatDate(item.date)}</td>
                                    <td className="px-3 py-4 text-sm text-app-text max-w-md min-w-[10rem] whitespace-normal break-words" title={item.particulars}>
                                        {item.particulars}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-ds-success tabular-nums">{item.credit > 0 ? (item.credit || 0).toLocaleString() : '-'}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-ds-danger tabular-nums">{item.debit > 0 ? (item.debit || 0).toLocaleString() : '-'}</td>
                                    <td className={`relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0 tabular-nums ${item.balance > 0 ? 'text-ds-danger' : 'text-app-text'}`}>{(item.balance || 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* WhatsApp Send Ledger Button */}
            <div className="flex justify-end mt-3 pt-3 border-t border-app-border">
                <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success hover:bg-app-toolbar transition-colors duration-ds"
                >
                    <div className="w-3.5 h-3.5">{ICONS.whatsapp}</div>
                    Send Ledger via WhatsApp
                </button>
            </div>
        </div>
    );
};

export default BrokerLedger;
