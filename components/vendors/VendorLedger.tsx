
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { exportJsonToExcel } from '../../services/exportService';

interface VendorLedgerProps {
    vendorId: string | null;
    onItemClick: (id: string, type: 'bill' | 'transaction') => void;
}

type SortKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

const VendorLedger: React.FC<VendorLedgerProps> = ({ vendorId, onItemClick }) => {
    const { state } = useAppContext();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const ledgerItems = useMemo(() => {
        if (!vendorId) return [];

        const bills = state.bills
            .filter(b => b.vendorId === vendorId || (!b.vendorId && b.contactId === vendorId))
            .map(b => ({
                id: `bill-${b.id}`,
                originalId: b.id,
                type: 'bill' as const,
                date: b.issueDate,
                particulars: `Bill #${b.billNumber}`,
                debit: 0,
                credit: b.amount, // Bill is a credit (liability increases)
                children: [] as any[]
            }));

        const allPayments = state.transactions.filter(t => (t.vendorId === vendorId || (!t.vendorId && t.contactId === vendorId)) && t.type === TransactionType.EXPENSE);
        const paymentMap = new Map<string, any>();
        const individualPayments: any[] = [];

        allPayments.forEach(tx => {
            if (tx.batchId) {
                if (!paymentMap.has(tx.batchId)) {
                    paymentMap.set(tx.batchId, {
                        id: `batch-${tx.batchId}`,
                        date: tx.date,
                        particulars: 'Bulk Payment',
                        debit: 0,
                        credit: 0,
                        type: 'batch_payment',
                        children: []
                    });
                }
                const batch = paymentMap.get(tx.batchId);
                batch.debit += tx.amount; // Payment is a debit (liability decreases)
                batch.children.push({
                    id: `txn-${tx.id}`,
                    originalId: tx.id,
                    type: 'transaction',
                    date: tx.date,
                    particulars: tx.description,
                    debit: tx.amount,
                    credit: 0
                });
            } else {
                individualPayments.push({
                    id: `txn-${tx.id}`,
                    originalId: tx.id,
                    type: 'transaction',
                    date: tx.date,
                    particulars: tx.description || 'Payment',
                    debit: tx.amount,
                    credit: 0,
                    children: []
                });
            }
        });

        const batchedPayments = Array.from(paymentMap.values()).map(b => ({
            ...b,
            particulars: `Bulk Payment (${b.children.length} items)`
        }));

        const combined = [...bills, ...individualPayments, ...batchedPayments].sort((a, b) => {
            // Base Sort
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
        return combined.map(item => {
            // In vendor ledger: Credit (Bill) increases balance (payable), Debit (Payment) decreases balance
            runningBalance += item.credit - item.debit;
            return { ...item, balance: runningBalance };
        });

    }, [vendorId, state.bills, state.transactions, sortConfig]);

    const handleExport = () => {
        if (!vendorId) return;
        const vendor = state.vendors?.find(v => v.id === vendorId);
        const data = ledgerItems.map(item => ({
            Date: formatDate(item.date),
            Particulars: item.particulars,
            'Bill Amount (Credit)': item.credit,
            'Payment (Debit)': item.debit,
            Balance: item.balance
        }));
        exportJsonToExcel(data, `vendor_ledger_${vendor?.name || 'export'}.xlsx`, 'Ledger');
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    if (!vendorId) return null;

    return (
        <div className="flex flex-col h-full min-h-0">
            {ledgerItems.length === 0 ? (
                <p className="text-gray-500 text-center mt-8">No transactions or bills for this vendor.</p>
            ) : (
                <div className="flow-root flex-1 min-h-0 overflow-auto -mt-1">
                    <div className="-mx-2 overflow-x-auto">
                        <div className="inline-block min-w-full align-middle">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th onClick={() => handleSort('date')} scope="col" className="py-2 pl-2 pr-2 text-left text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date" /></th>
                                        <th onClick={() => handleSort('particulars')} scope="col" className="px-2 py-2 text-left text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars" /></th>
                                        <th onClick={() => handleSort('credit')} scope="col" className="px-2 py-2 text-right text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Bills (Cr) <SortIcon column="credit" /></th>
                                        <th onClick={() => handleSort('debit')} scope="col" className="px-2 py-2 text-right text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Payments (Dr) <SortIcon column="debit" /></th>
                                        <th scope="col" className="py-2 pl-2 pr-1 text-right text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap" onClick={() => handleSort('balance')}>Balance <SortIcon column="balance" /></th>
                                        <th scope="col" className="py-2 pl-1 pr-2 w-8">
                                            <button
                                                onClick={handleExport}
                                                disabled={ledgerItems.length === 0}
                                                className="flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors disabled:opacity-50"
                                                title="Export to Excel"
                                            >
                                                <span className="w-3.5 h-3.5">{ICONS.export}</span>
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {ledgerItems.map((item) => {
                                        const hasChildren = item.children && item.children.length > 0;
                                        const isExpanded = expandedIds.has(item.id);

                                        return (
                                            <React.Fragment key={item.id}>
                                                <tr
                                                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}
                                                    onClick={() => hasChildren ? toggleExpand({ stopPropagation: () => { } } as any, item.id) : onItemClick(item.originalId, item.type)}
                                                >
                                                    <td className="whitespace-nowrap py-2 pl-2 pr-2 text-xs text-slate-700 flex items-center gap-1.5">
                                                        {hasChildren && (
                                                            <button onClick={(e) => toggleExpand(e, item.id)} className="text-slate-400 hover:text-slate-600 focus:outline-none">
                                                                <div className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                                                    {ICONS.chevronRight}
                                                                </div>
                                                            </button>
                                                        )}
                                                        <span className={!hasChildren ? 'pl-5' : ''}>{formatDate(item.date)}</span>
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600 max-w-xs truncate" title={item.particulars}>
                                                        {item.particulars}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-xs text-right text-slate-600">{item.credit > 0 ? (item.credit || 0).toLocaleString() : '-'}</td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-xs text-right text-slate-600">{item.debit > 0 ? (item.debit || 0).toLocaleString() : '-'}</td>
                                                    <td className={`whitespace-nowrap py-2 pl-2 pr-1 text-right text-xs font-semibold ${item.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{(item.balance || 0).toLocaleString()}</td>
                                                    <td className="py-2 pl-1 pr-2 w-8"></td>
                                                </tr>
                                                {isExpanded && hasChildren && item.children.map((child: any) => (
                                                    <tr
                                                        key={child.id}
                                                        className="bg-slate-50/70 text-xs hover:bg-slate-100 cursor-pointer"
                                                        onClick={() => onItemClick(child.originalId, child.type)}
                                                    >
                                                        <td className="whitespace-nowrap py-1.5 pl-9 pr-2 text-slate-500">{formatDate(child.date)}</td>
                                                        <td className="whitespace-nowrap px-2 py-1.5 text-slate-500 italic max-w-xs truncate" title={child.particulars}>{child.particulars}</td>
                                                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-400">-</td>
                                                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-500">{(child.debit || 0).toLocaleString()}</td>
                                                        <td className="whitespace-nowrap py-1.5 pl-2 pr-1 text-right text-slate-400"></td>
                                                        <td className="py-1.5 pl-1 pr-2 w-8"></td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorLedger;
