
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PayslipStatus, TransactionType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface ReportRow {
    id: string;
    date: string;
    employeeName: string;
    particulars: string;
    salaryDue: number;
    amountPaid: number;
    balance: number;
}

interface EmployeePaymentReportProps {
    payrollType?: 'Rental' | 'Project';
}

type SortKey = 'date' | 'employeeName' | 'particulars' | 'salaryDue' | 'amountPaid' | 'balance';

const EmployeePaymentReport: React.FC<EmployeePaymentReportProps> = ({ payrollType }) => {
    const { state } = useAppContext();
    const { handlePrint } = usePrint();
    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const handleRangeChange = (option: DateRangeOption) => {
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

    const reportData = useMemo<ReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        let payslips = [...state.projectPayslips, ...state.rentalPayslips];
        
        // Filter by Type if provided
        if (payrollType === 'Rental') payslips = state.rentalPayslips;
        if (payrollType === 'Project') payslips = state.projectPayslips;

        const items: any[] = [];

        // 1. Payslips (Due)
        payslips.forEach(p => {
            const date = new Date(p.issueDate);
            if (date >= start && date <= end) {
                const staff = state.contacts.find(c => c.id === p.staffId);
                items.push({
                    id: `due-${p.id}`,
                    date: p.issueDate,
                    employeeName: staff?.name || 'Unknown',
                    particulars: `Salary Due for ${p.month}`,
                    due: p.netSalary,
                    paid: 0
                });
            }
        });

        // 2. Payments
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.payslipId) {
                // Check if this transaction belongs to a payslip in scope
                const relevantPayslip = payslips.find(p => p.id === tx.payslipId);
                if (relevantPayslip) {
                    const date = new Date(tx.date);
                    if (date >= start && date <= end) {
                        const staff = state.contacts.find(c => c.id === relevantPayslip.staffId);
                        items.push({
                            id: `pay-${tx.id}`,
                            date: tx.date,
                            employeeName: staff?.name || 'Unknown',
                            particulars: tx.description || 'Salary Payment',
                            due: 0,
                            paid: tx.amount
                        });
                    }
                }
            }
        });

        // Sort by SortConfig
        items.sort((a, b) => {
            let valA: any = a[sortConfig.key === 'salaryDue' ? 'due' : sortConfig.key === 'amountPaid' ? 'paid' : sortConfig.key];
            let valB: any = b[sortConfig.key === 'salaryDue' ? 'due' : sortConfig.key === 'amountPaid' ? 'paid' : sortConfig.key];
            
            // Map keys correctly if needed
            if(sortConfig.key === 'date') {
                valA = new Date(a.date).getTime();
                valB = new Date(b.date).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        let runningBalance = 0;
        let rows = items.map(item => {
            runningBalance += item.due - item.paid;
            return {
                id: item.id,
                date: item.date,
                employeeName: item.employeeName,
                particulars: item.particulars,
                salaryDue: item.due,
                amountPaid: item.paid,
                balance: runningBalance
            };
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r => r.employeeName.toLowerCase().includes(q) || r.particulars.toLowerCase().includes(q));
        }

        return rows;
    }, [state, startDate, endDate, searchQuery, payrollType, sortConfig]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            totalDue: acc.totalDue + curr.salaryDue,
            totalPaid: acc.totalPaid + curr.amountPaid
        }), { totalDue: 0, totalPaid: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Employee: r.employeeName,
            Particulars: r.particulars,
            'Salary Due': r.salaryDue,
            'Amount Paid': r.amountPaid,
            Balance: r.balance
        }));
        exportJsonToExcel(data, 'employee-payments-report.xlsx', 'Employee Payments');
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
            {/* Custom Toolbar - All controls in first row */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
                {/* First Row: Dates, Filters, and Actions */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range Pills */}
                    <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                    dateRange === opt 
                                    ? 'bg-white text-accent shadow-sm font-bold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                }`}
                            >
                                {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Pickers */}
                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                            <span className="text-slate-400">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
                        </div>
                    )}

                    {/* Search Input */}
                    <div className="relative flex-grow min-w-[180px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <span className="h-4 w-4">{ICONS.search}</span>
                        </div>
                        <Input 
                            placeholder="Search report..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-9 py-1.5 text-sm"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')} 
                                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    {/* Actions Group */}
                    <div className="flex items-center gap-2 ml-auto">
                        <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                            <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                        </Button>
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={handlePrint}
                            className="whitespace-nowrap"
                        />
                    </div>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-4">{payrollType ? `${payrollType} ` : ''}Employee Payments Report</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('employeeName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Employee <SortIcon column="employeeName"/></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('salaryDue')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Salary Due <SortIcon column="salaryDue"/></th>
                                    <th onClick={() => handleSort('amountPaid')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid <SortIcon column="amountPaid"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words">{item.employeeName}</td>
                                        <td className="px-3 py-2 max-w-xs whitespace-normal break-words" title={item.particulars}>{item.particulars}</td>
                                        <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{item.salaryDue > 0 ? `${CURRENCY} ${(item.salaryDue || 0).toLocaleString()}`: '-'}</td>
                                        <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.amountPaid > 0 ? `${CURRENCY} ${(item.amountPaid || 0).toLocaleString()}` : '-'}</td>
                                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-slate-800'}`}>{CURRENCY} {(item.balance || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold border-t border-slate-300 sticky bottom-0">
                                <tr>
                                    <td colSpan={3} className="px-3 py-2 text-right">Totals</td>
                                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{CURRENCY} {(totals.totalDue || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {(totals.totalPaid || 0).toLocaleString()}</td>
                                    <td className={`px-3 py-2 text-right whitespace-nowrap ${totals.totalDue - totals.totalPaid > 0 ? 'text-danger' : 'text-slate-800'}`}>{CURRENCY} {(totals.totalDue - totals.totalPaid).toLocaleString()}</td>
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

export default EmployeePaymentReport;
