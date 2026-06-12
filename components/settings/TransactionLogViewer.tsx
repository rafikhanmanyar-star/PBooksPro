
import { useDispatchOnly, useTransactionLog, useCurrentUser } from '../../hooks/useSelectiveState';
import React, { useState, useMemo } from 'react';
import { TransactionLogEntry, Transaction } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS } from '../../constants';
import {
    endOfMonthYyyyMmDd,
    formatDate,
    fromPickerDateToYyyyMmDd,
    startOfMonthYyyyMmDd,
    todayLocalYyyyMmDd } from '../../utils/dateUtils';
import DatePicker from '../ui/DatePicker';
import { exportJsonToExcel } from '../../services/exportService';
import { useNotification } from '../../context/NotificationContext';
import { usePrintReport } from '../../hooks/usePrintReport';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';

interface TransactionLogViewerProps {
    isOpen: boolean;
    onClose: () => void;
}

type DateRangeType = 'today' | 'thisMonth' | 'lastMonth' | 'custom';

const TransactionLogViewer: React.FC<TransactionLogViewerProps> = ({ isOpen, onClose }) => {
    const dispatch = useDispatchOnly();
    const { showConfirm, showToast } = useNotification();
    const currentUser = useCurrentUser();
    const transactionLog = useTransactionLog();
    const printReport = usePrintReport();
    
    const [dateRange, setDateRange] = useState<DateRangeType>('today');
    const [startDate, setStartDate] = useState(todayLocalYyyyMmDd());
    const [endDate, setEndDate] = useState(todayLocalYyyyMmDd());
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof TransactionLogEntry; direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });

    const handleRangeChange = (type: DateRangeType) => {
        setDateRange(type);
        const now = new Date();
        if (type === 'today') {
            const dateStr = todayLocalYyyyMmDd();
            setStartDate(dateStr);
            setEndDate(dateStr);
        } else if (type === 'thisMonth') {
            setStartDate(startOfMonthYyyyMmDd(now));
            setEndDate(endOfMonthYyyyMmDd(now));
        } else if (type === 'lastMonth') {
            const anchor = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            setStartDate(startOfMonthYyyyMmDd(anchor));
            setEndDate(endOfMonthYyyyMmDd(anchor));
        }
    };

    const handleCustomDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        setDateRange('custom');
    };

    const filteredLogs = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        let logs = transactionLog || [];
        
        // RBAC Filter: If not Admin, filter by userId
        if (currentUser?.role !== 'Admin') {
            logs = logs.filter(log => log.userId === currentUser?.id);
        }

        // Date Filter
        logs = logs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= start && logDate <= end;
        });

        // Search Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            logs = logs.filter(log => 
                log.description.toLowerCase().includes(q) ||
                log.entityType.toLowerCase().includes(q) ||
                log.action.toLowerCase().includes(q) ||
                (log.userLabel && log.userLabel.toLowerCase().includes(q))
            );
        }

        // Sort
        return logs.sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    }, [transactionLog, startDate, endDate, searchQuery, sortConfig, currentUser]);

    const handleSort = (key: keyof TransactionLogEntry) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleRestore = async (entry: TransactionLogEntry) => {
        if (entry.action === 'DELETE' && entry.entityType === 'Transaction' && entry.data) {
            if (await showConfirm('Are you sure you want to restore this deleted transaction?', { title: 'Restore Transaction', confirmLabel: 'Restore' })) {
                dispatch({ type: 'RESTORE_TRANSACTION', payload: entry.data });
                showToast('Transaction restored successfully.');
            }
        }
    };

    const handleExport = () => {
        const data = filteredLogs.map(l => ({
            Time: new Date(l.timestamp).toLocaleString(),
            User: l.userLabel || 'System',
            Action: l.action,
            Entity: l.entityType,
            Description: l.description
        }));
        exportJsonToExcel(data, `transaction-log-${startDate}-${endDate}.xlsx`, 'Log');
    };

    const handlePrint = () => {
        printReport({ elementId: 'transaction-log-print-area' });
    };

    const SortIcon = ({ colKey }: { colKey: keyof TransactionLogEntry }) => (
        <span className="ml-1 text-[10px] text-app-muted">
            {sortConfig.key === colKey ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Transaction Log History" size="xl">
            <div className="flex flex-col h-full space-y-4 max-h-[80vh]">
                <div className="flex flex-col gap-3 p-1">
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex bg-app-surface-2 p-1 rounded-lg">
                            {(['today', 'thisMonth', 'lastMonth', 'custom'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => handleRangeChange(type)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                        dateRange === type 
                                        ? 'bg-app-card text-accent shadow-ds-card font-bold' 
                                        : 'text-app-muted hover:text-app-text hover:bg-app-surface-2/60'
                                    }`}
                                >
                                    {type === 'today' ? 'Today' : type === 'thisMonth' ? 'This Month' : type === 'lastMonth' ? 'Last Month' : 'Custom'}
                                </button>
                            ))}
                        </div>
                        {dateRange === 'custom' && (
                            <div className="flex items-center gap-2">
                                <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(fromPickerDateToYyyyMmDd(d), endDate)} />
                                <span className="text-app-muted">-</span>
                                <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, fromPickerDateToYyyyMmDd(d))} />
                            </div>
                        )}
                        <div className="flex-grow min-w-[200px]">
                            <Input 
                                placeholder="Search logs..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="py-1.5 text-sm"
                            />
                        </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={handleExport}>
                            <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handlePrint}>
                            <div className="w-4 h-4 mr-1">{ICONS.print}</div> Print
                        </Button>
                    </div>
                </div>

                <div
                    id="transaction-log-print-area"
                    className="printable-area print-report-surface flex-grow overflow-auto border rounded-lg shadow-inner bg-app-card flex flex-col min-h-0"
                    data-print-scroll-container
                >
                    <div className="p-3 flex-shrink-0">
                        <ReportHeader reportTitle="Transaction Log" />
                        <p className="text-center text-sm text-slate-600 report-title-block">
                            {formatDate(startDate)} – {formatDate(endDate)}
                            {searchQuery ? ` · Filter: "${searchQuery}"` : ''}
                        </p>
                    </div>
                    <div className="flex-grow overflow-auto">
                    <table className="min-w-full divide-y divide-app-border text-sm">
                        <thead className="bg-app-bg sticky top-0 shadow-ds-card">
                            <tr>
                                <th onClick={() => handleSort('timestamp')} className="px-4 py-3 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-surface-2 select-none whitespace-nowrap">Time <SortIcon colKey="timestamp"/></th>
                                <th onClick={() => handleSort('userLabel')} className="px-4 py-3 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-surface-2 select-none whitespace-nowrap">User <SortIcon colKey="userLabel"/></th>
                                <th onClick={() => handleSort('action')} className="px-4 py-3 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-surface-2 select-none whitespace-nowrap">Action <SortIcon colKey="action"/></th>
                                <th onClick={() => handleSort('entityType')} className="px-4 py-3 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-surface-2 select-none whitespace-nowrap">Entity <SortIcon colKey="entityType"/></th>
                                <th onClick={() => handleSort('description')} className="px-4 py-3 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-surface-2 select-none">Description <SortIcon colKey="description"/></th>
                                <th className="px-4 py-3 text-right font-semibold text-app-muted no-print">Restore</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border">
                            {filteredLogs.length > 0 ? filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-app-bg transition-colors">
                                    <td className="px-4 py-2 whitespace-nowrap text-app-muted text-xs">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-app-text font-medium text-xs">
                                        {log.userLabel || 'System'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                            log.action === 'DELETE' ? 'bg-rose-100 text-ds-danger' :
                                            log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                                            log.action === 'RESTORE' ? 'bg-app-highlight text-ds-primary' :
                                            log.action === 'CLEAR_ALL' ? 'bg-app-text text-white' :
                                            'bg-amber-100 text-ds-warning'
                                        }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-app-text font-medium">{log.entityType}</td>
                                    <td className="px-4 py-2 text-app-muted whitespace-normal">{log.description}</td>
                                    <td className="px-4 py-2 text-right no-print">
                                        {log.action === 'DELETE' && log.entityType === 'Transaction' && (
                                            <button 
                                                onClick={() => handleRestore(log)} 
                                                className="text-ds-primary hover:text-app-text text-xs font-semibold hover:underline"
                                            >
                                                Restore
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-app-muted">No logs found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    </div>
                    <ReportFooter generatedBy={currentUser?.name} />
                </div>
                
                <div className="flex justify-end pt-2">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

export default TransactionLogViewer;
