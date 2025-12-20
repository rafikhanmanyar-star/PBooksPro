
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Project, InvoiceStatus, InvoiceType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY, ICONS } from '../../constants';
import ProjectCategoryDetailModal from './ProjectCategoryDetailModal';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import DatePicker from '../ui/DatePicker';

interface ProjectSummary {
    projectId: string;
    projectName: string;
    income: number;
    expense: number;
    net: number;
    receivable: number;
    expectedRevenue: number;
}

type SortKey = 'projectName' | 'income' | 'expense' | 'net' | 'receivable' | 'expectedRevenue';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF19AF', '#82ca9d', '#ffc658'];

const tooltipFormatter = (value: number) => `${CURRENCY} ${(value || 0).toLocaleString()}`;

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent * 100 < 5) return null;

    return (
        <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

// Memoized Chart Component to prevent re-render loops
const ProjectPieChart = React.memo(({ data, title }: { data: any[], title: string }) => {
    return (
        <div className="flex flex-col h-full min-h-[300px]">
            <h4 className="text-lg font-semibold text-center mb-2">{title}</h4>
            <div className="flex-grow w-full relative">
                {data.length > 0 ? (
                    <ResponsiveContainer width="99%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={renderCustomizedLabel}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                isAnimationActive={false} 
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={tooltipFormatter} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-slate-500">No {title.toLowerCase()} recorded.</p>
                    </div>
                )}
            </div>
        </div>
    );
});

const ProjectSummaryReport: React.FC = () => {
    const { state } = useAppContext();
    
    // Filters
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    
    const [detailModalData, setDetailModalData] = useState<{
        isOpen: boolean;
        project: Project | null;
        startDate: Date;
        endDate: Date;
    }>({ isOpen: false, project: null, startDate: new Date(), endDate: new Date() });
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'net', direction: 'desc' });

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const handleRangeChange = (option: ReportDateRange) => {
        setDateRange(option);
        const now = new Date();
        
        if (option === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (option === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
        }
    };

    const handleCustomDateChange = (start: string, end: string) => {
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

    const reportData = useMemo<ProjectSummary[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const transactionsInDateRange = state.transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= start && txDate <= end;
        });

        const projectSummaries: { [projectId: string]: { income: number, expense: number, receivable: number, expected: number } } = {};

        const projectsToReport = selectedProjectId === 'all' 
            ? state.projects 
            : state.projects.filter(p => p.id === selectedProjectId);

        projectsToReport.forEach(p => {
            projectSummaries[p.id] = { income: 0, expense: 0, receivable: 0, expected: 0 };
        });

        // Rental Categories set for exclusion
        const rentalCats = new Set(state.categories.filter(c => c.isRental).map(c => c.id));

        // 1. Actual Income/Expense
        transactionsInDateRange.forEach(tx => {
            let projectId = tx.projectId;
            
            // Resolve from linked items if missing on transaction
            if (!projectId && tx.invoiceId) {
                 const inv = state.invoices.find(i => i.id === tx.invoiceId);
                 if (inv) projectId = inv.projectId;
            }
            if (!projectId && tx.billId) {
                 const bill = state.bills.find(b => b.id === tx.billId);
                 if (bill) projectId = bill.projectId;
            }

            // Exclude Rental Category Transactions
            if (tx.categoryId && rentalCats.has(tx.categoryId)) return;

            // Filter by selected project
            if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;

            if (projectId && projectSummaries[projectId]) {
                if (tx.type === TransactionType.INCOME) {
                    projectSummaries[projectId].income += tx.amount;
                } else if (tx.type === TransactionType.EXPENSE) {
                    projectSummaries[projectId].expense += tx.amount;
                }
            }
        });

        // 2. Receivables and Expectations (Total)
        state.invoices.forEach(inv => {
            if (selectedProjectId !== 'all' && inv.projectId !== selectedProjectId) return;

            // Ensure we only count Project Invoices (Installments)
            if (inv.projectId && inv.invoiceType === InvoiceType.INSTALLMENT) {
                if (projectSummaries[inv.projectId]) {
                    if (inv.status !== InvoiceStatus.PAID) {
                        projectSummaries[inv.projectId].receivable += (inv.amount - inv.paidAmount);
                    }
                }
            }
        });

        state.projectAgreements.forEach(pa => {
            if (selectedProjectId !== 'all' && pa.projectId !== selectedProjectId) return;

            if (pa.projectId && pa.status === 'Active') {
                if (projectSummaries[pa.projectId]) {
                    projectSummaries[pa.projectId].expected += pa.sellingPrice;
                }
            }
        });

        const rows = Object.entries(projectSummaries)
            .map(([projectId, summary]) => {
                const project = state.projects.find(p => p.id === projectId);
                return {
                    projectId,
                    projectName: project?.name || 'Unassigned',
                    income: summary.income,
                    expense: summary.expense,
                    net: summary.income - summary.expense,
                    receivable: summary.receivable,
                    expectedRevenue: summary.expected
                };
            })
            .filter(summary => summary.income > 0 || summary.expense > 0 || summary.receivable > 0);
            
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

    }, [state.transactions, state.projects, state.invoices, state.projectAgreements, startDate, endDate, selectedProjectId, state.categories, state.bills, sortConfig]);
    
    const handleProjectClick = (projectId: string) => {
        const project = state.projects.find(p => p.id === projectId);
        if(project) {
            setDetailModalData({ isOpen: true, project, startDate: new Date(startDate), endDate: new Date(endDate) });
        }
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.totalIncome += item.income;
            acc.totalExpense += item.expense;
            acc.totalNet += item.net;
            acc.totalReceivable += item.receivable;
            acc.totalExpected += item.expectedRevenue;
            return acc;
        }, { totalIncome: 0, totalExpense: 0, totalNet: 0, totalReceivable: 0, totalExpected: 0 });
    }, [reportData]);

    const incomeChartData = useMemo(() => {
        return reportData
            .filter(p => p.income > 0)
            .map(p => ({ name: p.projectName, value: p.income }));
    }, [reportData]);

    const expenseChartData = useMemo(() => {
        return reportData
            .filter(p => p.expense > 0)
            .map(p => ({ name: p.projectName, value: p.expense }));
    }, [reportData]);

    const handlePrint = () => window.print();

    const handleExport = () => {
        const dataToExport = reportData.map(item => ({
            'Project': item.projectName,
            'Total Income': item.income,
            'Total Expense': item.expense,
            'Net Profit/Loss': item.net,
            'Receivable': item.receivable,
            'Expected Revenue (Agreements)': item.expectedRevenue
        }));
        exportJsonToExcel(dataToExport, `project-summary-report.xlsx`, 'Summary');
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
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleCustomDateChange}
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
                
                <div className="flex-grow overflow-y-auto printable-area min-h-0">
                    <Card className="min-h-full flex flex-col">
                         <ReportHeader />
                         <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Project Financial Report</h3>
                            <p className="text-sm text-slate-500">
                                {selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p=>p.id === selectedProjectId)?.name}
                            </p>
                            <p className="text-sm text-slate-500">
                                From {formatDate(startDate)} to {formatDate(endDate)}
                            </p>
                        </div>
                        
                        {reportData.length > 0 ? (
                            <div className="space-y-8 flex-grow">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th onClick={() => handleSort('projectName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Project <SortIcon column="projectName"/></th>
                                                <th onClick={() => handleSort('income')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Total Income <SortIcon column="income"/></th>
                                                <th onClick={() => handleSort('expense')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Total Expense <SortIcon column="expense"/></th>
                                                <th onClick={() => handleSort('net')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Net Profit/Loss <SortIcon column="net"/></th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-200">
                                            {reportData.map(item => (
                                                <tr key={item.projectId} onClick={() => handleProjectClick(item.projectId)} className="cursor-pointer hover:bg-slate-50">
                                                    <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{item.projectName}</td>
                                                    <td className="px-3 py-2 text-right text-success">{CURRENCY} {item.income.toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right text-danger">{CURRENCY} {item.expense.toLocaleString()}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${item.net >= 0 ? 'text-slate-800' : 'text-danger'}`}>{CURRENCY} {item.net.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-bold border-t border-slate-300">
                                            <tr>
                                                <td className="px-3 py-2 text-right">Totals</td>
                                                <td className="px-3 py-2 text-right text-success">{CURRENCY} {totals.totalIncome.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right text-danger">{CURRENCY} {totals.totalExpense.toLocaleString()}</td>
                                                <td className={`px-3 py-2 text-right ${totals.totalNet >= 0 ? 'text-slate-800' : 'text-danger'}`}>{CURRENCY} {totals.totalNet.toLocaleString()}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6 border-t print:break-inside-avoid">
                                    <ProjectPieChart data={incomeChartData} title="Income by Project" />
                                    <ProjectPieChart data={expenseChartData} title="Expense by Project" />
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16 flex-grow">
                                <div className="mx-auto h-16 w-16 text-slate-400">{ICONS.archive}</div>
                                <h3 className="mt-2 text-lg font-semibold text-slate-800">No Project Data</h3>
                                <p className="mt-1 text-sm text-slate-500">No project transactions were found for the selected period.</p>
                            </div>
                        )}
                        <div className="flex-shrink-0 mt-auto">
                            <ReportFooter />
                        </div>
                    </Card>
                </div>
            </div>

            <ProjectCategoryDetailModal 
                isOpen={detailModalData.isOpen}
                onClose={() => setDetailModalData({ ...detailModalData, isOpen: false, project: null })}
                project={detailModalData.project}
                startDate={detailModalData.startDate}
                endDate={detailModalData.endDate}
            />
        </>
    );
};

export default ProjectSummaryReport;
