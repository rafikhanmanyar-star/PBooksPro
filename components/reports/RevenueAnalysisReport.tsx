
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import Card from '../ui/Card';
import { formatDate } from '../../utils/dateUtils';
import { usePrint } from '../../hooks/usePrint';
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
    const { handlePrint } = usePrint();
    
    // Filter State
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
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
                    onDateChange={handleCustomDateChange}
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
            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-6">Revenue Analysis Report</h3>
                    <div className="text-center text-sm text-slate-500 mb-6">
                        {formatDate(startDate)} - {formatDate(endDate)}
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('agreementNumber')} className="px-2 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Agreement <SortIcon column="agreementNumber"/></th>
                                    <th onClick={() => handleSort('projectName')} className="px-2 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Project <SortIcon column="projectName"/></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-2 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Owner <SortIcon column="ownerName"/></th>
                                    <th onClick={() => handleSort('listPrice')} className="px-2 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">List Price <SortIcon column="listPrice"/></th>
                                    <th onClick={() => handleSort('customerDiscount')} className="px-2 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Cust Disc <SortIcon column="customerDiscount"/></th>
                                    <th onClick={() => handleSort('floorDiscount')} className="px-2 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Floor Disc <SortIcon column="floorDiscount"/></th>
                                    <th onClick={() => handleSort('lumpSumDiscount')} className="px-2 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">LumpSum <SortIcon column="lumpSumDiscount"/></th>
                                    <th onClick={() => handleSort('miscDiscount')} className="px-2 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Misc Disc <SortIcon column="miscDiscount"/></th>
                                    <th onClick={() => handleSort('sellingPrice')} className="px-2 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Net Sales <SortIcon column="sellingPrice"/></th>
                                    <th onClick={() => handleSort('brokerFee')} className="px-2 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Broker Fee <SortIcon column="brokerFee"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {reportData.map(row => (
                                    <tr key={row.agreementId} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-2 py-2 whitespace-nowrap text-slate-700 font-mono">{row.agreementNumber}</td>
                                        <td className="px-2 py-2 whitespace-normal break-words text-slate-800">{row.projectName}</td>
                                        <td className="px-2 py-2 whitespace-normal break-words text-slate-800">{row.ownerName}</td>
                                        <td className="px-2 py-2 text-right text-slate-600">{CURRENCY} {(row.listPrice || 0).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-rose-500">({CURRENCY} {(row.customerDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right text-rose-500">({CURRENCY} {(row.floorDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right text-rose-500">({CURRENCY} {(row.lumpSumDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right text-rose-500">({CURRENCY} {(row.miscDiscount || 0).toLocaleString()})</td>
                                        <td className="px-2 py-2 text-right font-medium text-slate-700">{CURRENCY} {(row.sellingPrice || 0).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-slate-500">{CURRENCY} {(row.brokerFee || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold sticky bottom-0 z-10 shadow-md">
                                <tr>
                                    <td colSpan={3} className="px-2 py-2 text-right">Totals</td>
                                    <td className="px-2 py-2 text-right">{CURRENCY} {(totals.listPrice || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right text-rose-600">({CURRENCY} {(totals.customerDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-rose-600">({CURRENCY} {(totals.floorDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-rose-600">({CURRENCY} {(totals.lumpSumDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-rose-600">({CURRENCY} {(totals.miscDiscount || 0).toLocaleString()})</td>
                                    <td className="px-2 py-2 text-right text-emerald-600">{CURRENCY} {(totals.sellingPrice || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right text-amber-600">{CURRENCY} {(totals.brokerFee || 0).toLocaleString()}</td>
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

export default RevenueAnalysisReport;