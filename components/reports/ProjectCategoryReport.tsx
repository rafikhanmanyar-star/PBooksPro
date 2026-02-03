
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY, ICONS } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ProjectTransactionModal from '../dashboard/ProjectTransactionModal';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface CategorySummary {
    categoryId: string;
    categoryName: string;
    count: number;
    amount: number;
    percentage: number;
    level: number;
    hasChildren: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF19AF', '#82ca9d', '#ffc658', '#a4de6c', '#d0ed57'];

const tooltipFormatter = (value: number) => `${CURRENCY} ${value.toLocaleString()}`;

// Memoized Chart to prevent re-render loops
const CategoryPieChart = React.memo(({ data, title }: { data: any[], title: string }) => {
    return (
        <div className="flex flex-col w-full bg-white p-4 rounded-lg border border-slate-200 shadow-sm h-full">
            <h4 className="text-lg font-semibold text-center mb-4 text-slate-700">{title}</h4>
            <div className="w-full h-[300px] relative">
                {data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                fill="#8884d8"
                                paddingAngle={5}
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
                        <p className="text-slate-500">No data available.</p>
                    </div>
                )}
            </div>
        </div>
    );
});

interface ProjectCategoryReportProps {
    type: TransactionType.INCOME | TransactionType.EXPENSE;
}

type SortKey = 'categoryName' | 'count' | 'amount' | 'percentage';

const ProjectCategoryReport: React.FC<ProjectCategoryReportProps> = ({ type }) => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
    
    const [drilldownData, setDrilldownData] = useState<{
        isOpen: boolean;
        categoryId: string;
        categoryName: string;
    } | null>(null);
    
    // Sorting State (Default to amount desc)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'amount', direction: 'desc' });

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

    const reportData = useMemo<{ rows: CategorySummary[], totalAmount: number }>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const categoryMap: { [id: string]: { amount: number; count: number } } = {};
        let totalAmount = 0;

        // Optimization: Pre-calculate set of rental category IDs
        const rentalCategoryIds = new Set(state.categories.filter(c => c.isRental).map(c => c.id));

        // 1. Sum Transactions
        state.transactions.forEach(tx => {
            let projectId = tx.projectId;
            let categoryId = tx.categoryId;

            // Resolve details from linked Bill if missing
            if (tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) {
                    if (!projectId) projectId = bill.projectId;
                    
                    // Filter by project before processing
                    if (!projectId) return;
                    if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;
                    
                    // Handle expenseCategoryItems: if bill has multiple categories, distribute transaction amount proportionally
                    if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                        const totalBillAmount = bill.expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
                        if (totalBillAmount > 0) {
                            // Distribute transaction amount across categories proportionally
                            bill.expenseCategoryItems.forEach(item => {
                                if (!item.categoryId) return;
                                const proportion = (item.netValue || 0) / totalBillAmount;
                                const allocatedAmount = tx.amount * proportion;
                                
                                // Process each category separately
                                const itemCategoryId = item.categoryId;
                                if (rentalCategoryIds.has(itemCategoryId)) return;
                                
                                const date = new Date(tx.date);
                                if (date < start || date > end) return;
                                
                                if (tx.type === type) {
                                    const catId = itemCategoryId || 'uncategorized';
                                    if (!categoryMap[catId]) categoryMap[catId] = { amount: 0, count: 0 };
                                    categoryMap[catId].amount += allocatedAmount;
                                    categoryMap[catId].count += 1;
                                    totalAmount += allocatedAmount;
                                }
                            });
                            return; // Skip the single category processing below
                        }
                    } else if (!categoryId) {
                        categoryId = bill.categoryId;
                    }
                }
            }
            
            // Resolve details from linked Invoice if missing
            if (tx.invoiceId) {
                 const inv = state.invoices.find(i => i.id === tx.invoiceId);
                 if (inv) {
                     if (!projectId) projectId = inv.projectId;
                     if (!categoryId) categoryId = inv.categoryId;
                 }
            }

            // Strictly exclude non-project transactions
            if (!projectId) return;

            if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;
            if (tx.type !== type) return;
            
            // Exclude Rental Categories
            if (categoryId && rentalCategoryIds.has(categoryId)) return;

            const date = new Date(tx.date);
            if (date < start || date > end) return;

            const catId = categoryId || 'uncategorized';
            if (!categoryMap[catId]) categoryMap[catId] = { amount: 0, count: 0 };
            
            categoryMap[catId].amount += tx.amount;
            categoryMap[catId].count += 1;
            totalAmount += tx.amount;
        });

        // 2. Build Hierarchy - Exclude rental categories from structure
        const relevantCategories = state.categories.filter(c => c.type === type && !c.isRental);
        let rows: CategorySummary[] = [];

        const getCategoryTotal = (catId: string): { amount: number, count: number } => {
            let data = categoryMap[catId] || { amount: 0, count: 0 };
            const children = relevantCategories.filter(c => c.parentCategoryId === catId);
            
            let childSum = 0;
            let childCount = 0;
            
            children.forEach(child => {
                const childData = getCategoryTotal(child.id);
                childSum += childData.amount;
                childCount += childData.count;
            });

            return { amount: data.amount + childSum, count: data.count + childCount };
        };

        const processCategory = (cat: any, level: number) => {
            const { amount, count } = getCategoryTotal(cat.id);
            if (amount === 0 && count === 0) return;

            const children = relevantCategories.filter(c => c.parentCategoryId === cat.id);
            
            rows.push({
                categoryId: cat.id,
                categoryName: cat.name,
                amount,
                count,
                percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
                level,
                hasChildren: children.length > 0
            });

            children.sort((a, b) => a.name.localeCompare(b.name))
                    .forEach(child => processCategory(child, level + 1));
        };

        const rootCategories = relevantCategories
            .filter(c => !c.parentCategoryId)
            .sort((a, b) => a.name.localeCompare(b.name));

        rootCategories.forEach(cat => processCategory(cat, 0));
        
        // Handle Uncategorized
        if (categoryMap['uncategorized'] && categoryMap['uncategorized'].amount > 0) {
            rows.push({
                categoryId: 'uncategorized',
                categoryName: 'Uncategorized',
                amount: categoryMap['uncategorized'].amount,
                count: categoryMap['uncategorized'].count,
                percentage: totalAmount > 0 ? (categoryMap['uncategorized'].amount / totalAmount) * 100 : 0,
                level: 0,
                hasChildren: false
            });
        }

        // Apply Sorting (Note: Hierarchical sorting is tricky, here we flatten sort which might break tree visuals but respects sort request)
        // If sorting by name, maintain hierarchy (default above). If sorting by values, it flattens.
        if (sortConfig.key !== 'categoryName') {
             rows.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return { rows, totalAmount };

    }, [state.transactions, type, selectedProjectId, startDate, endDate, state.categories, state.bills, sortConfig]);

    const chartData = useMemo(() => {
        // Use only top-level items for chart to avoid double counting, or just use flat list if hierarchy is broken
        return reportData.rows.filter(r => r.level === 0 || sortConfig.key !== 'categoryName').map(item => ({ name: item.categoryName, value: item.amount }));
    }, [reportData, sortConfig]);

    const handleExport = () => {
        const data = reportData.rows.map(item => ({
            Category: '  '.repeat(item.level) + item.categoryName,
            Transactions: item.count,
            Amount: item.amount,
            'Percentage': `${item.percentage.toFixed(1)}%`
        }));
        exportJsonToExcel(data, `project-${type.toLowerCase()}-category-report.xlsx`, `${type}`);
    };

    const handleRowClick = (item: CategorySummary) => {
        setDrilldownData({
            isOpen: true,
            categoryId: item.categoryId,
            categoryName: item.categoryName
        });
    };

    const closeDrilldown = () => setDrilldownData(null);

    const projectLabel = selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name;

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <>
             <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        onExport={handleExport}
                        onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                        hideGroup={true}
                        showDateFilterPills={true}
                        activeDateRange={dateRange}
                        onRangeChange={handleRangeChange}
                        hideSearch={true}
                    >
                        <ComboBox 
                            label="Filter by Project" 
                            items={projectItems} 
                            selectedId={selectedProjectId} 
                            onSelect={(item) => setSelectedProjectId(item?.id || 'all')} 
                            allowAddNew={false} 
                        />
                    </ReportToolbar>
                </div>
                
                <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full flex flex-col">
                         <ReportHeader />
                         <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Project {type} Report</h3>
                            <p className="text-sm text-slate-500 font-semibold">{projectLabel}</p>
                            <p className="text-sm text-slate-500">
                                From {formatDate(startDate)} to {formatDate(endDate)}
                            </p>
                        </div>
                        
                        {reportData.rows.length > 0 ? (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-2 overflow-x-auto">
                                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                                <tr>
                                                    <th onClick={() => handleSort('categoryName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Category <SortIcon column="categoryName"/></th>
                                                    <th onClick={() => handleSort('count')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Count <SortIcon column="count"/></th>
                                                    <th onClick={() => handleSort('amount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Amount <SortIcon column="amount"/></th>
                                                    <th onClick={() => handleSort('percentage')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">% <SortIcon column="percentage"/></th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-slate-200">
                                                {reportData.rows.map((item, index) => (
                                                    <tr key={item.categoryId} onClick={() => handleRowClick(item)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                                                        <td className="px-3 py-2 text-slate-800">
                                                            {/* Show hierarchy indent only if sorting is default/by name, otherwise flat list is expected visually */}
                                                            <div style={{ paddingLeft: sortConfig.key === 'categoryName' ? `${item.level * 1.5}rem` : '0' }} className="flex items-center gap-2">
                                                                {item.level > 0 && sortConfig.key === 'categoryName' && <span className="text-slate-300">└</span>}
                                                                <span className={item.hasChildren ? 'font-semibold' : ''}>{item.categoryName}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-slate-600">{item.count}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-slate-800">{CURRENCY} {item.amount.toLocaleString()}</td>
                                                        <td className="px-3 py-2 text-right text-slate-500">{item.percentage.toFixed(1)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-slate-50 font-bold sticky bottom-0 z-10 shadow-md">
                                                <tr>
                                                    <td className="px-3 py-2 text-left">Total</td>
                                                    <td className="px-3 py-2 text-right">{reportData.rows.reduce((acc, i) => i.level === 0 ? acc + i.count : acc, 0)}</td>
                                                    <td className="px-3 py-2 text-right">{CURRENCY} {reportData.totalAmount.toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right">100.0%</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <div className="lg:col-span-1">
                                        <CategoryPieChart data={chartData} title={`${type} Distribution`} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="mx-auto h-16 w-16 text-slate-400">{ICONS.barChart}</div>
                                <h3 className="mt-2 text-lg font-semibold text-slate-800">No Data Found</h3>
                                <p className="mt-1 text-sm text-slate-500">No transactions found for the selected criteria.</p>
                            </div>
                        )}
                        <div className="mt-auto">
                            <ReportFooter />
                        </div>
                    </Card>
                </div>
            </div>

            <ProjectTransactionModal
                isOpen={!!drilldownData?.isOpen}
                onClose={closeDrilldown}
                data={drilldownData ? {
                    projectId: selectedProjectId,
                    projectName: projectLabel || 'All Projects',
                    categoryId: drilldownData.categoryId,
                    categoryName: drilldownData.categoryName,
                    type: type,
                    startDate: startDate,
                    endDate: endDate
                } : null}
            />
        </>
    );
};

export default ProjectCategoryReport;
