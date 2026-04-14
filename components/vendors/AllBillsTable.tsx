import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { List } from 'react-window';
import { useAppContext } from '../../context/AppContext';
import { Bill, InvoiceStatus } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { useDebounce } from '../../hooks/useDebounce';

interface AllBillsTableProps {
    onEditBill?: (bill: Bill) => void;
}

type SortKey = 'issueDate' | 'billNumber' | 'vendorName' | 'amount' | 'paidAmount' | 'balance' | 'status' | 'description';

const ROW_H = 52;
const VIRTUALIZE_MIN = 45;

const BillRow = memo(function BillRow({
    bill,
    vendorName,
    onEditBill,
}: {
    bill: Bill;
    vendorName: string;
    onEditBill?: (bill: Bill) => void;
}) {
    const balance = bill.amount - (bill.paidAmount || 0);
    return (
        <tr
            onClick={() => onEditBill?.(bill)}
            className="hover:bg-slate-50 cursor-pointer transition-colors group"
        >
            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{formatDate(bill.issueDate)}</td>
            <td className="px-4 py-3 text-sm font-medium text-slate-800 group-hover:text-accent">{bill.billNumber}</td>
            <td className="px-4 py-3 text-sm font-medium text-slate-800 group-hover:text-accent">{vendorName}</td>
            <td className="px-4 py-3 text-sm max-w-xs truncate text-slate-500 italic">{bill.description || '-'}</td>
            <td className="px-4 py-3 text-sm text-right font-medium tabular-nums">{CURRENCY} {bill.amount.toLocaleString()}</td>
            <td className="px-4 py-3 text-sm text-right text-emerald-600 tabular-nums">{CURRENCY} {(bill.paidAmount || 0).toLocaleString()}</td>
            <td className={`px-4 py-3 text-sm text-right font-bold tabular-nums ${balance > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {CURRENCY} {balance.toLocaleString()}
            </td>
            <td className="px-4 py-3 text-center">
                <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold inline-block w-24 text-center ${
                        bill.status === InvoiceStatus.PAID
                            ? 'bg-emerald-100 text-emerald-800'
                            : bill.status === InvoiceStatus.PARTIALLY_PAID
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                    }`}
                >
                    {bill.status}
                </span>
            </td>
        </tr>
    );
});

const VirtualBillRow = memo(function VirtualBillRow({
    index,
    style,
    filteredBills,
    vendorById,
    onEditBill,
}: {
    index: number;
    style: React.CSSProperties;
    filteredBills: Bill[];
    vendorById: Map<string, { name?: string } | undefined>;
    onEditBill?: (bill: Bill) => void;
}) {
    const bill = filteredBills[index];
    if (!bill) return null;
    const vendor = bill.vendorId ? vendorById.get(bill.vendorId) : undefined;
    const vendorName = vendor?.name || 'Unknown';
    const balance = bill.amount - (bill.paidAmount || 0);
    return (
        <div
            style={style}
            className="grid grid-cols-[88px_100px_minmax(96px,140px)_minmax(120px,1fr)_88px_88px_88px_100px] gap-0 items-center border-b border-slate-100 bg-white hover:bg-slate-50 cursor-pointer text-sm"
            onClick={() => onEditBill?.(bill)}
        >
            <div className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(bill.issueDate)}</div>
            <div className="px-3 py-2 font-medium text-slate-800 truncate">{bill.billNumber}</div>
            <div className="px-3 py-2 font-medium text-slate-800 truncate">{vendorName}</div>
            <div className="px-3 py-2 text-slate-500 italic truncate">{bill.description || '-'}</div>
            <div className="px-3 py-2 text-right tabular-nums">{CURRENCY} {bill.amount.toLocaleString()}</div>
            <div className="px-3 py-2 text-right text-emerald-600 tabular-nums">{CURRENCY} {(bill.paidAmount || 0).toLocaleString()}</div>
            <div className={`px-3 py-2 text-right font-bold tabular-nums ${balance > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {CURRENCY} {balance.toLocaleString()}
            </div>
            <div className="px-3 py-2 text-center">
                <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold inline-block w-20 ${
                        bill.status === InvoiceStatus.PAID
                            ? 'bg-emerald-100 text-emerald-800'
                            : bill.status === InvoiceStatus.PARTIALLY_PAID
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                    }`}
                >
                    {bill.status}
                </span>
            </div>
        </div>
    );
});

const AllBillsTable: React.FC<AllBillsTableProps> = ({ onEditBill }) => {
    const { state } = useAppContext();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'issueDate',
        direction: 'desc',
    });

    const vendorById = useMemo(() => {
        const m = new Map<string, (typeof state.vendors)[0]>();
        for (const v of state.vendors ?? []) {
            if (v?.id) m.set(v.id, v);
        }
        return m;
    }, [state.vendors]);

    const bills = useMemo(() => {
        return state.bills.filter((b) => {
            const vendorId = b.vendorId;
            if (!vendorId) return false;
            return vendorById.has(vendorId);
        });
    }, [state.bills, vendorById]);

    const filteredBills = useMemo(() => {
        let result = bills;
        if (statusFilter !== 'All') {
            result = result.filter((b) => b.status === statusFilter);
        }
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter((b) => {
                const vendor = b.vendorId ? vendorById.get(b.vendorId) : undefined;
                return (
                    b.billNumber.toLowerCase().includes(q) ||
                    (b.description && b.description.toLowerCase().includes(q)) ||
                    (vendor && vendor.name.toLowerCase().includes(q))
                );
            });
        }

        return [...result].sort((a, b) => {
            let aVal: string | number;
            let bVal: string | number;

            switch (sortConfig.key) {
                case 'issueDate':
                    aVal = new Date(a.issueDate).getTime();
                    bVal = new Date(b.issueDate).getTime();
                    break;
                case 'billNumber':
                    aVal = a.billNumber.toLowerCase();
                    bVal = b.billNumber.toLowerCase();
                    break;
                case 'vendorName': {
                    const vendorA = a.vendorId ? vendorById.get(a.vendorId) : undefined;
                    const vendorB = b.vendorId ? vendorById.get(b.vendorId) : undefined;
                    aVal = vendorA?.name?.toLowerCase() || '';
                    bVal = vendorB?.name?.toLowerCase() || '';
                    break;
                }
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
    }, [bills, debouncedSearch, statusFilter, sortConfig, vendorById]);

    const handleSort = useCallback((key: SortKey) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    }, []);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const [listHeight, setListHeight] = useState(480);
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            const h = el.getBoundingClientRect().height;
            setListHeight(Math.max(320, h));
        });
        ro.observe(el);
        setListHeight(Math.max(320, el.getBoundingClientRect().height));
        return () => ro.disconnect();
    }, []);

    const virtualRowProps = useMemo(
        () => ({
            filteredBills,
            vendorById,
            onEditBill,
        }),
        [filteredBills, vendorById, onEditBill]
    );

    const useVirtual = filteredBills.length >= VIRTUALIZE_MIN;

    return (
        <div className="space-y-4 h-full flex flex-col min-h-0">
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                <div className="flex-grow relative">
                    <Input
                        id="bill-search"
                        name="bill-search"
                        placeholder="Search bills by vendor, number or description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 py-2 text-sm"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <div className="w-4 h-4">{ICONS.search}</div>
                    </div>
                </div>
                <div className="w-full sm:w-48">
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="py-2 text-sm">
                        <option value="All">All Status</option>
                        <option value={InvoiceStatus.UNPAID}>Unpaid</option>
                        <option value={InvoiceStatus.PARTIALLY_PAID}>Partially Paid</option>
                        <option value={InvoiceStatus.PAID}>Paid</option>
                        <option value={InvoiceStatus.OVERDUE}>Overdue</option>
                    </Select>
                </div>
            </div>

            <div ref={containerRef} className="overflow-auto border rounded-lg flex-grow bg-white shadow-sm min-h-[400px] flex flex-col">
                {!useVirtual ? (
                    <table className="min-w-full divide-y divide-slate-200 text-sm relative">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th
                                    onClick={() => handleSort('issueDate')}
                                    className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                >
                                    Date <SortIcon column="issueDate" />
                                </th>
                                <th
                                    onClick={() => handleSort('billNumber')}
                                    className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                >
                                    Bill # <SortIcon column="billNumber" />
                                </th>
                                <th
                                    onClick={() => handleSort('vendorName')}
                                    className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                >
                                    Vendor <SortIcon column="vendorName" />
                                </th>
                                <th
                                    onClick={() => handleSort('description')}
                                    className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none"
                                >
                                    Description <SortIcon column="description" />
                                </th>
                                <th
                                    onClick={() => handleSort('amount')}
                                    className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                >
                                    Amount <SortIcon column="amount" />
                                </th>
                                <th
                                    onClick={() => handleSort('paidAmount')}
                                    className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                >
                                    Paid <SortIcon column="paidAmount" />
                                </th>
                                <th
                                    onClick={() => handleSort('balance')}
                                    className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                >
                                    Balance <SortIcon column="balance" />
                                </th>
                                <th
                                    onClick={() => handleSort('status')}
                                    className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                                >
                                    Status <SortIcon column="status" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {filteredBills.length > 0 ? (
                                filteredBills.map((bill) => {
                                    const vendor = bill.vendorId ? vendorById.get(bill.vendorId) : undefined;
                                    return (
                                        <BillRow
                                            key={bill.id}
                                            bill={bill}
                                            vendorName={vendor?.name || 'Unknown'}
                                            onEditBill={onEditBill}
                                        />
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                        No bills found matching your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex flex-col min-h-0 flex-1">
                        <div className="grid grid-cols-[88px_100px_minmax(96px,140px)_minmax(120px,1fr)_88px_88px_88px_100px] gap-0 bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-xs font-semibold text-slate-600 px-0 py-2 shrink-0">
                            <button type="button" onClick={() => handleSort('issueDate')} className="text-left px-3">
                                Date <SortIcon column="issueDate" />
                            </button>
                            <button type="button" onClick={() => handleSort('billNumber')} className="text-left px-3">
                                Bill # <SortIcon column="billNumber" />
                            </button>
                            <button type="button" onClick={() => handleSort('vendorName')} className="text-left px-3">
                                Vendor <SortIcon column="vendorName" />
                            </button>
                            <button type="button" onClick={() => handleSort('description')} className="text-left px-3">
                                Desc <SortIcon column="description" />
                            </button>
                            <button type="button" onClick={() => handleSort('amount')} className="text-right px-3">
                                Amt <SortIcon column="amount" />
                            </button>
                            <button type="button" onClick={() => handleSort('paidAmount')} className="text-right px-3">
                                Paid <SortIcon column="paidAmount" />
                            </button>
                            <button type="button" onClick={() => handleSort('balance')} className="text-right px-3">
                                Bal <SortIcon column="balance" />
                            </button>
                            <button type="button" onClick={() => handleSort('status')} className="text-center px-3">
                                St <SortIcon column="status" />
                            </button>
                        </div>
                        {filteredBills.length === 0 ? (
                            <div className="py-12 text-center text-slate-500">No bills found matching your filters.</div>
                        ) : (
                            <List
                                defaultHeight={listHeight - 40}
                                rowCount={filteredBills.length}
                                rowHeight={ROW_H}
                                rowComponent={VirtualBillRow}
                                rowProps={virtualRowProps}
                                className="scrollbar-thin"
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(AllBillsTable);
