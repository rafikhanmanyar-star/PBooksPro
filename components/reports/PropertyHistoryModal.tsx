
import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import { useAppContext } from '../../context/AppContext';
import { Transaction, Invoice, Bill, TransactionType, InvoiceType, ContactType } from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Select from '../ui/Select';
import Button from '../ui/Button';

interface PropertyHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    propertyName: string;
}

type HistoryItemType = 'Invoice' | 'Payment' | 'Bill' | 'Service Charge' | 'Expense';

interface HistoryItem {
    id: string;
    date: string;
    type: HistoryItemType;
    subType?: string; // e.g. 'To Owner', 'To Tenant'
    reference: string;
    description: string;
    contactName: string;
    amount: number;
    status?: string;
}

type SortKey = 'date' | 'type' | 'reference' | 'description' | 'contactName' | 'amount' | 'status';

const PropertyHistoryModal: React.FC<PropertyHistoryModalProps> = ({ isOpen, onClose, propertyId, propertyName }) => {
    const { state } = useAppContext();
    const [filterType, setFilterType] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const historyData = useMemo<HistoryItem[]>(() => {
        if (!propertyId) return [];

        const items: HistoryItem[] = [];

        // 1. Invoices
        state.invoices.filter(inv => inv.propertyId === propertyId).forEach(inv => {
            const contact = state.contacts.find(c => c.id === inv.contactId);
            items.push({
                id: inv.id,
                date: inv.issueDate,
                type: inv.invoiceType === InvoiceType.SERVICE_CHARGE ? 'Service Charge' : 'Invoice',
                reference: inv.invoiceNumber,
                description: inv.description || '-',
                contactName: contact?.name || 'Unknown',
                amount: inv.amount,
                status: inv.status
            });
        });

        // 2. Bills
        state.bills.filter(b => b.propertyId === propertyId).forEach(bill => {
            const contact = state.contacts.find(c => c.id === bill.contactId);
            let subType = '';
            if (contact?.type === ContactType.OWNER) subType = ' (Owner)';
            else if (contact?.type === ContactType.TENANT) subType = ' (Tenant)';
            else subType = ' (Vendor)';

            items.push({
                id: bill.id,
                date: bill.issueDate,
                type: 'Bill',
                subType,
                reference: bill.billNumber,
                description: bill.description || '-',
                contactName: contact?.name || 'Unknown',
                amount: -bill.amount, // Bills are money out conceptually
                status: bill.status
            });
        });

        // 3. Transactions (Payments & Direct Expenses)
        state.transactions.filter(tx => tx.propertyId === propertyId).forEach(tx => {
            // Exclude if already part of invoice/bill to avoid visual duplication, 
            // BUT typically users want to see the payment record too. 
            // We will include them but typed as Payment.
            
            const contact = state.contacts.find(c => c.id === tx.contactId);
            
            let type: HistoryItemType = 'Expense';
            if (tx.type === TransactionType.INCOME) type = 'Payment'; // Money In
            
            // If it's a payment for an invoice, it's an Income Payment
            if (tx.invoiceId) type = 'Payment';
            
            // If it's a payment for a bill, it's an Expense Payment
            if (tx.billId) type = 'Payment';

            // Special check for Service Charges (System generated)
            const category = state.categories.find(c => c.id === tx.categoryId);
            if (category?.name.toLowerCase().includes('service charge')) type = 'Service Charge';

            items.push({
                id: tx.id,
                date: tx.date,
                type: type,
                reference: '', 
                description: tx.description || category?.name || '-',
                contactName: contact?.name || 'Unknown',
                amount: tx.type === TransactionType.EXPENSE ? -tx.amount : tx.amount,
                status: 'Completed'
            });
        });

        return items;
    }, [propertyId, state.invoices, state.bills, state.transactions, state.contacts, state.categories]);

    const filteredData = useMemo(() => {
        let data = historyData;
        if (filterType !== 'All') {
            data = data.filter(item => item.type === filterType);
        }
        
        return data.sort((a, b) => {
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
    }, [historyData, filterType, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`History: ${propertyName}`} size="xl">
            <div className="flex flex-col h-[70vh]">
                <div className="flex justify-between items-center mb-4 p-1">
                    <div className="w-48">
                        <Select 
                            value={filterType} 
                            onChange={(e) => setFilterType(e.target.value)} 
                            className="py-1.5 text-sm"
                        >
                            <option value="All">All Transactions</option>
                            <option value="Invoice">Invoices</option>
                            <option value="Payment">Payments</option>
                            <option value="Bill">Bills</option>
                            <option value="Service Charge">Service Charges</option>
                        </Select>
                    </div>
                    <div className="text-sm text-slate-500">
                        {filteredData.length} records found
                    </div>
                </div>

                <div className="flex-grow overflow-auto border rounded-lg shadow-sm bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-sm relative">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Date <SortIcon column="date"/></th>
                                <th onClick={() => handleSort('type')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Type <SortIcon column="type"/></th>
                                <th onClick={() => handleSort('reference')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Ref <SortIcon column="reference"/></th>
                                <th onClick={() => handleSort('contactName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Contact <SortIcon column="contactName"/></th>
                                <th onClick={() => handleSort('description')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="description"/></th>
                                <th onClick={() => handleSort('amount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Amount <SortIcon column="amount"/></th>
                                <th onClick={() => handleSort('status')} className="px-3 py-2 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Status <SortIcon column="status"/></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {filteredData.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(item.date)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold 
                                            ${item.type === 'Invoice' ? 'bg-sky-100 text-sky-700' : 
                                              item.type === 'Bill' ? 'bg-orange-100 text-orange-700' : 
                                              item.type === 'Payment' ? 'bg-emerald-100 text-emerald-700' : 
                                              'bg-slate-100 text-slate-700'}`}>
                                            {item.type}
                                        </span>
                                        {item.subType && <span className="text-xs text-slate-400 ml-1">{item.subType}</span>}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 font-mono tabular-nums text-xs">{item.reference}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.contactName}</td>
                                    <td className="px-3 py-2 text-slate-600 truncate max-w-xs" title={item.description}>{item.description}</td>
                                    <td className={`px-3 py-2 text-right font-medium ${item.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {CURRENCY} {Math.abs(item.amount).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 text-center text-xs text-slate-500">{item.status}</td>
                                </tr>
                            ))}
                             {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">No records found for selected filter.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end mt-4 pt-2 border-t">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

export default PropertyHistoryModal;
