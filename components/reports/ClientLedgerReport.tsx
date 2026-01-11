
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, InvoiceType, TransactionType, ProjectAgreementStatus } from '../../types';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { useNotification } from '../../context/NotificationContext';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface LedgerItem {
    id: string;
    date: string;
    ownerName: string;
    unitName: string;
    projectName: string;
    particulars: string;
    debit: number; // Invoice amount, Refund Given, or Penalty
    credit: number; // Payment Received
    balance: number;
}

interface AgreementSummary {
    id: string;
    ownerName: string;
    projectName: string;
    unitNames: string;
    listPrice: number;
    discounts: { label: string; amount: number }[];
    sellingPrice: number;
    totalReceived: number;
    remainingAmount: number;
}

const ClientLedgerReport: React.FC = () => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const { handlePrint } = usePrint();
    const { openChat } = useWhatsApp();
    
    // Date Filter State
    const [dateRangeType, setDateRangeType] = useState<'total' | 'thisMonth' | 'lastMonth' | 'custom'>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    
    // Default to All Owners
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState('');
    
    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: keyof LedgerItem; direction: 'asc' | 'desc' } | null>(null);

    const handleRangeChange = (type: 'total' | 'thisMonth' | 'lastMonth' | 'custom') => {
        setDateRangeType(type);
        const now = new Date();
        if (type === 'total') {
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
        if (dateRangeType !== 'custom') {
            setDateRangeType('custom');
        }
    };

    // Include both CLIENT and OWNER types
    const owners = useMemo(() => state.contacts.filter(c => c.type === ContactType.CLIENT || c.type === ContactType.OWNER), [state.contacts]);
    const ownerItems = useMemo(() => [{ id: 'all', name: 'All Owners' }, ...owners], [owners]);

    // --- Summary Data Calculation ---
    const agreementSummaries = useMemo<AgreementSummary[]>(() => {
        const agreements = state.projectAgreements.filter(pa => 
            selectedOwnerId === 'all' || pa.clientId === selectedOwnerId
        );

        return agreements.map(pa => {
            const owner = state.contacts.find(c => c.id === pa.clientId);
            const project = state.projects.find(p => p.id === pa.projectId);
            const units = state.units.filter(u => pa.unitIds?.includes(u.id) ?? false);
            
            // Calculate Total Received based on actual transactions linked to invoices of this agreement
            // This matches how the ledger calculates payments (using transactions, not invoice.paidAmount)
            // Only count INSTALLMENT invoices to match the ledger filtering logic
            const agreementInvoices = state.invoices.filter(inv => 
                inv.agreementId === pa.id && 
                inv.invoiceType === InvoiceType.INSTALLMENT &&
                (selectedOwnerId === 'all' || inv.contactId === selectedOwnerId)
            );
            
            // Get invoice IDs for quick lookup
            const agreementInvoiceIds = new Set(agreementInvoices.map(inv => inv.id));
            
            // Calculate total received - match ledger logic exactly
            const totalReceived = state.transactions
                .filter(tx => {
                    // Must be INCOME type
                    if (tx.type !== TransactionType.INCOME) return false;
                    
                    // Must be linked to an invoice
                    if (!tx.invoiceId) return false;
                    
                    // Invoice must belong to this agreement
                    if (!agreementInvoiceIds.has(tx.invoiceId)) return false;
                    
                    // Verify the invoice is INSTALLMENT type (double check)
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    if (!inv || inv.invoiceType !== InvoiceType.INSTALLMENT) return false;
                    
                    // If filtering by owner, ensure transaction matches
                    if (selectedOwnerId !== 'all' && tx.contactId !== selectedOwnerId) return false;
                    
                    return true;
                })
                .reduce((sum, tx) => sum + tx.amount, 0);

            const discounts = [
                { label: 'Customer Discount', amount: pa.customerDiscount },
                { label: 'Floor Discount', amount: pa.floorDiscount },
                { label: 'Lump Sum Discount', amount: pa.lumpSumDiscount },
                { label: 'Misc Discount', amount: pa.miscDiscount },
            ].filter(d => d.amount > 0);

            return {
                id: pa.id,
                ownerName: owner?.name || 'Unknown',
                projectName: project?.name || 'Unknown',
                unitNames: units.map(u => u.name).join(', '),
                listPrice: pa.listPrice,
                discounts,
                sellingPrice: pa.sellingPrice,
                totalReceived,
                remainingAmount: pa.sellingPrice - totalReceived
            };
        });
    }, [state.projectAgreements, state.contacts, state.projects, state.units, state.invoices, state.transactions, selectedOwnerId]);


    const reportData = useMemo<LedgerItem[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Rental Category Set for exclusion
        const rentalCategoryIds = new Set(state.categories.filter(c => c.isRental).map(c => c.id));

        // 1. Invoices (Debit - They owe us) - Only Project Installments
        let ownerInvoices = state.invoices.filter(inv => 
            inv.invoiceType === InvoiceType.INSTALLMENT
        );
        
        if (selectedOwnerId !== 'all') {
            ownerInvoices = ownerInvoices.filter(inv => inv.contactId === selectedOwnerId);
        }

        // 2. Payments Received (Credit - They paid us) - INCOME
        let ownerPayments = state.transactions.filter(tx => 
            tx.type === TransactionType.INCOME &&
            tx.invoiceId // Must be linked to an invoice
        );
        
        // STRICTER FILTER: Ensure linked invoice is INSTALLMENT type (not Rental)
        ownerPayments = ownerPayments.filter(tx => {
             const inv = state.invoices.find(i => i.id === tx.invoiceId);
             return inv && inv.invoiceType === InvoiceType.INSTALLMENT;
        });

        // 3. Refunds/Payouts Given (Debit - We paid them back) - EXPENSE
        let ownerRefunds = state.transactions.filter(tx => 
            tx.type === TransactionType.EXPENSE &&
            tx.contactId 
        );
        
        // STRICTER FILTER: Exclude Rental Categories and ensure it's likely project related
        ownerRefunds = ownerRefunds.filter(tx => !tx.categoryId || !rentalCategoryIds.has(tx.categoryId));

        if (selectedOwnerId !== 'all') {
            ownerPayments = ownerPayments.filter(tx => tx.contactId === selectedOwnerId);
            ownerRefunds = ownerRefunds.filter(tx => tx.contactId === selectedOwnerId);
        } else {
            // If 'all', ensure we only get transactions for relevant project clients
            const ownerIds = new Set(owners.map(c => c.id));
            ownerPayments = ownerPayments.filter(tx => tx.contactId && ownerIds.has(tx.contactId));
            ownerRefunds = ownerRefunds.filter(tx => tx.contactId && ownerIds.has(tx.contactId));
        }

        const rawItems: { date: string, ownerName: string, unitName: string, projectName: string, particulars: string, debit: number, credit: number }[] = [];
        
        // Helper to get Unit/Project Name
        const getContext = (invoiceId?: string, projectId?: string, agreementId?: string) => {
            let unitName = '-';
            let projectName = '-';
            
            if (projectId) {
                projectName = state.projects.find(p => p.id === projectId)?.name || '-';
            }

            if (invoiceId) {
                const inv = state.invoices.find(i => i.id === invoiceId);
                if (inv) {
                    if (inv.unitId) unitName = state.units.find(u => u.id === inv.unitId)?.name || '-';
                    if (!projectName && inv.projectId) projectName = state.projects.find(p => p.id === inv.projectId)?.name || '-';
                }
            }
            
            return { unitName, projectName };
        };

        // Add Invoices
        ownerInvoices.forEach(inv => {
            const invDate = new Date(inv.issueDate);
            if(invDate >= start && invDate <= end) {
                const owner = state.contacts.find(c => c.id === inv.contactId);
                const { unitName, projectName } = getContext(inv.id, inv.projectId);
                rawItems.push({ 
                    date: inv.issueDate, 
                    ownerName: owner?.name || 'Unknown',
                    unitName,
                    projectName,
                    particulars: `Invoice #${inv.invoiceNumber}`, 
                    debit: inv.amount, 
                    credit: 0 
                });
            }
        });

        // Add Payments (Income)
        ownerPayments.forEach(tx => {
            const txDate = new Date(tx.date);
            if(txDate >= start && txDate <= end) {
                const owner = state.contacts.find(c => c.id === tx.contactId);
                const { unitName, projectName } = getContext(tx.invoiceId, tx.projectId);
                rawItems.push({ 
                    date: tx.date, 
                    ownerName: owner?.name || 'Unknown',
                    unitName,
                    projectName,
                    particulars: tx.description || 'Payment Received', 
                    debit: 0, 
                    credit: tx.amount 
                });
            }
        });

        // Add Refunds (Expense)
        ownerRefunds.forEach(tx => {
            const txDate = new Date(tx.date);
            if(txDate >= start && txDate <= end) {
                const owner = state.contacts.find(c => c.id === tx.contactId);
                const { unitName, projectName } = getContext(tx.invoiceId, tx.projectId);
                rawItems.push({ 
                    date: tx.date, 
                    ownerName: owner?.name || 'Unknown',
                    unitName,
                    projectName,
                    particulars: tx.description || 'Refund/Payout Given', 
                    debit: tx.amount, 
                    credit: 0 
                });
            }
        });

        // 4. Synthetic Penalties (Debit)
        state.projectAgreements.forEach(pa => {
            if (pa.status === ProjectAgreementStatus.CANCELLED && pa.cancellationDetails && pa.cancellationDetails.penaltyAmount > 0) {
                if (selectedOwnerId === 'all' || pa.clientId === selectedOwnerId) {
                    const cancelDate = new Date(pa.cancellationDetails.date);
                    if (cancelDate >= start && cancelDate <= end) {
                        const owner = state.contacts.find(c => c.id === pa.clientId);
                        const project = state.projects.find(p => p.id === pa.projectId);
                        const units = state.units.filter(u => pa.unitIds?.includes(u.id) ?? false).map(u => u.name).join(', ');
                        
                        rawItems.push({
                            date: pa.cancellationDetails.date,
                            ownerName: owner?.name || 'Unknown',
                            unitName: units || '-',
                            projectName: project?.name || '-',
                            particulars: `Cancellation Penalty - Agreement #${pa.agreementNumber}`,
                            debit: pa.cancellationDetails.penaltyAmount,
                            credit: 0
                        });
                    }
                }
            }
        });
        
        // Sort Chronologically
        rawItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Sorting Logic for Group By or SortConfig
        if (groupBy === 'owner') {
            rawItems.sort((a, b) => a.ownerName.localeCompare(b.ownerName) || new Date(a.date).getTime() - new Date(b.date).getTime());
        } else if (groupBy === 'unit') {
            rawItems.sort((a, b) => a.unitName.localeCompare(b.unitName) || new Date(a.date).getTime() - new Date(b.date).getTime());
        } else if (sortConfig) {
             rawItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        let runningBalance = 0;
        let currentGroupKey = '';
        let finalItems: LedgerItem[] = [];

        finalItems = rawItems.map((item, index) => {
            // Reset balance on group change
            let groupKey = '';
            if (groupBy === 'owner') groupKey = item.ownerName;
            else if (groupBy === 'unit') groupKey = item.unitName;
            
            if (groupBy && groupKey !== currentGroupKey) {
                currentGroupKey = groupKey;
                runningBalance = 0;
            }

            runningBalance += item.debit - item.credit;
            return { ...item, id: `${item.date}-${index}`, balance: runningBalance };
        });
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            finalItems = finalItems.filter(item => 
                item.particulars.toLowerCase().includes(q) ||
                item.ownerName.toLowerCase().includes(q) ||
                item.unitName.toLowerCase().includes(q)
            );
        }

        return finalItems;

    }, [state, startDate, endDate, selectedOwnerId, searchQuery, owners, groupBy, sortConfig]);
    
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


    const handleExport = () => {
        const data = reportData.map(item => ({
            'Date': formatDate(item.date),
            'Owner': item.ownerName,
            'Unit': item.unitName,
            'Project': item.projectName,
            'Particulars': item.particulars,
            'Debit (Due)': item.debit,
            'Credit (Paid)': item.credit,
            'Balance': item.balance,
        }));
        exportJsonToExcel(data, `project-owner-ledger.xlsx`, 'Owner Ledger');
    };

    const handleWhatsApp = async () => {
        const selectedOwner = owners.find(c => c.id === selectedOwnerId);
        if (selectedOwnerId === 'all' || !selectedOwner?.contactNo) {
            await showAlert("Please select a single owner with a contact number to send a report.");
            return;
        }

        try {
            const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;
            
            let message = `*Statement for ${selectedOwner.name}*\n`;
            message += `Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n\n`;
            message += `Final Balance Due: *${CURRENCY} ${finalBalance.toLocaleString()}*\n\n`;
            message += `This is an automated summary from PBooksPro.`;
        
            WhatsAppService.sendMessage({ contact: selectedOwner, message });
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
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

    // Helper to render the ledger rows with grouping headers
    const renderLedgerRows = () => {
        let lastGroupKey = '';
        return (
            <tbody className="bg-white divide-y divide-slate-200">
                {reportData.map(item => {
                    let showGroupHeader = false;
                    let groupHeaderLabel = '';
                    
                    if (groupBy === 'owner') {
                        if (item.ownerName !== lastGroupKey) {
                            lastGroupKey = item.ownerName;
                            showGroupHeader = true;
                            groupHeaderLabel = `Owner: ${item.ownerName}`;
                        }
                    } else if (groupBy === 'unit') {
                        if (item.unitName !== lastGroupKey) {
                            lastGroupKey = item.unitName;
                            showGroupHeader = true;
                            groupHeaderLabel = `Unit: ${item.unitName}`;
                        }
                    }

                    return (
                        <React.Fragment key={item.id}>
                            {showGroupHeader && (
                                <tr className="bg-slate-100">
                                    <td colSpan={7} className="px-3 py-2 font-bold text-slate-700 border-t border-b border-slate-300">
                                        {groupHeaderLabel}
                                    </td>
                                </tr>
                            )}
                            <tr>
                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                <td className="px-3 py-2 whitespace-normal break-words">{item.ownerName}</td>
                                <td className="px-3 py-2 whitespace-normal break-words">{item.unitName}</td>
                                <td className="px-3 py-2 max-w-xs whitespace-normal break-words">{item.particulars}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">{item.debit > 0 ? `${CURRENCY} ${item.debit.toLocaleString()}` : '-'}</td>
                                <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.credit > 0 ? `${CURRENCY} ${item.credit.toLocaleString()}` : '-'}</td>
                                <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-slate-700'}`}>{CURRENCY} {item.balance.toLocaleString()}</td>
                            </tr>
                        </React.Fragment>
                    );
                })}
            </tbody>
        );
    };

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
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
                        disableWhatsApp={selectedOwnerId === 'all'}
                        groupBy={groupBy}
                        onGroupByChange={setGroupBy}
                        groupByOptions={[
                            { label: 'Owner', value: 'owner' },
                            { label: 'Unit', value: 'unit' }
                        ]}
                        hideDate={dateRangeType !== 'custom'}
                    >
                        <div className="flex flex-col gap-1 min-w-[240px]">
                            <label className="block text-sm font-medium text-slate-600">Date Filter</label>
                            <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200 gap-1">
                                {(['total', 'thisMonth', 'lastMonth', 'custom'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => handleRangeChange(type)}
                                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                                            dateRangeType === type 
                                            ? 'bg-white shadow-sm text-accent border border-slate-200' 
                                            : 'text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {type === 'total' ? 'Total' : type === 'thisMonth' ? 'This' : type === 'lastMonth' ? 'Last' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <ComboBox label="Owner" items={ownerItems} selectedId={selectedOwnerId} onSelect={(item) => setSelectedOwnerId(item?.id || 'all')} allowAddNew={false} />
                    </ReportToolbar>
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full flex flex-col">
                        <ReportHeader />
                        <div className="text-center mb-6 flex-shrink-0">
                            <h3 className="text-2xl font-bold">Owner Ledger (Project)</h3>
                            <p className="text-sm text-slate-500">From {formatDate(startDate)} to {formatDate(endDate)}</p>
                            <p className="text-sm text-slate-500 font-semibold">
                                Owner: {selectedOwnerId === 'all' ? 'All Owners' : state.contacts.find(c=>c.id === selectedOwnerId)?.name}
                            </p>
                        </div>

                        {/* Summaries Section */}
                        {agreementSummaries.length > 0 && (
                            <div className="mb-4 grid grid-cols-1 gap-4 print:break-inside-avoid overflow-y-auto max-h-[25vh] pr-1 border border-slate-100 rounded-lg p-2 bg-slate-50 flex-shrink-0">
                                {agreementSummaries.map(summary => (
                                    <div key={summary.id} className="p-4 bg-white rounded-lg border border-slate-200 text-sm shadow-sm">
                                        <div className="grid grid-cols-3 gap-4 divide-x divide-slate-200">
                                            {/* Section 1: Owner information, unit name and project name */}
                                            <div className="flex flex-col gap-2 pr-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Owner Information</span>
                                                    <span className="font-bold text-slate-800 text-base">{summary.ownerName}</span>
                                                </div>
                                                <div className="flex flex-col gap-1 mt-2">
                                                    <span className="text-slate-500 text-xs">Unit:</span>
                                                    <span className="font-bold text-slate-800">{summary.unitNames}</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-slate-500 text-xs">Project name:</span>
                                                    <span className="font-semibold text-slate-700">{summary.projectName}</span>
                                                </div>
                                            </div>

                                            {/* Section 2: List price and discounts */}
                                            <div className="flex flex-col gap-2 px-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Pricing</span>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500">List price:</span>
                                                        <span className="font-medium text-slate-800">{CURRENCY} {summary.listPrice.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                {summary.discounts.length > 0 && (
                                                    <div className="flex flex-col gap-1 mt-2">
                                                        <span className="text-slate-500 text-xs mb-1">Discounts:</span>
                                                        {summary.discounts.map((d, i) => (
                                                            <div key={i} className="flex justify-between text-slate-600 text-xs">
                                                                <span>{d.label}:</span>
                                                                <span className="text-danger">-{CURRENCY} {d.amount.toLocaleString()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="flex justify-between border-t border-slate-300 pt-2 mt-auto">
                                                    <span className="font-semibold text-slate-700">Selling price:</span>
                                                    <span className="font-bold text-indigo-700">{CURRENCY} {summary.sellingPrice.toLocaleString()}</span>
                                                </div>
                                            </div>

                                            {/* Section 3: Payment received and remaining payment */}
                                            <div className="flex flex-col gap-2 pl-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Payments</span>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500">Payment received:</span>
                                                        <span className="font-semibold text-success">{CURRENCY} {summary.totalReceived.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between border-t border-slate-300 pt-2 mt-auto">
                                                    <span className="font-semibold text-slate-700">Remaining:</span>
                                                    <span className="font-bold text-danger text-base">{CURRENCY} {summary.remainingAmount.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {reportData.length > 0 ? (
                            <div className="overflow-auto flex-grow border rounded-lg shadow-inner relative min-h-[300px]">
                                <table className="min-w-full divide-y divide-slate-200 text-sm relative">
                                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <SortHeader label="Date" sortKey="date" align="left" />
                                            <SortHeader label="Owner" sortKey="ownerName" align="left" />
                                            <SortHeader label="Unit" sortKey="unitName" align="left" />
                                            <SortHeader label="Particulars" sortKey="particulars" align="left" />
                                            <SortHeader label="Debit (Due)" sortKey="debit" />
                                            <SortHeader label="Credit (Paid)" sortKey="credit" />
                                            <SortHeader label="Balance" sortKey="balance" />
                                        </tr>
                                    </thead>
                                    {renderLedgerRows()}
                                    <tfoot className="bg-slate-50 font-bold sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.1)]">
                                        <tr>
                                            <td colSpan={4} className="px-3 py-2 text-right text-sm bg-slate-50">Totals (Period)</td>
                                            <td className="px-3 py-2 text-right text-sm bg-slate-50 whitespace-nowrap">{CURRENCY} {totals.debit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm text-success bg-slate-50 whitespace-nowrap">{CURRENCY} {totals.credit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm bg-slate-50 whitespace-nowrap">
                                                {selectedOwnerId !== 'all' || groupBy ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (<div className="text-center py-16"><p className="text-slate-500">No ledger transactions found for the selected criteria.</p></div>)}
                        <div className="flex-shrink-0 mt-auto">
                            <ReportFooter />
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
};

export default ClientLedgerReport;
