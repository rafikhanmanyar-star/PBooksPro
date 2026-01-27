
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionLogEntry, Transaction } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import DatePicker from '../ui/DatePicker';
import { exportJsonToExcel } from '../../services/exportService';
import { useNotification } from '../../context/NotificationContext';

interface TransactionLogViewerProps {
    isOpen: boolean;
    onClose: () => void;
}

type DateRangeType = 'today' | 'thisMonth' | 'lastMonth' | 'custom';

const TransactionLogViewer: React.FC<TransactionLogViewerProps> = ({ isOpen, onClose }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast } = useNotification();
    const { currentUser } = state;
    
    const [dateRange, setDateRange] = useState<DateRangeType>('today');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof TransactionLogEntry; direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });

    const handleRangeChange = (type: DateRangeType) => {
        setDateRange(type);
        const now = new Date();
        if (type === 'today') {
            const dateStr = now.toISOString().split('T')[0];
            setStartDate(dateStr);
            setEndDate(dateStr);
        } else if (type === 'thisMonth') {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setStartDate(first.toISOString().split('T')[0]);
            setEndDate(last.toISOString().split('T')[0]);
        } else if (type === 'lastMonth') {
            const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const last = new Date(now.getFullYear(), now.getMonth(), 0);
            setStartDate(first.toISOString().split('T')[0]);
            setEndDate(last.toISOString().split('T')[0]);
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

        let logs = state.transactionLog || [];
        
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

    }, [state.transactionLog, startDate, endDate, searchQuery, sortConfig, currentUser]);

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
        // Simple print logic for the current view
        const printContent = document.getElementById('log-table-container');
        if (printContent) {
            const win = window.open('', '', 'height=700,width=900');
            if (win) {
                win.document.write('<html><head><title>Transaction Log</title>');
                win.document.write('<link href="https://cdn.tailwindcss.com" rel="stylesheet">'); // Include tailwind for basic styling match
                win.document.write('<style>@page { size: A4; margin: 12.7mm; }</style>');
                win.document.write('</head><body class="p-8">');
                win.document.write(`<h1 class="text-2xl font-bold mb-4">Transaction Log (${formatDate(startDate)} - ${formatDate(endDate)})</h1>`);
                win.document.write(printContent.innerHTML);
                win.document.write('</body></html>');
                win.document.close();
                win.print();
            }
        }
    };

    const SortIcon = ({ colKey }: { colKey: keyof TransactionLogEntry }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === colKey ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Transaction Log History" size="xl">
            <div className="flex flex-col h-full space-y-4 max-h-[80vh]">
                <div className="flex flex-col gap-3 p-1">
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            {(['today', 'thisMonth', 'lastMonth', 'custom'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => handleRangeChange(type)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                        dateRange === type 
                                        ? 'bg-white text-accent shadow-sm font-bold' 
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                    }`}
                                >
                                    {type === 'today' ? 'Today' : type === 'thisMonth' ? 'This Month' : type === 'lastMonth' ? 'Last Month' : 'Custom'}
                                </button>
                            ))}
                        </div>
                        {dateRange === 'custom' && (
                            <div className="flex items-center gap-2">
                                <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                                <span className="text-slate-400">-</span>
                                <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
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

                {/* Grid */}
                <div className="flex-grow overflow-auto border rounded-lg shadow-inner bg-white" id="log-table-container">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 sticky top-0 shadow-sm">
                            <tr>
                                <th onClick={() => handleSort('timestamp')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Time <SortIcon colKey="timestamp"/></th>
                                <th onClick={() => handleSort('userLabel')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">User <SortIcon colKey="userLabel"/></th>
                                <th onClick={() => handleSort('action')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Action <SortIcon colKey="action"/></th>
                                <th onClick={() => handleSort('entityType')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Entity <SortIcon colKey="entityType"/></th>
                                <th onClick={() => handleSort('description')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Description <SortIcon colKey="description"/></th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">Restore</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {filteredLogs.length > 0 ? filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2 whitespace-nowrap text-slate-500 text-xs">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-slate-700 font-medium text-xs">
                                        {log.userLabel || 'System'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                            log.action === 'DELETE' ? 'bg-rose-100 text-rose-700' :
                                            log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                                            log.action === 'RESTORE' ? 'bg-indigo-100 text-indigo-700' :
                                            log.action === 'CLEAR_ALL' ? 'bg-slate-800 text-white' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-slate-700 font-medium">{log.entityType}</td>
                                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate" title={log.description}>{log.description}</td>
                                    <td className="px-4 py-2 text-right">
                                        {log.action === 'DELETE' && log.entityType === 'Transaction' && (
                                            <button 
                                                onClick={() => handleRestore(log)} 
                                                className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold hover:underline"
                                            >
                                                Restore
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No logs found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                <div className="flex justify-end pt-2">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

export default TransactionLogViewer;
