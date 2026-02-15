
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, LoanSubtype } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar from './ReportToolbar';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import type { ReportDateRange } from './ReportToolbar';

interface LoanReportRow {
    contactId: string;
    contactName: string;
    totalReceived: number; // We borrowed / Money In
    totalGiven: number;    // We lent / Repaid / Money Out
    netBalance: number;    // Positive = We Owe, Negative = They Owe
}

const LoanAnalysisReport: React.FC = () => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();

    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    const [searchQuery, setSearchQuery] = useState('');

    const reportData = useMemo<LoanReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const contactMap: Record<string, LoanReportRow> = {};

        state.transactions.forEach(tx => {
            if (tx.type !== TransactionType.LOAN) return;

            const date = new Date(tx.date);
            if (date < start || date > end) return;

            const contactId = tx.contactId || 'unknown';
            if (!contactMap[contactId]) {
                const contact = state.contacts.find(c => c.id === contactId);
                contactMap[contactId] = {
                    contactId,
                    contactName: contact?.name || 'Unknown',
                    totalReceived: 0,
                    totalGiven: 0,
                    netBalance: 0
                };
            }

            if (tx.subtype === LoanSubtype.RECEIVE) {
                contactMap[contactId].totalReceived += tx.amount;
                contactMap[contactId].netBalance += tx.amount;
            } else {
                // GIVE (Lending or Repayment)
                contactMap[contactId].totalGiven += tx.amount;
                contactMap[contactId].netBalance -= tx.amount;
            }
        });

        let rows = Object.values(contactMap).filter(r =>
            r.totalReceived > 0 || r.totalGiven > 0 || Math.abs(r.netBalance) > 0
        );

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r => r.contactName.toLowerCase().includes(q));
        }

        return rows.sort((a, b) => b.netBalance - a.netBalance);
    }, [state.transactions, state.contacts, startDate, endDate, searchQuery]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            totalReceived: acc.totalReceived + curr.totalReceived,
            totalGiven: acc.totalGiven + curr.totalGiven,
            netPayable: acc.netPayable + (curr.netBalance > 0 ? curr.netBalance : 0),
            netReceivable: acc.netReceivable + (curr.netBalance < 0 ? Math.abs(curr.netBalance) : 0)
        }), { totalReceived: 0, totalGiven: 0, netPayable: 0, netReceivable: 0 });
    }, [reportData]);

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

    const handleExport = () => {
        const data = reportData.map(r => ({
            Contact: r.contactName,
            'Total Money In': r.totalReceived,
            'Total Money Out': r.totalGiven,
            'Net Balance': r.netBalance,
            'Status': r.netBalance > 0 ? 'You Owe' : (r.netBalance < 0 ? 'Owes You' : 'Settled')
        }));
        exportJsonToExcel(data, 'loan-analysis-report.xlsx', 'Loan Analysis');
    };


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
            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-6">Loan Analysis Report</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-center">
                            <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">Total Payable (You Owe)</p>
                            <p className="text-2xl font-bold text-rose-700">{CURRENCY} {totals.netPayable.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Receivable (Owes You)</p>
                            <p className="text-2xl font-bold text-emerald-700">{CURRENCY} {totals.netReceivable.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs">Contact</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Money In (Received)</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Money Out (Given)</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs">Net Balance</th>
                                    <th className="px-3 py-3 text-center font-semibold text-slate-600 uppercase tracking-wider text-xs">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {reportData.map(row => (
                                    <tr key={row.contactId} className="hover:bg-slate-50">
                                        <td className="px-3 py-3 font-medium text-slate-800">{row.contactName}</td>
                                        <td className="px-3 py-3 text-right text-slate-600">{CURRENCY} {row.totalReceived.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-right text-slate-600">{CURRENCY} {row.totalGiven.toLocaleString()}</td>
                                        <td className={`px-3 py-3 text-right font-bold ${row.netBalance > 0 ? 'text-rose-600' : row.netBalance < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {CURRENCY} {Math.abs(row.netBalance).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {row.netBalance > 0 && <span className="px-2 py-1 bg-rose-100 text-rose-800 rounded text-xs font-bold">You Owe</span>}
                                            {row.netBalance < 0 && <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-bold">Owes You</span>}
                                            {row.netBalance === 0 && <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">Settled</span>}
                                        </td>
                                    </tr>
                                ))}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No loan transactions found in this period.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold border-t border-slate-300">
                                <tr>
                                    <td className="px-3 py-3 text-right text-slate-700">Totals</td>
                                    <td className="px-3 py-3 text-right text-slate-700">{CURRENCY} {totals.totalReceived.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right text-slate-700">{CURRENCY} {totals.totalGiven.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right">
                                        <span className="text-rose-600 text-xs mr-1">Pay:</span>{CURRENCY} {totals.netPayable.toLocaleString()}
                                        <span className="mx-2 text-slate-300">|</span>
                                        <span className="text-emerald-600 text-xs mr-1">Rec:</span>{CURRENCY} {totals.netReceivable.toLocaleString()}
                                    </td>
                                    <td></td>
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

export default LoanAnalysisReport;
