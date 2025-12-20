
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, InvoiceType, TransactionType } from '../../types';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { useNotification } from '../../context/NotificationContext';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';

interface LedgerItem {
    id: string;
    date: string;
    tenantName: string;
    particulars: string;
    debit: number; // Invoice amount (Due)
    credit: number; // Payment Received
    balance: number;
}

const TenantLedgerReport: React.FC = () => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    
    const [dateRangeType, setDateRangeType] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    
    const [selectedTenantId, setSelectedTenantId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof LedgerItem; direction: 'asc' | 'desc' } | null>(null);

    const handleRangeChange = (type: ReportDateRange) => {
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

    const tenants = useMemo(() => state.contacts.filter(c => c.type === ContactType.TENANT), [state.contacts]);
    const tenantItems = useMemo(() => [{ id: 'all', name: 'All Tenants' }, ...tenants], [tenants]);

    const reportData = useMemo<LedgerItem[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // 1. Rental Invoices (Debit - Tenant owes us)
        let tenantInvoices = state.invoices.filter(inv => 
            inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SERVICE_CHARGE
        );
        
        if (selectedTenantId !== 'all') {
            tenantInvoices = tenantInvoices.filter(inv => inv.contactId === selectedTenantId);
        }

        // 2. Payments (Credit - Tenant paid us)
        // We look for INCOME transactions linked to the tenant
        let tenantPayments = state.transactions.filter(tx => 
            tx.type === TransactionType.INCOME &&
            tx.contactId
        );

        if (selectedTenantId !== 'all') {
            tenantPayments = tenantPayments.filter(tx => tx.contactId === selectedTenantId);
        } else {
            // Filter to only valid tenants if 'all' is selected
            const tenantIds = new Set(tenants.map(t => t.id));
            // Also include transactions that are linked to rental invoices even if the tenant is deleted (orphan transactions)
            tenantPayments = tenantPayments.filter(tx => {
                if (tenantIds.has(tx.contactId!)) return true;
                if (tx.invoiceId) {
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    return inv && (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SERVICE_CHARGE);
                }
                return false;
            });
        }

        const ledgerItems: { date: string, tenantName: string, particulars: string, debit: number, credit: number }[] = [];
        
        tenantInvoices.forEach(inv => {
            const invDate = new Date(inv.issueDate);
            if(invDate >= start && invDate <= end) {
                const tenant = state.contacts.find(c => c.id === inv.contactId);
                ledgerItems.push({ 
                    date: inv.issueDate, 
                    tenantName: tenant?.name || 'Unknown/Deleted Tenant',
                    particulars: `Invoice #${inv.invoiceNumber} (${inv.description || 'Rent'})`, 
                    debit: inv.amount, 
                    credit: 0 
                });
            }
        });

        tenantPayments.forEach(tx => {
            const txDate = new Date(tx.date);
            if(txDate >= start && txDate <= end) {
                const tenant = state.contacts.find(c => c.id === tx.contactId);
                ledgerItems.push({ 
                    date: tx.date, 
                    tenantName: tenant?.name || 'Unknown/Deleted Tenant',
                    particulars: tx.description || 'Payment Received', 
                    debit: 0, 
                    credit: tx.amount 
                });
            }
        });
        
        // Sort Chronologically
        ledgerItems.sort((a, b) => {
            if (groupBy === 'tenant') {
                if (a.tenantName < b.tenantName) return -1;
                if (a.tenantName > b.tenantName) return 1;
            }
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        let runningBalance = 0;
        let currentTenantName = '';
        let finalItems: LedgerItem[] = [];

        finalItems = ledgerItems.map((item, index) => {
            if (groupBy === 'tenant' && item.tenantName !== currentTenantName) {
                currentTenantName = item.tenantName;
                runningBalance = 0;
            }
            runningBalance += item.debit - item.credit;
            return { ...item, id: `${item.date}-${index}`, balance: runningBalance };
        });
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            finalItems = finalItems.filter(item => 
                item.particulars.toLowerCase().includes(q) ||
                item.tenantName.toLowerCase().includes(q)
            );
        }

        if (sortConfig) {
            finalItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return finalItems;

    }, [state, startDate, endDate, selectedTenantId, searchQuery, tenants, groupBy, sortConfig]);
    
    const requestSort = (key: keyof LedgerItem) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.debit += item.debit;
            acc.credit += item.credit;
            return acc;
        }, { debit: 0, credit: 0 });
    }, [reportData]);

    const handlePrint = () => { window.print(); };

    const handleExport = () => {
        const dataToExport = reportData.map(item => ({
            'Date': formatDate(item.date),
            'Tenant': item.tenantName,
            'Particulars': item.particulars,
            'Debit (Due)': item.debit,
            'Credit (Paid)': item.credit,
            'Balance': item.balance,
        }));
        exportJsonToExcel(dataToExport, `tenant-ledger.xlsx`, 'Tenant Ledger');
    };

    const handleWhatsApp = async () => {
        const selectedTenant = tenants.find(c => c.id === selectedTenantId);
        if (selectedTenantId === 'all' || !selectedTenant?.contactNo) {
            await showAlert("Please select a single tenant with a contact number to send a report.");
            return;
        }

        const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;
        
        let message = `*Statement for ${selectedTenant.name}*\n`;
        message += `Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n\n`;
        message += `Final Balance Due: *${CURRENCY} ${finalBalance.toLocaleString()}*\n\n`;
        message += `This is an automated summary from My Accountant.`;
    
        const phoneNumber = selectedTenant.contactNo.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank');
    };
    
    const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;

    const SortHeader: React.FC<{ label: string, sortKey: keyof LedgerItem, align?: 'left' | 'right' }> = ({ label, sortKey, align = 'left' }) => (
        <th 
            className={`px-3 py-2 text-${align} font-semibold text-slate-600 bg-slate-50 cursor-pointer hover:bg-slate-100 select-none`}
            onClick={() => requestSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {sortConfig?.key === sortKey && (
                    <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
            </div>
        </th>
    );

    return (
        <>
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 12.7mm;
                    }
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .printable-area, .printable-area * {
                        visibility: visible !important;
                    }
                    .printable-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background-color: white;
                        z-index: 9999;
                    }
                    .no-print {
                        display: none !important;
                    }
                    ::-webkit-scrollbar {
                        display: none;
                    }
                    table {
                        page-break-inside: auto;
                    }
                    tr {
                        page-break-inside: avoid;
                        page-break-after: auto;
                    }
                    thead {
                        display: table-header-group;
                    }
                    tfoot {
                        display: table-footer-group;
                    }
                }
            `}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onExport={handleExport}
                        onPrint={handlePrint}
                        onWhatsApp={handleWhatsApp}
                        disableWhatsApp={selectedTenantId === 'all'}
                        groupBy={groupBy}
                        onGroupByChange={setGroupBy}
                        groupByOptions={[{ label: 'Tenant', value: 'tenant' }]}
                        showDateFilterPills={true}
                        activeDateRange={dateRangeType}
                        onRangeChange={handleRangeChange}
                    >
                        <ComboBox label="Tenant" items={tenantItems} selectedId={selectedTenantId} onSelect={(item) => setSelectedTenantId(item?.id || 'all')} allowAddNew={false} />
                    </ReportToolbar>
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0">
                    <Card className="min-h-full">
                        <ReportHeader />
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Tenant Ledger</h3>
                            <p className="text-sm text-slate-500">From {formatDate(startDate)} to {formatDate(endDate)}</p>
                            <p className="text-sm text-slate-500 font-semibold">
                                Tenant: {selectedTenantId === 'all' ? 'All Tenants' : state.contacts.find(c=>c.id === selectedTenantId)?.name}
                            </p>
                        </div>

                        {reportData.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <SortHeader label="Date" sortKey="date" align="left" />
                                            <SortHeader label="Tenant" sortKey="tenantName" align="left" />
                                            <SortHeader label="Particulars" sortKey="particulars" align="left" />
                                            <SortHeader label="Debit (Due)" sortKey="debit" />
                                            <SortHeader label="Credit (Paid)" sortKey="credit" />
                                            <SortHeader label="Balance" sortKey="balance" />
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {reportData.map(item => (
                                            <tr key={item.id}>
                                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words">{item.tenantName}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words max-w-xs">{item.particulars}</td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">{item.debit > 0 ? `${CURRENCY} ${item.debit.toLocaleString()}` : '-'}</td>
                                                <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.credit > 0 ? `${CURRENCY} ${item.credit.toLocaleString()}` : '-'}</td>
                                                <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-slate-700'}`}>{CURRENCY} {item.balance.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold">
                                        <tr>
                                            <td colSpan={3} className="px-3 py-2 text-right text-sm">Totals (Period)</td>
                                            <td className="px-3 py-2 text-right text-sm whitespace-nowrap">{CURRENCY} {totals.debit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm text-success whitespace-nowrap">{CURRENCY} {totals.credit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm whitespace-nowrap">
                                                {selectedTenantId !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (<div className="text-center py-16"><p className="text-slate-500">No ledger transactions found for the selected criteria.</p></div>)}
                        <ReportFooter />
                    </Card>
                </div>
            </div>
        </>
    );
};

export default TenantLedgerReport;
