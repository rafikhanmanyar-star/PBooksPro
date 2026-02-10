
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService } from '../../services/whatsappService';
import { usePrintContext } from '../../context/PrintContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface ReportRow {
    id: string;
    date: string;
    brokerName: string;
    particulars: string;
    feeAmount: number;
    paidAmount: number;
    balance: number;
}

const BrokerFeeReport: React.FC = () => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const { print: triggerPrint } = usePrintContext();
    const { openChat } = useWhatsApp();
    
    const [dateRangeType, setDateRangeType] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    
    const [selectedBrokerId, setSelectedBrokerId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const handleRangeChange = (type: DateRangeOption) => {
        setDateRangeType(type);
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
        if (dateRangeType !== 'custom') setDateRangeType('custom');
    };

    // Include both BROKER and DEALER types for reporting
    const brokers = useMemo(() => state.contacts.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER), [state.contacts]);
    const brokerItems = useMemo(() => [{ id: 'all', name: 'All Brokers' }, ...brokers], [brokers]);

    const reportData = useMemo<ReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        if (!brokerFeeCategory) return [];

        const items: { date: string, brokerId: string, particulars: string, fee: number, paid: number }[] = [];

        // 1. Agreements (Fees Accrued)
        state.rentalAgreements.forEach(ra => {
            if (ra.brokerId && (ra.brokerFee || 0) > 0) {
                const date = new Date(ra.startDate);
                if (date >= start && date <= end) {
                    const property = state.properties.find(p => p.id === ra.propertyId);
                    const feeAmount = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee as any) : Number(ra.brokerFee);
                    items.push({
                        date: ra.startDate,
                        brokerId: ra.brokerId,
                        particulars: `Fee for ${property?.name || 'Unit'} (Agr #${ra.agreementNumber})`,
                        fee: isNaN(feeAmount) ? 0 : feeAmount,
                        paid: 0
                    });
                }
            }
        });

        // 2. Payments
        state.transactions.forEach(tx => {
            const date = new Date(tx.date);
            // Ensure it's not linked to a project (projectId) to count as Rental payment
            // Also allow transactions where contactId is a broker (even if they were deleted, we use ID to group)
            if (tx.type === TransactionType.EXPENSE && 
                tx.categoryId === brokerFeeCategory.id && 
                tx.contactId && 
                !tx.projectId &&
                date >= start && date <= end) {
                
                items.push({
                    date: tx.date,
                    brokerId: tx.contactId,
                    particulars: tx.description || 'Commission Payment',
                    fee: 0,
                    paid: tx.amount
                });
            }
        });

        // Sort
        items.sort((a, b) => {
            if (groupBy === 'broker') {
                const brokerA = brokers.find(br => br.id === a.brokerId)?.name || 'Unknown';
                const brokerB = brokers.find(br => br.id === b.brokerId)?.name || 'Unknown';
                if (brokerA < brokerB) return -1;
                if (brokerA > brokerB) return 1;
            }
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        // Calculate Balances
        let reportRows: ReportRow[] = [];
        const runningBalances: { [id: string]: number } = {};

        items.forEach((item, index) => {
            if (selectedBrokerId !== 'all' && item.brokerId !== selectedBrokerId) return;

            // Even if broker is deleted, we can still show the row, marking as Unknown
            const broker = state.contacts.find(c => c.id === item.brokerId);
            const brokerName = broker ? broker.name : 'Unknown/Deleted Broker';

            if (!runningBalances[item.brokerId]) runningBalances[item.brokerId] = 0;
            
            runningBalances[item.brokerId] += item.fee - item.paid;

            reportRows.push({
                id: `${item.brokerId}-${index}`,
                date: item.date,
                brokerName: brokerName,
                particulars: item.particulars,
                feeAmount: item.fee,
                paidAmount: item.paid,
                balance: runningBalances[item.brokerId]
            });
        });
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            reportRows = reportRows.filter(item => 
                item.brokerName.toLowerCase().includes(q) ||
                item.particulars.toLowerCase().includes(q)
            );
        }
        
        if (sortConfig) {
            reportRows.sort((a, b) => {
                let aVal: any = a[sortConfig.key as keyof ReportRow];
                let bVal: any = b[sortConfig.key as keyof ReportRow];
                
                if (typeof aVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }
                
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return reportRows;

    }, [state, startDate, endDate, selectedBrokerId, searchQuery, groupBy, brokers, sortConfig]);
    
    const handleSort = (key: keyof ReportRow) => {
        setSortConfig(current => ({
            key,
            direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.totalFees += item.feeAmount;
            acc.totalPaid += item.paidAmount;
            return acc;
        }, { totalFees: 0, totalPaid: 0 });
    }, [reportData]);


    const handleExport = () => {
        const data = reportData.map(item => ({
            'Date': formatDate(item.date),
            'Broker': item.brokerName,
            'Particulars': item.particulars,
            'Fee Accrued': item.feeAmount,
            'Amount Paid': item.paidAmount,
            'Balance': item.balance,
        }));
        exportJsonToExcel(data, `broker-fee-report.xlsx`, 'Broker Fees');
    };

    const handleWhatsApp = async () => {
        const selectedBroker = brokers.find(c => c.id === selectedBrokerId);
        if (selectedBrokerId === 'all' || !selectedBroker?.contactNo) {
            await showAlert("Please select a single broker with a contact number to send a report.");
            return;
        }

        try {
            const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;
            const totalBilled = reportData.reduce((sum, item) => sum + item.feeAmount, 0);
            const totalPaid = reportData.reduce((sum, item) => sum + item.paidAmount, 0);
            
            let message = `*Broker Statement for ${selectedBroker.name}*\n`;
            message += `Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n\n`;
            message += `Total Fees: ${CURRENCY} ${totalBilled.toLocaleString()}\n`;
            message += `Total Paid: ${CURRENCY} ${totalPaid.toLocaleString()}\n`;
            message += `--------------------\n`;
            message += `Balance Due: *${CURRENCY} ${finalBalance.toLocaleString()}*\n\n`;
            message += `This is an automated summary from PBooksPro.`;
        
            // Check if WhatsApp API is configured, if yes use chat window, otherwise use wa.me
            try {
                const { WhatsAppChatService } = await import('../../services/whatsappChatService');
                const isConfigured = await WhatsAppChatService.isConfigured();
                if (isConfigured) {
                    // Open chat window
                    openChat(selectedBroker);
                } else {
                    // Fallback to wa.me URL scheme
                    WhatsAppService.sendMessage({ contact: selectedBroker, message });
                }
            } catch (error) {
                // Fallback to wa.me URL scheme if API check fails
                WhatsAppService.sendMessage({ contact: selectedBroker, message });
            }
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };
    
    const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;

    const SortIcon = ({ column }: { column: keyof ReportRow }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig?.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <>
             <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
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
                                        dateRangeType === opt 
                                        ? 'bg-white text-accent shadow-sm font-bold' 
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                    }`}
                                >
                                    {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                                </button>
                            ))}
                        </div>

                        {/* Custom Date Pickers */}
                        {dateRangeType === 'custom' && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <DatePicker value={startDate} onChange={(d) => handleDateChange(d.toISOString().split('T')[0], endDate)} />
                                <span className="text-slate-400">-</span>
                                <DatePicker value={endDate} onChange={(d) => handleDateChange(startDate, d.toISOString().split('T')[0])} />
                            </div>
                        )}

                        {/* Broker Filter */}
                        <div className="w-48 flex-shrink-0">
                            <ComboBox 
                                items={brokerItems} 
                                selectedId={selectedBrokerId} 
                                onSelect={(item) => setSelectedBrokerId(item?.id || 'all')} 
                                allowAddNew={false}
                                placeholder="Filter Broker"
                            />
                        </div>

                        {/* Group By */}
                        <div className="w-40 flex-shrink-0">
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value)}
                                className="block w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                            >
                                <option value="">No Grouping</option>
                                <option value="broker">Group by Broker</option>
                            </select>
                        </div>

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
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={handleWhatsApp} 
                                disabled={!selectedBrokerId || selectedBrokerId === 'all'}
                                className="text-green-600 bg-green-50 hover:bg-green-100 border-green-200 whitespace-nowrap"
                            >
                                <div className="w-4 h-4 mr-1">{ICONS.whatsapp}</div> Share
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                                <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                            </Button>
                            <PrintButton
                                variant="secondary"
                                size="sm"
                                onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                                className="whitespace-nowrap"
                            />
                        </div>
                    </div>
                </div>
                </div>

                 <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full">
                        <ReportHeader />
                         <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Broker Fee Report</h3>
                            <p className="text-sm text-slate-500">From {formatDate(startDate)} to {formatDate(endDate)}</p>
                             <p className="text-sm text-slate-500 font-semibold">
                                Broker: {selectedBrokerId === 'all' ? 'All Brokers' : state.contacts.find(c => c.id === selectedBrokerId)?.name || 'Unknown'}
                            </p>
                        </div>

                         {reportData.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                            <th onClick={() => handleSort('brokerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Broker <SortIcon column="brokerName"/></th>
                                            <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                            <th onClick={() => handleSort('feeAmount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Fee Accrued <SortIcon column="feeAmount"/></th>
                                            <th onClick={() => handleSort('paidAmount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid <SortIcon column="paidAmount"/></th>
                                            <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {reportData.map(item => (
                                            <tr key={item.id}>
                                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words">{item.brokerName}</td>
                                                <td className="px-3 py-2 max-w-xs whitespace-normal break-words">{item.particulars}</td>
                                                <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.feeAmount > 0 ? `${CURRENCY} ${(item.feeAmount || 0).toLocaleString()}` : '-'}</td>
                                                <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{item.paidAmount > 0 ? `${CURRENCY} ${(item.paidAmount || 0).toLocaleString()}` : '-'}</td>
                                                <td className={`px-3 py-2 text-right font-bold text-slate-800 whitespace-nowrap`}>{CURRENCY} {(item.balance || 0).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.1)]">
                                        <tr>
                                            <td colSpan={3} className="px-3 py-2 text-right">Totals</td>
                                            <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {(totals.totalFees.toLocaleString())}</td>
                                            <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{CURRENCY} {(totals.totalPaid.toLocaleString())}</td>
                                            <td className={`px-3 py-2 text-right text-sm whitespace-nowrap`}>
                                                {selectedBrokerId !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                         ) : (
                             <div className="text-center py-16">
                                <p className="text-slate-500">No broker fee data found for the selected criteria.</p>
                            </div>
                        )}
                        <ReportFooter />
                    </Card>
                 </div>
            </div>
        </>
    );
};

export default BrokerFeeReport;
