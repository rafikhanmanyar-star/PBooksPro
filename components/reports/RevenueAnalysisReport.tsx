
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import Card from '../ui/Card';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface RevenueRow {
    agreementId: string;
    agreementNumber: string;
    projectName: string;
    ownerName: string;
    listPrice: number;
    customerDiscount: number;
    floorDiscount: number;
    lumpSumDiscount: number;
    miscDiscount: number;
    sellingPrice: number;
    brokerFee: number;
}

type SortKey = 'agreementNumber' | 'projectName' | 'ownerName' | 'listPrice' | 'customerDiscount' | 'floorDiscount' | 'lumpSumDiscount' | 'miscDiscount' | 'sellingPrice' | 'brokerFee';

const RevenueAnalysisReport: React.FC = () => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();
    
    // Filter State
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(toLocalDateString(new Date(new Date().getFullYear(), 0, 1)));
    const [endDate, setEndDate] = useState(toLocalDateString(new Date()));
    const [searchQuery, setSearchQuery] = useState('');
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'agreementNumber', direction: 'asc' });

    const handleRangeChange = (option: ReportDateRange) => {
        setDateRange(option);
        const now = new Date();
        
        if (option === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (option === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)));
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

    const reportData = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        let rows: RevenueRow[] = [];

        state.projectAgreements.forEach(pa => {
            const date = new Date(pa.issueDate);
            if (date >= start && date <= end && pa.status !== 'Cancelled') {
                const project = state.projects.find(p => p.id === pa.projectId);
                const owner = state.contacts.find(c => c.id === pa.clientId);
                
                rows.push({
                    agreementId: pa.id,
                    agreementNumber: pa.agreementNumber,
                    projectName: project?.name || 'Unknown',
                    ownerName: owner?.name || 'Unknown',
                    listPrice: pa.listPrice,
                    customerDiscount: pa.customerDiscount,
                    floorDiscount: pa.floorDiscount,
                    lumpSumDiscount: pa.lumpSumDiscount,
                    miscDiscount: pa.miscDiscount,
                    sellingPrice: pa.sellingPrice,
                    brokerFee: pa.rebateAmount || 0 // Assuming rebate is broker fee here
                });
            }
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r => 
                r.projectName.toLowerCase().includes(q) ||
                r.ownerName.toLowerCase().includes(q) ||
                r.agreementNumber.toLowerCase().includes(q)
            );
        }

        // Sort
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
    }, [state, startDate, endDate, searchQuery, sortConfig]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            listPrice: acc.listPrice + curr.listPrice,
            customerDiscount: acc.customerDiscount + curr.customerDiscount,
            floorDiscount: acc.floorDiscount + curr.floorDiscount,
            lumpSumDiscount: acc.lumpSumDiscount + curr.lumpSumDiscount,
            miscDiscount: acc.miscDiscount + curr.miscDiscount,
            sellingPrice: acc.sellingPrice + curr.sellingPrice,
            brokerFee: acc.brokerFee + curr.brokerFee,
            totalDiscount: acc.totalDiscount + (curr.listPrice - curr.sellingPrice)
        }), {
            listPrice: 0, customerDiscount: 0, floorDiscount: 0, lumpSumDiscount: 0, miscDiscount: 0, sellingPrice: 0, brokerFee: 0, totalDiscount: 0
        });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            'Agreement': r.agreementNumber,
            'Project': r.projectName,
            'Owner': r.ownerName,
            'List Price': r.listPrice,
            'Cust Disc': r.customerDiscount,
            'Floor Disc': r.floorDiscount,
            'LumpSum Disc': r.lumpSumDiscount,
            'Misc Disc': r.miscDiscount,
            'Selling Price': r.sellingPrice,
            'Broker Fee': r.brokerFee
        }));
        exportJsonToExcel(data, 'revenue-analysis.xlsx', 'Revenue');
    };

    
    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-app-muted">
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
                    onDateChange={handleCustomDateChange}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onExport={handleExport}
                    onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                    hideGroup={true}
                    showDateFilterPills={true}
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                />
            </div>
            <div className="flex-grow overflow-y-auto printable-area min-h-0 bg-background" id="printable-area">
                <Card className="min-h-full flex flex-col p-4 md:p-6">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-2 text-app-text">Revenue Analysis Report</h3>
                    <div className="text-center text-sm text-app-muted mb-6">
                        {formatDate(startDate)} - {formatDate(endDate)}
                    </div>
                    
                    <div className="overflow-x-auto border border-app-border rounded-lg shadow-ds-card">
                        <table className="min-w-full divide-y divide-app-border text-sm">
                            <thead className="bg-app-table-header border-b border-app-border sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('agreementNumber')} className="px-2 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Agreement <SortIcon column="agreementNumber"/></th>
                                    <th onClick={() => handleSort('projectName')} className="px-2 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Project <SortIcon column="projectName"/></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-2 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Owner <SortIcon column="ownerName"/></th>
                                    <th onClick={() => handleSort('listPrice')} className="px-2 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">List Price <SortIcon column="listPrice"/></th>
                                    <th onClick={() => handleSort('customerDiscount')} className="px-2 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Cust Disc <SortIcon column="customerDiscount"/></th>
                                    <th onClick={() => handleSort('floorDiscount')} className="px-2 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Floor Disc <SortIcon column="floorDiscount"/></th>
                                    <th onClick={() => handleSort('lumpSumDiscount')} className="px-2 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">LumpSum <SortIcon column="lumpSumDiscount"/></th>
                                    <th onClick={() => handleSort('miscDiscount')} className="px-2 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Misc Disc <SortIcon column="miscDiscount"/></th>
                                    <th onClick={() => handleSort('sellingPrice')} className="px-2 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Net Sales <SortIcon column="sellingPrice"/></th>
                                    <th onClick={() => handleSort('brokerFee')} className="px-2 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Broker Fee <SortIcon column="brokerFee"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                                {reportData.map(row => (
                                    <tr key={row.agreementId} className="hover:bg-app-toolbar/60 transition-colors">
                                        <td className="px-2 py-2 whitespace-nowrap text-app-text font-mono">{row.agreementNumber}</td>
                                        <td className="px-2 py-2 whitespace-normal break-words text-app-text">{row.projectName}</td>
                                        <td className="px-2 py-2 whitespace-normal break-words text-app-text">{row.ownerName}</td>
                                        <td className="px-2 py-2 text-right text-app-muted tabular-nums">{CURRENCY} {(row.listPrice || 0).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(row.customerDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(row.floorDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(row.lumpSumDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(row.miscDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right font-medium text-app-text tabular-nums">{CURRENCY} {(row.sellingPrice || 0).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-app-muted tabular-nums">{CURRENCY} {(row.brokerFee || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-app-toolbar border-t border-app-border font-bold sticky bottom-0 z-10 shadow-ds-card">
                                <tr>
                                    <td colSpan={3} className="px-2 py-2 text-right text-app-text">Totals</td>
                                    <td className="px-2 py-2 text-right text-app-text tabular-nums">{CURRENCY} {(totals.listPrice || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(totals.customerDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(totals.floorDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(totals.lumpSumDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-ds-danger tabular-nums">({CURRENCY} {(totals.miscDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-ds-success tabular-nums">{CURRENCY} {(totals.sellingPrice || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right text-ds-warning tabular-nums">{CURRENCY} {(totals.brokerFee || 0).toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div className="mt-auto pt-4">
                        <ReportFooter />
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default RevenueAnalysisReport;