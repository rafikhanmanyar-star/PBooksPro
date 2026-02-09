import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Bill, InvoiceStatus, ContactType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface AllBillsTableProps {
    onEditBill?: (bill: Bill) => void;
}

type SortKey = 'issueDate' | 'billNumber' | 'vendorName' | 'amount' | 'paidAmount' | 'status' | 'balance' | 'description';

const AllBillsTable: React.FC<AllBillsTableProps> = ({ onEditBill }) => {
    const { state } = useAppContext();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'issueDate', direction: 'desc' });

    const bills = useMemo(() => {
        return state.bills.filter(b => {
            const vendorId = b.vendorId;
            if (!vendorId) return false;
            const vendor = state.vendors?.find(v => v.id === vendorId);
            return vendor !== undefined;
        });
    }, [state.bills, state.vendors]);

    const filteredBills = useMemo(() => {
        let result = bills;
        if (statusFilter !== 'All') {
            result = result.filter(b => b.status === statusFilter);
        }
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(b => {
                const vendorId = b.vendorId;
                const vendor = state.vendors?.find(v => v.id === vendorId);
                return (
                    b.billNumber.toLowerCase().includes(q) ||
                    (b.description && b.description.toLowerCase().includes(q)) ||
                    (vendor && vendor.name.toLowerCase().includes(q))
                );
            });
        }

        return result.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            switch (sortConfig.key) {
                case 'issueDate':
                    aVal = new Date(a.issueDate).getTime();
                    bVal = new Date(b.issueDate).getTime();
                    break;
                case 'billNumber':
                    aVal = a.billNumber.toLowerCase();
                    bVal = b.billNumber.toLowerCase();
                    break;
                case 'vendorName':
                    const vendorIdA = a.vendorId;
                    const vendorIdB = b.vendorId;
                    const vendorA = state.vendors?.find(v => v.id === vendorIdA);
                    const vendorB = state.vendors?.find(v => v.id === vendorIdB);
                    aVal = vendorA?.name.toLowerCase() || '';
                    bVal = vendorB?.name.toLowerCase() || '';
                    break;
                case 'amount':
                    aVal = a.amount;
                    bVal = b.amount;
                    break;
                case 'paidAmount':
                    aVal = a.paidAmount || 0;
                    bVal = b.paidAmount || 0;
                    break;
                case 'balance':
                    aVal = a.amount - (a.paidAmount || 0);
                    bVal = b.amount - (b.paidAmount || 0);
                    break;
                case 'status':
                    aVal = a.status;
                    bVal = b.status;
                    break;
                case 'description':
                    aVal = (a.description || '').toLowerCase();
                    bVal = (b.description || '').toLowerCase();
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [bills, search, statusFilter, sortConfig, state.vendors]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                <div className="flex-grow relative">
                    <Input
                        id="bill-search"
                        name="bill-search"
                        placeholder="Search bills by vendor, number or description..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 py-2 text-sm"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <div className="w-4 h-4">{ICONS.search}</div>
                    </div>
                </div>
                <div className="w-full sm:w-48">
                    <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="py-2 text-sm">
                        <option value="All">All Status</option>
                        <option value={InvoiceStatus.UNPAID}>Unpaid</option>
                        <option value={InvoiceStatus.PARTIALLY_PAID}>Partially Paid</option>
                        <option value={InvoiceStatus.PAID}>Paid</option>
                        <option value={InvoiceStatus.OVERDUE}>Overdue</option>
                    </Select>
                </div>
            </div>

            <div className="overflow-auto border rounded-lg flex-grow bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm relative">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th onClick={() => handleSort('issueDate')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="issueDate" /></th>
                            <th onClick={() => handleSort('billNumber')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Bill # <SortIcon column="billNumber" /></th>
                            <th onClick={() => handleSort('vendorName')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Vendor <SortIcon column="vendorName" /></th>
                            <th onClick={() => handleSort('description')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Description <SortIcon column="description" /></th>
                            <th onClick={() => handleSort('amount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Amount <SortIcon column="amount" /></th>
                            <th onClick={() => handleSort('paidAmount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid <SortIcon column="paidAmount" /></th>
                            <th onClick={() => handleSort('balance')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance" /></th>
                            <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Status <SortIcon column="status" /></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredBills.length > 0 ? filteredBills.map(bill => {
                            const vendorId = bill.vendorId;
                            const vendor = state.vendors?.find(v => v.id === vendorId);
                            return (
                                <tr key={bill.id} onClick={() => onEditBill?.(bill)} className="hover:bg-slate-50 cursor-pointer transition-colors group">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{formatDate(bill.issueDate)}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-slate-800 group-hover:text-accent">{bill.billNumber}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-slate-800 group-hover:text-accent">{vendor?.name || 'Unknown'}</td>
                                    <td className="px-4 py-3 text-sm max-w-xs truncate text-slate-500 italic">{bill.description || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-right font-medium tabular-nums">{CURRENCY} {bill.amount.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-sm text-right text-emerald-600 tabular-nums">{CURRENCY} {(bill.paidAmount || 0).toLocaleString()}</td>
                                    <td className={`px-4 py-3 text-sm text-right font-bold tabular-nums ${(bill.amount - (bill.paidAmount || 0)) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{CURRENCY} {(bill.amount - (bill.paidAmount || 0)).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold inline-block w-24 text-center ${bill.status === InvoiceStatus.PAID ? 'bg-emerald-100 text-emerald-800' :
                                            bill.status === InvoiceStatus.PARTIALLY_PAID ? 'bg-amber-100 text-amber-800' :
                                                'bg-rose-100 text-rose-800'
                                            }`}>
                                            {bill.status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                    No bills found matching your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AllBillsTable;

