
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';

interface BrokerLedgerProps {
    brokerId: string | null;
    context?: 'Rental' | 'Project';
}

type SortKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

const BrokerLedger: React.FC<BrokerLedgerProps> = ({ brokerId, context }) => {
    const { state } = useAppContext();
    const { openChat } = useWhatsApp();
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const ledgerItems = useMemo(() => {
        if (!brokerId) return [];
        
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const relevantCategoryIds = [brokerFeeCategory?.id, rebateCategory?.id].filter(Boolean) as string[];

        const items: any[] = [];

        // 1. Broker Fees from Rental Agreements (Credit)
        // Include only if context is Rental or undefined (All)
        if (!context || context === 'Rental') {
            state.rentalAgreements
                .filter(ra => ra.brokerId === brokerId && (ra.brokerFee || 0) > 0)
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
            
        // 3. Payments to Broker (Debit)
        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE && tx.contactId === brokerId && tx.categoryId && relevantCategoryIds.includes(tx.categoryId))
            .filter(tx => {
                const category = state.categories.find(c => c.id === tx.categoryId);
                const isRebate = category?.name === 'Rebate Amount';
                
                if (context === 'Project') {
                    // Must be linked to a project OR be a Rebate category
                    return !!tx.projectId || isRebate;
                } else if (context === 'Rental') {
                    // Must NOT be linked to a project AND not be a Rebate category
                    return !tx.projectId && !isRebate;
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

    }, [brokerId, context, state.transactions, state.rentalAgreements, state.projectAgreements, state.properties, state.projects, state.categories, sortConfig]);

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
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
        openChat(brokerContact, brokerContact.contactNo || '', message);
    };

    return (
        <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                    <table className="min-w-full divide-y divide-slate-300">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('date')} scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-0 cursor-pointer hover:bg-slate-50 select-none">Date <SortIcon column="date"/></th>
                                <th onClick={() => handleSort('particulars')} scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-50 select-none">Particulars <SortIcon column="particulars"/></th>
                                <th onClick={() => handleSort('credit')} scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-50 select-none">Fee Earned (+) <SortIcon column="credit"/></th>
                                <th onClick={() => handleSort('debit')} scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-50 select-none">Paid (-) <SortIcon column="debit"/></th>
                                <th onClick={() => handleSort('balance')} scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0 text-right text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-50 select-none">Balance <SortIcon column="balance"/></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {ledgerItems.map((item) => (
                                <tr key={item.id}>
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-slate-700 sm:pl-0">{formatDate(item.date)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 max-w-xs truncate" title={item.particulars}>
                                        {item.particulars}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-success">{item.credit > 0 ? (item.credit || 0).toLocaleString() : '-'}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-danger">{item.debit > 0 ? (item.debit || 0).toLocaleString() : '-'}</td>
                                    <td className={`relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0 ${item.balance > 0 ? 'text-danger' : 'text-slate-800'}`}>{(item.balance || 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* WhatsApp Send Ledger Button */}
            <div className="flex justify-end mt-3 pt-3 border-t border-slate-200">
                <button
                    onClick={handleSendWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                >
                    <div className="w-3.5 h-3.5">{ICONS.whatsapp}</div>
                    Send Ledger via WhatsApp
                </button>
            </div>
        </div>
    );
};

export default BrokerLedger;
