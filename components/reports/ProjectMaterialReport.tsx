
import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo } from 'react';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY, ICONS } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { endOfMonthYyyyMmDd, formatDate, startOfMonthYyyyMmDd } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface MaterialSummary {
    categoryId: string;
    categoryName: string;
    unit: string;
    totalQuantity: number;
    totalAmount: number;
    billCount: number;
}

type SortKey = 'categoryName' | 'totalQuantity' | 'totalAmount' | 'billCount';

const ProjectMaterialReport: React.FC = () => {
    const state = useProjectReportAppState();
    const { print: triggerPrint } = usePrintContext();
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(() => startOfMonthYyyyMmDd());
    const [endDate, setEndDate] = useState(() => endOfMonthYyyyMmDd());
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
    
    // Sorting State (Default to categoryName asc)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'categoryName', direction: 'asc' });

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const handleRangeChange = (option: ReportDateRange) => {
        setDateRange(option);
        const now = new Date();
        if (option === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(startOfMonthYyyyMmDd(now));
            setEndDate(endOfMonthYyyyMmDd(now));
        } else if (option === 'lastMonth') {
            const anchor = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            setStartDate(startOfMonthYyyyMmDd(anchor));
            setEndDate(endOfMonthYyyyMmDd(anchor));
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

    const reportData = useMemo<{ rows: MaterialSummary[], totalQuantity: number, totalAmount: number }>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const materialMap: { [key: string]: { categoryId: string; categoryName: string; unit: string; totalQuantity: number; totalAmount: number; billIds: Set<string> } } = {};

        // Process project bills
        state.bills.forEach(bill => {
            // Filter by project
            if (selectedProjectId !== 'all' && bill.projectId !== selectedProjectId) return;
            if (!bill.projectId) return; // Only process project bills

            // Filter by date range
            const billDate = new Date(bill.issueDate);
            if (billDate < start || billDate > end) return;

            // Process expenseCategoryItems
            if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                bill.expenseCategoryItems.forEach(item => {
                    if (!item.categoryId) return;
                    
                    const category = state.categories.find(c => c.id === item.categoryId);
                    if (!category) return;

                    // Only process expense categories (materials)
                    if (category.type !== TransactionType.EXPENSE) return;

                    const key = `${item.categoryId}-${item.unit || 'quantity'}`;
                    const quantity = item.quantity || 0;
                    const netValue = item.netValue || 0;

                    if (!materialMap[key]) {
                        materialMap[key] = {
                            categoryId: item.categoryId,
                            categoryName: category.name,
                            unit: item.unit || 'quantity',
                            totalQuantity: 0,
                            totalAmount: 0,
                            billIds: new Set()
                        };
                    }

                    materialMap[key].totalQuantity += quantity;
                    materialMap[key].totalAmount += netValue;
                    materialMap[key].billIds.add(bill.id);
                });
            }
        });

        // Convert to array
        const rows: MaterialSummary[] = Object.values(materialMap).map(item => ({
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            unit: item.unit,
            totalQuantity: item.totalQuantity,
            totalAmount: item.totalAmount,
            billCount: item.billIds.size
        }));

        // Sort
        rows.sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        const totalQuantity = rows.reduce((sum, row) => sum + row.totalQuantity, 0);
        const totalAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);

        return { rows, totalQuantity, totalAmount };
    }, [state.bills, state.categories, selectedProjectId, startDate, endDate, sortConfig]);

    const handleExport = () => {
        const data = reportData.rows.map(item => ({
            'Material Category': item.categoryName,
            'Unit': item.unit,
            'Total Quantity': item.totalQuantity,
            'Total Amount': item.totalAmount,
            'Number of Bills': item.billCount
        }));
        exportJsonToExcel(data, `project-material-report.xlsx`, 'Material Report');
    };

    const projectLabel = selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name;

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-app-muted">
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
                
                <div className="flex-grow overflow-y-auto min-h-0 bg-app-bg" id="printable-area">
                    <Card className="min-h-full flex flex-col">
                        <ReportHeader />
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold text-app-text">Material Report</h3>
                            <p className="text-sm text-app-muted font-semibold">{projectLabel}</p>
                            <p className="text-sm text-app-muted">
                                From {formatDate(startDate)} to {formatDate(endDate)}
                            </p>
                        </div>
                        
                        {reportData.rows.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-app-border text-sm">
                                    <thead className="bg-app-table-header sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th onClick={() => handleSort('categoryName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-table-hover select-none">Material Category <SortIcon column="categoryName"/></th>
                                            <th onClick={() => handleSort('totalQuantity')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-table-hover select-none">Quantity <SortIcon column="totalQuantity"/></th>
                                            <th className="px-3 py-2 text-left font-semibold text-app-muted">Unit</th>
                                            <th onClick={() => handleSort('totalAmount')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-table-hover select-none">Total Amount <SortIcon column="totalAmount"/></th>
                                            <th onClick={() => handleSort('billCount')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-table-hover select-none">Bills <SortIcon column="billCount"/></th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-app-card divide-y divide-app-border">
                                        {reportData.rows.map((item) => (
                                            <tr key={`${item.categoryId}-${item.unit}`} className="hover:bg-app-table-hover transition-colors">
                                                <td className="px-3 py-2 text-app-text font-medium">{item.categoryName}</td>
                                                <td className="px-3 py-2 text-right text-app-text">{(item.totalQuantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                                                <td className="px-3 py-2 text-app-muted">{item.unit}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-app-text">{CURRENCY} {(item.totalAmount || 0).toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right text-app-muted">{item.billCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-app-table-header font-bold sticky bottom-0 z-10 shadow-md">
                                        <tr>
                                            <td className="px-3 py-2 text-left text-app-text">Total</td>
                                            <td className="px-3 py-2 text-right text-app-text">{(reportData.totalQuantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                                            <td className="px-3 py-2 text-left text-app-muted">-</td>
                                            <td className="px-3 py-2 text-right text-app-text">{CURRENCY} {(reportData.totalAmount || 0).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-app-text">{reportData.rows.reduce((sum, row) => sum + (row.billCount || 0), 0)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="mx-auto h-16 w-16 text-app-muted">{ICONS.barChart}</div>
                                <h3 className="mt-2 text-lg font-semibold text-app-text">No Data Found</h3>
                                <p className="mt-1 text-sm text-app-muted">No material purchases found for the selected criteria.</p>
                            </div>
                        )}
                        <div className="mt-auto">
                            <ReportFooter />
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
};

export default ProjectMaterialReport;

