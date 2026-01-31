
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface ReportRow {
    id: string;
    date: string;
    brokerName: string;
    projectName: string;
    particulars: string;
    accrued: number;
    paid: number;
    balance: number;
}

type SortKey = 'date' | 'brokerName' | 'projectName' | 'particulars' | 'accrued' | 'paid' | 'balance';

const ProjectBrokerReport: React.FC = () => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBrokerId, setSelectedBrokerId] = useState<string>('all');
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const brokers = useMemo(() => state.contacts.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER), [state.contacts]);
    const brokerItems = useMemo(() => [{ id: 'all', name: 'All Brokers' }, ...brokers], [brokers]);

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
        setDateRange('custom');
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const reportData = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const items: any[] = [];

        // 1. Accrued Fees (Rebates from Agreements)
        state.projectAgreements.forEach(pa => {
            if (pa.rebateBrokerId && (pa.rebateAmount || 0) > 0) {
                const date = new Date(pa.issueDate);
                if (date >= start && date <= end) {
                    if (selectedBrokerId !== 'all' && pa.rebateBrokerId !== selectedBrokerId) return;
                    
                    const broker = state.contacts.find(c => c.id === pa.rebateBrokerId);
                    const project = state.projects.find(p => p.id === pa.projectId);
                    
                    items.push({
                        id: `fee-${pa.id}`,
                        date: pa.issueDate,
                        brokerName: broker?.name || 'Unknown',
                        projectName: project?.name || 'Unknown',
                        particulars: `Commission for Agreement #${pa.agreementNumber}`,
                        accrued: pa.rebateAmount,
                        paid: 0
                    });
                }
            }
        });

        // 2. Payments (Rebate Amount / Broker Fee categories linked to Project)
        const feeCatId = state.categories.find(c => c.name === 'Broker Fee')?.id;
        const rebateCatId = state.categories.find(c => c.name === 'Rebate Amount')?.id;

        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.contactId && (tx.categoryId === feeCatId || tx.categoryId === rebateCatId)) {
                // Filter for Project Context: Must have projectId OR be specifically Rebate category
                if (!tx.projectId && tx.categoryId !== rebateCatId) return;

                const date = new Date(tx.date);
                if (date >= start && date <= end) {
                    if (selectedBrokerId !== 'all' && tx.contactId !== selectedBrokerId) return;

                    const broker = state.contacts.find(c => c.id === tx.contactId);
                    const project = state.projects.find(p => p.id === tx.projectId);

                    items.push({
                        id: `pay-${tx.id}`,
                        date: tx.date,
                        brokerName: broker?.name || 'Unknown',
                        projectName: project?.name || '-',
                        particulars: tx.description || 'Commission Payment',
                        accrued: 0,
                        paid: tx.amount
                    });
                }
            }
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
            runningBalance += item.accrued - item.paid;
            return { ...item, balance: runningBalance };
        });

    }, [state, startDate, endDate, selectedBrokerId, sortConfig]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            accrued: acc.accrued + curr.accrued,
            paid: acc.paid + curr.paid
        }), { accrued: 0, paid: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Broker: r.brokerName,
            Project: r.projectName,
            Particulars: r.particulars,
            Accrued: r.accrued,
            Paid: r.paid,
            Balance: r.balance
        }));
        exportJsonToExcel(data, 'project-broker-report.xlsx', 'Broker Fees');
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex-shrink-0">
                <ReportToolbar
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    onExport={handleExport}
                    onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                    hideGroup={true}
                    hideSearch={true}
                    showDateFilterPills={true}
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                >
                    <ComboBox label="Broker" items={brokerItems} selectedId={selectedBrokerId} onSelect={(item) => setSelectedBrokerId(item?.id || 'all')} allowAddNew={false} />
                </ReportToolbar>
            </div>
            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-6">Project Broker Commission Report</h3>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('brokerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Broker <SortIcon column="brokerName"/></th>
                                    <th onClick={() => handleSort('projectName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Project <SortIcon column="projectName"/></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('accrued')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Accrued <SortIcon column="accrued"/></th>
                                    <th onClick={() => handleSort('paid')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid <SortIcon column="paid"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(item => (
                                    <tr key={item.id}>
                                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words">{item.brokerName}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words">{item.projectName}</td>
                                        <td className="px-3 py-2 max-w-xs whitespace-normal break-words">{item.particulars}</td>
                                        <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.accrued > 0 ? `${CURRENCY} ${(item.accrued || 0).toLocaleString()}` : '-'}</td>
                                        <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{item.paid > 0 ? `${CURRENCY} ${(item.paid || 0).toLocaleString()}` : '-'}</td>
                                        <td className="px-3 py-2 text-right font-bold text-slate-800 whitespace-nowrap">{CURRENCY} {(item.balance || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.1)]">
                                <tr>
                                    <td colSpan={4} className="px-3 py-2 text-right bg-slate-50">Totals</td>
                                    <td className="px-3 py-2 text-right text-success bg-slate-50 whitespace-nowrap">{CURRENCY} {(totals.accrued || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-danger bg-slate-50 whitespace-nowrap">{CURRENCY} {(totals.paid || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 bg-slate-50"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default ProjectBrokerReport;
