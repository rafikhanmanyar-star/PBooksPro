
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface PMCostRow {
    projectId: string;
    projectName: string;
    month: string;
    totalExpense: number;
    excludedCosts: number;
    netCostBase: number;
    accruedFee: number;
    paidFee: number;
    balance: number;
}

type SortKey = 'month' | 'projectName' | 'totalExpense' | 'excludedCosts' | 'netCostBase' | 'accruedFee' | 'paidFee' | 'balance';

const ProjectPMCostReport: React.FC = () => {
    const { state } = useAppContext();
    const { handlePrint } = usePrint();
    
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'month', direction: 'desc' });

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

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

    const reportData = useMemo<PMCostRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const pmPercentage = state.pmCostPercentage || 0;
        const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        
        const discountCategoryIds = state.categories
            .filter(c => ['Customer Discount', 'Floor Discount', 'Lump Sum Discount', 'Misc Discount'].includes(c.name))
            .map(c => c.id);

        // Exclusions: PM Costs themselves, Commissions, Rebates, Payouts, Discounts
        const excludedCategoryIds = new Set([
            pmCostCategory?.id,
            brokerFeeCategory?.id,
            rebateCategory?.id,
            ownerPayoutCategory?.id,
            ...discountCategoryIds
        ].filter(Boolean) as string[]);

        // Rental Categories for exclusion
        const rentalCats = new Set(state.categories.filter(c => c.isRental).map(c => c.id));

        const monthlyProjectData: Record<string, { 
            [projectId: string]: { expense: number, excluded: number, paid: number } 
        }> = {};

        state.transactions.forEach(tx => {
            if (tx.type !== TransactionType.EXPENSE || !tx.projectId) return;
            
            // Filter by Project
            if (selectedProjectId !== 'all' && tx.projectId !== selectedProjectId) return;

            // Explicitly Filter out Rental Categories (shouldn't be here, but safety check)
            if (tx.categoryId && rentalCats.has(tx.categoryId)) return;

            // Filter by Date
            const date = new Date(tx.date);
            if (date < start || date > end) return;
            
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyProjectData[monthKey]) monthlyProjectData[monthKey] = {};
            if (!monthlyProjectData[monthKey][tx.projectId]) monthlyProjectData[monthKey][tx.projectId] = { expense: 0, excluded: 0, paid: 0 };

            const data = monthlyProjectData[monthKey][tx.projectId];

            if (tx.categoryId === pmCostCategory?.id) {
                data.paid += tx.amount;
            } else {
                data.expense += tx.amount;
                if (tx.categoryId && excludedCategoryIds.has(tx.categoryId)) {
                    data.excluded += tx.amount;
                }
            }
        });

        let rows: PMCostRow[] = [];
        
        Object.entries(monthlyProjectData).forEach(([month, projects]) => {
            Object.entries(projects).forEach(([projectId, data]) => {
                const project = state.projects.find(p => p.id === projectId);
                const netBase = data.expense - data.excluded;
                const accrued = netBase * (pmPercentage / 100);
                
                rows.push({
                    projectId,
                    projectName: project?.name || 'Unknown',
                    month,
                    totalExpense: data.expense,
                    excludedCosts: data.excluded,
                    netCostBase: netBase,
                    accruedFee: accrued,
                    paidFee: data.paid,
                    balance: accrued - data.paid
                });
            });
        });

        // Sorting
        rows.sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return rows;

    }, [state, startDate, endDate, selectedProjectId, sortConfig]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            totalExpense: acc.totalExpense + curr.totalExpense,
            excludedCosts: acc.excludedCosts + curr.excludedCosts,
            netCostBase: acc.netCostBase + curr.netCostBase,
            accruedFee: acc.accruedFee + curr.accruedFee,
            paidFee: acc.paidFee + curr.paidFee,
            balance: acc.balance + curr.balance
        }), { totalExpense: 0, excludedCosts: 0, netCostBase: 0, accruedFee: 0, paidFee: 0, balance: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Month: r.month,
            Project: r.projectName,
            'Total Expense': r.totalExpense,
            'Excluded Costs': r.excludedCosts,
            'Net Cost Base': r.netCostBase,
            'Accrued Fee': r.accruedFee,
            'Paid Fee': r.paidFee,
            'Balance': r.balance
        }));
        exportJsonToExcel(data, `pm-cost-report-${startDate}-to-${endDate}.xlsx`, 'PM Costs');
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
                    onPrint={handlePrint}
                    hideGroup={true}
                    showDateFilterPills={true}
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                    hideSearch={true}
                >
                    <div className="w-full sm:w-48">
                        <label className="block text-sm font-medium text-slate-600 mb-1">Project</label>
                        <ComboBox 
                            label={undefined}
                            items={projectItems} 
                            selectedId={selectedProjectId} 
                            onSelect={(item) => setSelectedProjectId(item?.id || 'all')} 
                            allowAddNew={false} 
                        />
                    </div>
                </ReportToolbar>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Project Management Cost Report</h3>
                        <p className="text-sm text-slate-500">
                            {selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            Period: {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                             PM Fee Rate: {state.pmCostPercentage}%
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('month')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Month <SortIcon column="month"/></th>
                                    <th onClick={() => handleSort('projectName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Project <SortIcon column="projectName"/></th>
                                    <th onClick={() => handleSort('totalExpense')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Total Exp <SortIcon column="totalExpense"/></th>
                                    <th onClick={() => handleSort('excludedCosts')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Excluded <SortIcon column="excludedCosts"/></th>
                                    <th onClick={() => handleSort('netCostBase')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Net Base <SortIcon column="netCostBase"/></th>
                                    <th onClick={() => handleSort('accruedFee')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Accrued Fee <SortIcon column="accruedFee"/></th>
                                    <th onClick={() => handleSort('paidFee')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid <SortIcon column="paidFee"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map((row, idx) => (
                                    <tr key={`${row.projectId}-${row.month}`} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{row.month}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words font-medium text-slate-800">{row.projectName}</td>
                                        <td className="px-3 py-2 text-right text-slate-600">{CURRENCY} {(row.totalExpense || 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right text-slate-500">({CURRENCY} {(row.excludedCosts || 0).toLocaleString()})</td>
                                        <td className="px-3 py-2 text-right font-medium text-slate-700">{CURRENCY} {(row.netCostBase || 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right text-indigo-600">{CURRENCY} {(row.accruedFee || 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right text-emerald-600">{CURRENCY} {(row.paidFee || 0).toLocaleString()}</td>
                                        <td className={`px-3 py-2 text-right font-bold ${(row.balance || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                            {CURRENCY} {(row.balance || 0).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-3 py-8 text-center text-slate-500">No data found for the selected criteria.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold sticky bottom-0 border-t border-slate-300">
                                <tr>
                                    <td colSpan={2} className="px-3 py-2 text-right">Totals</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{CURRENCY} {(totals.totalExpense || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-slate-500">({CURRENCY} {(totals.excludedCosts || 0).toLocaleString()})</td>
                                    <td className="px-3 py-2 text-right text-slate-700">{CURRENCY} {(totals.netCostBase || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-indigo-600">{CURRENCY} {(totals.accruedFee || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-emerald-600">{CURRENCY} {(totals.paidFee || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-rose-600">{CURRENCY} {(totals.balance || 0).toLocaleString()}</td>
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

export default ProjectPMCostReport;
