
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Project } from '../../types';
import Card from '../ui/Card';
import { CURRENCY, ICONS } from '../../constants';
import MonthNavigator from '../transactions/MonthNavigator';
import DatePicker from '../ui/DatePicker';
import ProjectCategoryDetailModal from './ProjectCategoryDetailModal';
import Button from '../ui/Button';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import PrintButton from '../ui/PrintButton';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface ProjectSummary {
    projectId: string;
    projectName: string;
    income: number;
    expense: number;
    net: number;
}

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
            <div className="w-full h-[250px] relative">
                {data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
    const { handlePrint } = usePrint();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'range'>('month');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [endDate, setEndDate] = useState(new Date());
    
    const [detailModalData, setDetailModalData] = useState<{
        isOpen: boolean;
        project: Project | null;
        startDate: Date;
        endDate: Date;
    }>({ isOpen: false, project: null, startDate: new Date(), endDate: new Date() });


    const effectiveStartDate = useMemo(() => {
        if (viewMode === 'month') {
            return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        }
        return startDate;
    }, [viewMode, currentDate, startDate]);

    const effectiveEndDate = useMemo(() => {
        if (viewMode === 'month') {
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            lastDay.setHours(23, 59, 59, 999);
            return lastDay;
        }
        const newEndDate = new Date(endDate);
        newEndDate.setHours(23, 59, 59, 999);
        return newEndDate;
    }, [viewMode, currentDate, endDate]);

    const reportData = useMemo<ProjectSummary[]>(() => {
        const start = effectiveStartDate;
        start.setHours(0, 0, 0, 0);
        const end = effectiveEndDate;

        const transactionsInDateRange = state.transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= start && txDate <= end;
        });

        const projectSummaries: { [projectId: string]: { income: number, expense: number } } = {};

        state.projects.forEach(p => {
            projectSummaries[p.id] = { income: 0, expense: 0 };
        });

        transactionsInDateRange.forEach(tx => {
            if (tx.projectId) {
                if (!projectSummaries[tx.projectId]) {
                    projectSummaries[tx.projectId] = { income: 0, expense: 0 };
                }
                if (tx.type === TransactionType.INCOME) {
                    projectSummaries[tx.projectId].income += tx.amount;
                } else if (tx.type === TransactionType.EXPENSE) {
                    projectSummaries[tx.projectId].expense += tx.amount;
                }
            }
        });

        return Object.entries(projectSummaries)
            .map(([projectId, summary]) => {
                const project = state.projects.find(p => p.id === projectId);
                return {
                    projectId,
                    projectName: project?.name || 'Unassigned',
                    income: summary.income,
                    expense: summary.expense,
                    net: summary.income - summary.expense,
                };
            })
            .filter(summary => summary.income > 0 || summary.expense > 0)
            .sort((a, b) => (b.income + b.expense) - (a.income + a.expense));

    }, [state.transactions, state.projects, effectiveStartDate, effectiveEndDate]);
    
    const handleProjectClick = (projectId: string) => {
        const project = state.projects.find(p => p.id === projectId);
        if(project) {
            setDetailModalData({ isOpen: true, project, startDate: effectiveStartDate, endDate: effectiveEndDate });
        }
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.totalIncome += item.income;
            acc.totalExpense += item.expense;
            acc.totalNet += item.net;
            return acc;
        }, { totalIncome: 0, totalExpense: 0, totalNet: 0 });
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


    const handleExport = () => {
        const dataToExport = reportData.map(item => ({
            'Project': item.projectName,
            'Total Income': item.income,
            'Total Expense': item.expense,
            'Net Profit/Loss': item.net,
        }));
        exportJsonToExcel(dataToExport, `project-summary-report.xlsx`, 'Summary');
    };

    return (
        <>
             <style>{STANDARD_PRINT_STYLES}</style>
            <div className="space-y-4">
                <Card className="no-print">
                     <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex bg-slate-200 p-1 rounded-lg">
                            <button onClick={() => setViewMode('month')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${viewMode === 'month' ? 'bg-white shadow-sm text-accent' : 'text-slate-600'}`}>Monthly</button>
                            <button onClick={() => setViewMode('range')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${viewMode === 'range' ? 'bg-white shadow-sm text-accent' : 'text-slate-600'}`}>Date Range</button>
                        </div>

                        {viewMode === 'month' ? (
                            <MonthNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                               <DatePicker label="Start Date" value={startDate.toISOString().split('T')[0]} onChange={setStartDate} />
                               <DatePicker label="End Date" value={endDate.toISOString().split('T')[0]} onChange={setEndDate} />
                            </div>
                        )}
                        <div className="flex gap-2">
                             <Button onClick={handleExport} variant="secondary">Export</Button>
                             <PrintButton onPrint={handlePrint} />
                        </div>
                    </div>
                </Card>
                
                <div className="printable-area" id="printable-area">
                    <Card>
                         <ReportHeader />
                         <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Project Financial Report</h3>
                            <p className="text-sm text-slate-500">
                                From {effectiveStartDate.toLocaleDateString()} to {effectiveEndDate.toLocaleDateString()}
                            </p>
                        </div>
                        
                        {reportData.length > 0 ? (
                            <div className="space-y-8">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Project</th>
                                                <th className="px-3 py-2 text-right font-semibold text-slate-600">Total Income</th>
                                                <th className="px-3 py-2 text-right font-semibold text-slate-600">Total Expense</th>
                                                <th className="px-3 py-2 text-right font-semibold text-slate-600">Net Profit/Loss</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-200">
                                            {reportData.map(item => (
                                                <tr key={item.projectId} onClick={() => handleProjectClick(item.projectId)} className="cursor-pointer hover:bg-slate-50">
                                                    <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{item.projectName}</td>
                                                    <td className="px-3 py-2 text-right text-success">{CURRENCY} {(item.income || 0).toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right text-danger">{CURRENCY} {(item.expense || 0).toLocaleString()}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${(item.net || 0) >= 0 ? 'text-slate-800' : 'text-danger'}`}>{CURRENCY} {(item.net || 0).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-bold">
                                            <tr>
                                                <td className="px-3 py-2 text-right">Totals</td>
                                                <td className="px-3 py-2 text-right text-success">{CURRENCY} {(totals.totalIncome || 0).toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right text-danger">{CURRENCY} {(totals.totalExpense || 0).toLocaleString()}</td>
                                                <td className={`px-3 py-2 text-right ${(totals.totalNet || 0) >= 0 ? 'text-slate-800' : 'text-danger'}`}>{CURRENCY} {(totals.totalNet || 0).toLocaleString()}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6 border-t">
                                    <ProjectPieChart data={incomeChartData} title="Income by Project" />
                                    <ProjectPieChart data={expenseChartData} title="Expense by Project" />
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="mx-auto h-16 w-16 text-slate-400">{ICONS.archive}</div>
                                <h3 className="mt-2 text-lg font-semibold text-slate-800">No Project Data</h3>
                                <p className="mt-1 text-sm text-slate-500">No project transactions were found for the selected period.</p>
                            </div>
                        )}
                        <ReportFooter />
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
