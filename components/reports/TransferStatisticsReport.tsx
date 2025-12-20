
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';

interface AccountFlow {
    accountId: string;
    accountName: string;
    inflow: number;
    outflow: number;
    net: number;
}

interface TransferItem {
    id: string;
    date: string;
    fromAccountName: string;
    toAccountName: string;
    amount: number;
    description: string;
}

type SortKey = 'date' | 'fromAccountName' | 'toAccountName' | 'amount' | 'description';

const TransferStatisticsReport: React.FC = () => {
    const { state } = useAppContext();
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const handleRangeChange = (type: ReportDateRange) => {
        setDateRange(type);
        const now = new Date();
        if (type === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (type === 'thisMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (type === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
        }
    };

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        if (dateRange !== 'custom') setDateRange('custom');
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const transferData = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const transfers = state.transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return tx.type === TransactionType.TRANSFER && txDate >= start && txDate <= end;
        });

        const accountMap = new Map<string, AccountFlow>();
        let transferItems: TransferItem[] = [];

        // Initialize accounts map - Include Bank Accounts and user-created Asset accounts
        state.accounts.forEach(acc => {
            // Include permanent accounts that are BANK type (like System Cash) or any non-permanent account
            if (!acc.isPermanent || acc.type === AccountType.BANK) { 
                accountMap.set(acc.id, {
                    accountId: acc.id,
                    accountName: acc.name,
                    inflow: 0,
                    outflow: 0,
                    net: 0
                });
            }
        });

        transfers.forEach(tx => {
            const fromAcc = state.accounts.find(a => a.id === tx.fromAccountId);
            const toAcc = state.accounts.find(a => a.id === tx.toAccountId);

            // Update From Account (Outflow)
            if (tx.fromAccountId) {
                if (!accountMap.has(tx.fromAccountId)) {
                    accountMap.set(tx.fromAccountId, { accountId: tx.fromAccountId, accountName: fromAcc?.name || 'Unknown', inflow: 0, outflow: 0, net: 0 });
                }
                const fromData = accountMap.get(tx.fromAccountId)!;
                fromData.outflow += tx.amount;
                fromData.net -= tx.amount;
            }

            // Update To Account (Inflow)
            if (tx.toAccountId) {
                if (!accountMap.has(tx.toAccountId)) {
                    accountMap.set(tx.toAccountId, { accountId: tx.toAccountId, accountName: toAcc?.name || 'Unknown', inflow: 0, outflow: 0, net: 0 });
                }
                const toData = accountMap.get(tx.toAccountId)!;
                toData.inflow += tx.amount;
                toData.net += tx.amount;
            }

            transferItems.push({
                id: tx.id,
                date: tx.date,
                fromAccountName: fromAcc?.name || 'Unknown',
                toAccountName: toAcc?.name || 'Unknown',
                amount: tx.amount,
                description: tx.description || ''
            });
        });

        const accountFlows = Array.from(accountMap.values())
            .filter(f => f.inflow > 0 || f.outflow > 0)
            .sort((a, b) => a.accountName.localeCompare(b.accountName));

        const totalVolume = transfers.reduce((sum, tx) => sum + tx.amount, 0);
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            transferItems = transferItems.filter(t => 
                t.fromAccountName.toLowerCase().includes(q) ||
                t.toAccountName.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q)
            );
        }

        // Sorting logic
        transferItems.sort((a, b) => {
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

        return {
            accountFlows,
            transferItems,
            totalVolume,
            count: transfers.length
        };

    }, [state.transactions, state.accounts, startDate, endDate, searchQuery, sortConfig]);

    const handlePrint = () => window.print();

    const handleExport = () => {
        const logData = transferData.transferItems.map(t => ({
            'Date': formatDate(t.date),
            'From Account': t.fromAccountName,
            'To Account': t.toAccountName,
            'Amount': t.amount,
            'Description': t.description
        }));
        exportJsonToExcel(logData, `transfer-report-${startDate}-${endDate}.xlsx`, 'Transfers');
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <>
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 12.7mm;
                    }
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .printable-area, .printable-area * {
                        visibility: visible !important;
                    }
                    .printable-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background-color: white;
                        z-index: 9999;
                    }
                    .no-print {
                        display: none !important;
                    }
                    ::-webkit-scrollbar {
                        display: none;
                    }
                    table {
                        page-break-inside: auto;
                    }
                    tr {
                        page-break-inside: avoid;
                        page-break-after: auto;
                    }
                    thead {
                        display: table-header-group;
                    }
                    tfoot {
                        display: table-footer-group;
                    }
                }
            `}</style>
            <div className="flex flex-col h-full space-y-6">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onExport={handleExport}
                        onPrint={handlePrint}
                        hideGroup={true}
                        showDateFilterPills={true}
                        activeDateRange={dateRange}
                        onRangeChange={handleRangeChange}
                    />
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0">
                    <Card className="min-h-full flex flex-col">
                        <ReportHeader />
                        <div className="text-center mb-8 flex-shrink-0">
                            <h3 className="text-2xl font-bold text-slate-800">Transfer Statistics Report</h3>
                            <p className="text-sm text-slate-500">Period: {formatDate(startDate)} to {formatDate(endDate)}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8 text-center flex-shrink-0">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Volume Transferred</p>
                                <p className="text-3xl font-bold text-indigo-600 mt-2">{CURRENCY} {transferData.totalVolume.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Number of Transfers</p>
                                <p className="text-3xl font-bold text-slate-700 mt-2">{transferData.count}</p>
                            </div>
                        </div>

                        <div className="mb-8 flex-shrink-0">
                            <h4 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Account Flow Analysis</h4>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-semibold text-slate-600">Account</th>
                                            <th className="px-4 py-2 text-right font-semibold text-slate-600">Transferred In</th>
                                            <th className="px-4 py-2 text-right font-semibold text-slate-600">Transferred Out</th>
                                            <th className="px-4 py-2 text-right font-semibold text-slate-600">Net Flow</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {transferData.accountFlows.map(flow => (
                                            <tr key={flow.accountId}>
                                                <td className="px-4 py-2 font-medium text-slate-800 whitespace-normal break-words">{flow.accountName}</td>
                                                <td className="px-4 py-2 text-right text-emerald-600 font-semibold whitespace-nowrap">
                                                    {flow.inflow > 0 ? `+${CURRENCY} ${flow.inflow.toLocaleString()}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-rose-600 font-semibold whitespace-nowrap">
                                                    {flow.outflow > 0 ? `-${CURRENCY} ${flow.outflow.toLocaleString()}` : '-'}
                                                </td>
                                                <td className={`px-4 py-2 text-right font-bold whitespace-nowrap ${flow.net > 0 ? 'text-emerald-700' : flow.net < 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                                                    {flow.net > 0 ? '+' : ''}{CURRENCY} {flow.net.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex-grow overflow-hidden flex flex-col min-h-[300px]">
                            <h4 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2 flex-shrink-0">Transfer Log</h4>
                            <div className="overflow-auto border rounded-lg shadow-inner flex-grow relative">
                                <table className="min-w-full text-sm relative">
                                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th onClick={() => handleSort('date')} className="px-4 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                            <th onClick={() => handleSort('fromAccountName')} className="px-4 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">From <SortIcon column="fromAccountName"/></th>
                                            <th onClick={() => handleSort('toAccountName')} className="px-4 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">To <SortIcon column="toAccountName"/></th>
                                            <th onClick={() => handleSort('description')} className="px-4 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Description <SortIcon column="description"/></th>
                                            <th onClick={() => handleSort('amount')} className="px-4 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Amount <SortIcon column="amount"/></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {transferData.transferItems.map(item => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                                <td className="px-4 py-2 whitespace-normal break-words">{item.fromAccountName}</td>
                                                <td className="px-4 py-2 whitespace-normal break-words">{item.toAccountName}</td>
                                                <td className="px-4 py-2 text-slate-500 italic whitespace-normal break-words max-w-xs">{item.description || '-'}</td>
                                                <td className="px-4 py-2 text-right font-medium text-slate-800 whitespace-nowrap">{CURRENCY} {item.amount.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="flex-shrink-0 mt-auto">
                            <ReportFooter />
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
};

export default TransferStatisticsReport;
