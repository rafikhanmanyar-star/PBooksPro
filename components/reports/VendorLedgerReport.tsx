
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType, InvoiceStatus, Bill, Transaction } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Modal from '../ui/Modal';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import TransactionForm from '../transactions/TransactionForm';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import PrintButton from '../ui/PrintButton';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface VendorLedgerRow {
    id: string;
    date: string;
    vendorName: string;
    particulars: string;
    buildingName?: string;
    billAmount: number; // Credit (Payable increases)
    paidAmount: number; // Debit (Payable decreases)
    balance: number;
    billId?: string; // Bill ID if this row represents a bill
    transactionId?: string; // Transaction ID if this row represents a payment
    vendorId?: string; // Vendor ID for grouping
}

interface VendorLedgerReportProps {
    context?: 'Rental' | 'Project'; // Optional filtering context
}

type SortKey = 'date' | 'vendorName' | 'particulars' | 'billAmount' | 'paidAmount' | 'balance' | 'buildingName';

const VendorLedgerReport: React.FC<VendorLedgerReportProps> = ({ context }) => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();

    // Filters
    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');

    const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Sorting - default to date ascending (oldest first) for Project context
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'date',
        direction: context === 'Project' ? 'asc' : 'desc'
    });

    // Editing state
    const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);

    // Select Lists
    const vendors = useMemo(() => {
        return state.vendors || [];
    }, [state.vendors]);
    const vendorItems = useMemo(() => [{ id: 'all', name: 'All Vendors' }, ...vendors], [vendors]);
    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

    const handleRangeChange = (option: DateRangeOption) => {
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

    const reportData = useMemo<VendorLedgerRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const items: { date: string, vendorId: string, particulars: string, bill: number, paid: number, buildingName: string, billId?: string, transactionId?: string }[] = [];

        // Helper to resolve building
        const getBuildingName = (buildingId?: string, propertyId?: string) => {
            if (buildingId) return state.buildings.find(b => b.id === buildingId)?.name || '';
            if (propertyId) {
                const prop = state.properties.find(p => p.id === propertyId);
                return state.buildings.find(b => b.id === prop?.buildingId)?.name || '';
            }
            return '';
        };

        const getBuildingId = (buildingId?: string, propertyId?: string) => {
            if (buildingId) return buildingId;
            if (propertyId) {
                const prop = state.properties.find(p => p.id === propertyId);
                return prop?.buildingId;
            }
            return undefined;
        };

        // 1. Bills (Credit - Liability Increases)
        // First, create a map of bills by ID to ensure we only process the latest version of each bill
        // This prevents duplicates when bills are edited (updated bills should replace old entries, not create new ones)
        const billsMap = new Map<string, typeof state.bills[0]>();
        state.bills.forEach(bill => {
            // If bill ID already exists, keep the latest one (assuming later in array = more recent)
            // In practice, UPDATE_BILL should replace the old bill, but this ensures we handle edge cases
            if (!billsMap.has(bill.id)) {
                billsMap.set(bill.id, bill);
            } else {
                // If duplicate exists, use the one that appears later (more recent)
                billsMap.set(bill.id, bill);
            }
        });

        // Process unique bills only
        billsMap.forEach(bill => {
            const date = new Date(bill.issueDate);
            if (date >= start && date <= end) {
                // Filter by vendor FIRST (at source)
                const vendorId = bill.vendorId;
                if (!vendorId) return;

                if (selectedVendorId !== 'all' && vendorId !== selectedVendorId) return;

                // Filter by context
                if (context === 'Project' && !bill.projectId) return;
                if (context === 'Rental' && (bill.projectId || (!bill.buildingId && !bill.propertyId))) return;

                // Filter by Building
                const bId = getBuildingId(bill.buildingId, bill.propertyId);
                if (selectedBuildingId !== 'all' && bId !== selectedBuildingId) return;

                items.push({
                    date: bill.issueDate,
                    vendorId: vendorId,
                    particulars: `Bill #${bill.billNumber} (${bill.description || '-'})`,
                    bill: bill.amount,
                    paid: 0,
                    buildingName: getBuildingName(bill.buildingId, bill.propertyId),
                    billId: bill.id // Store bill ID for reference
                });
            }
        });

        // 2. Payments (Debit - Liability Decreases)
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE) {
                // Determine the actual vendor ID for this transaction
                // For tenant-allocated bills, contactId is set to the tenant, so we look up the bill
                let vendorId: string | undefined = tx.vendorId;
                if (tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) {
                        vendorId = bill.vendorId;
                    }
                }

                // Skip if no vendor ID found
                if (!vendorId) return;

                // Filter by vendor FIRST (at source)
                if (selectedVendorId !== 'all' && vendorId !== selectedVendorId) return;

                const vendor = vendors.find(v => v.id === vendorId);
                if (vendor) {
                    const date = new Date(tx.date);
                    if (date >= start && date <= end) {
                        // Context filter logic
                        if (context === 'Project' && !tx.projectId) return;
                        if (context === 'Rental' && tx.projectId) return;

                        // Filter by Building
                        const bId = getBuildingId(tx.buildingId, tx.propertyId);
                        if (selectedBuildingId !== 'all' && bId !== selectedBuildingId) return;

                        items.push({
                            date: tx.date,
                            vendorId: vendorId,
                            particulars: tx.description || 'Payment',
                            bill: 0,
                            paid: tx.amount,
                            buildingName: getBuildingName(tx.buildingId, tx.propertyId),
                            transactionId: tx.id // Store transaction ID for reference
                        });
                    }
                }
            }
        });

        // First, create rows with basic data (no balance yet)
        // Note: Vendor filtering is already done at source above, so all items here are for the selected vendor
        let rows: VendorLedgerRow[] = [];

        items.forEach((item, index) => {
            const vendorName = vendors.find(v => v.id === item.vendorId)?.name || 'Unknown';

            rows.push({
                id: `${item.vendorId}-${index}`,
                date: item.date,
                vendorName,
                particulars: item.particulars,
                billAmount: item.bill,
                paidAmount: item.paid,
                balance: 0, // Will be calculated after sorting
                buildingName: item.buildingName,
                billId: item.billId,
                transactionId: item.transactionId,
                vendorId: item.vendorId // Store for grouping
            });
        });

        // Apply search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r =>
                r.vendorName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q) ||
                (r.buildingName && r.buildingName.toLowerCase().includes(q))
            );
        }

        // Sort rows first (before calculating balance)
        rows.sort((a, b) => {
            // Group by vendor when showing all vendors
            if (selectedVendorId === 'all') {
                const vendorCompare = a.vendorName.localeCompare(b.vendorName);
                if (vendorCompare !== 0) return vendorCompare;
            }

            // Then apply the sort config
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Now calculate running balance in the sorted order
        let runningBalance = 0;
        let currentVendor = '';

        rows.forEach((row) => {
            // Reset balance when vendor changes (only when showing all vendors)
            if (selectedVendorId === 'all' && row.vendorId !== currentVendor) {
                currentVendor = row.vendorId;
                runningBalance = 0;
            }

            // Calculate balance: bill increases payable, payment decreases payable
            // Same logic as VendorLedger: credit (bill) - debit (paid)
            runningBalance += row.billAmount - row.paidAmount;
            row.balance = runningBalance;
        });

        return rows;

    }, [state, startDate, endDate, selectedVendorId, selectedBuildingId, searchQuery, context, vendors, sortConfig]);

    const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            bill: acc.bill + curr.billAmount,
            paid: acc.paid + curr.paidAmount
        }), { bill: 0, paid: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Vendor: r.vendorName,
            Building: r.buildingName || '-',
            Particulars: r.particulars,
            'Bill Amount': r.billAmount,
            'Paid Amount': r.paidAmount,
            Balance: r.balance
        }));
        exportJsonToExcel(data, 'vendor-ledger.xlsx', 'Vendor Ledger');
    };


    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-app-muted">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
            {/* Custom Toolbar */}
            <div className="flex-shrink-0">
                {/* Custom Toolbar - All controls in first row */}
                <div className="bg-app-card p-3 rounded-lg border border-app-border shadow-ds-card no-print">
                    {/* First Row: Dates, Filters, and Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Date Range Pills */}
                        <div className="flex bg-app-toolbar p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                            {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => handleRangeChange(opt)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${dateRange === opt
                                        ? 'bg-primary text-ds-on-primary shadow-sm font-bold'
                                        : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                        }`}
                                >
                                    {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                                </button>
                            ))}
                        </div>

                        {/* Custom Date Pickers */}
                        {dateRange === 'custom' && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(toLocalDateString(d), endDate)} />
                                <span className="text-app-muted">-</span>
                                <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, toLocalDateString(d))} />
                            </div>
                        )}

                        {/* Show Building Filter only for Rental or General context */}
                        {context !== 'Project' && (
                            <div className="w-48 flex-shrink-0">
                                <ComboBox
                                    items={buildings}
                                    selectedId={selectedBuildingId}
                                    onSelect={(item) => setSelectedBuildingId(item?.id || 'all')}
                                    allowAddNew={false}
                                    placeholder="Filter Building"
                                />
                            </div>
                        )}

                        {/* Vendor Filter */}
                        <div className="w-48 flex-shrink-0">
                            <ComboBox
                                items={vendorItems}
                                selectedId={selectedVendorId}
                                onSelect={(item) => setSelectedVendorId(item?.id || 'all')}
                                allowAddNew={false}
                                placeholder="Filter Vendor"
                            />
                        </div>

                        {/* Search Input */}
                        <div className="relative flex-grow min-w-[180px]">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                                <span className="h-4 w-4">{ICONS.search}</span>
                            </div>
                            <Input
                                placeholder="Search report..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="ds-input-field pl-9 py-1.5 text-sm"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                                >
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </button>
                            )}
                        </div>

                        {/* Actions Group */}
                        <div className="flex items-center gap-2 ml-auto">
                            <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border">
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
                    <h3 className="text-2xl font-bold text-center mb-4 text-app-text">
                        Vendor Ledger {context ? `(${context})` : ''}
                    </h3>
                    <div className="text-center text-sm text-app-muted mb-6">
                        <p>{formatDate(startDate)} - {formatDate(endDate)}</p>
                        {selectedVendorId !== 'all' && <p className="font-semibold mt-1">Vendor: {vendors.find(v => v.id === selectedVendorId)?.name}</p>}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full divide-y divide-app-border text-sm table-fixed bg-app-card" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '10%' }} />
                                <col style={{ width: context !== 'Project' ? '15%' : '20%' }} />
                                {context !== 'Project' && <col style={{ width: '12%' }} />}
                                <col style={{ width: context !== 'Project' ? '28%' : '35%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '11%' }} />
                            </colgroup>
                            <thead className="bg-app-toolbar/40 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap">Date <SortIcon column="date" /></th>
                                    <th onClick={() => handleSort('vendorName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Vendor <SortIcon column="vendorName" /></th>
                                    {context !== 'Project' && <th onClick={() => handleSort('buildingName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Building <SortIcon column="buildingName" /></th>}
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Particulars <SortIcon column="particulars" /></th>
                                    <th onClick={() => handleSort('billAmount')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap">Bill Amount <SortIcon column="billAmount" /></th>
                                    <th onClick={() => handleSort('paidAmount')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap">Paid Amount <SortIcon column="paidAmount" /></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap">Balance <SortIcon column="balance" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                                {reportData.map(item => {
                                    const isClickable = !!(item.billId || item.transactionId);
                                    return (
                                        <tr
                                            key={item.id}
                                            className={`transition-colors ${isClickable ? 'cursor-pointer hover:bg-app-toolbar/50' : 'hover:bg-app-toolbar/30'}`}
                                            onClick={() => {
                                                if (item.billId) {
                                                    const bill = state.bills.find(b => b.id === item.billId);
                                                    if (bill) setBillToEdit(bill);
                                                } else if (item.transactionId) {
                                                    const transaction = state.transactions.find(t => t.id === item.transactionId);
                                                    if (transaction) setTransactionToEdit(transaction);
                                                }
                                            }}
                                        >
                                            <td className="px-3 py-2 whitespace-nowrap text-app-text overflow-hidden text-ellipsis">{formatDate(item.date)}</td>
                                            <td className="px-3 py-2 text-app-text overflow-hidden text-ellipsis" title={item.vendorName}>{item.vendorName}</td>
                                            {context !== 'Project' && <td className="px-3 py-2 text-app-muted text-xs overflow-hidden text-ellipsis" title={item.buildingName || '-'}>{item.buildingName || '-'}</td>}
                                            <td className="px-3 py-2 text-app-muted overflow-hidden text-ellipsis" title={item.particulars}>{item.particulars}</td>
                                            <td className="px-3 py-2 text-right text-app-text whitespace-nowrap">{item.billAmount > 0 ? `${CURRENCY} ${item.billAmount.toLocaleString()}` : '-'}</td>
                                            <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.paidAmount > 0 ? `${CURRENCY} ${item.paidAmount.toLocaleString()}` : '-'}</td>
                                            <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-app-text'}`}>{CURRENCY} {item.balance.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-app-toolbar/40 font-bold sticky bottom-0 border-t border-app-border shadow-[0_-1px_3px_rgba(0,0,0,0.15)]">
                                <tr>
                                    <td colSpan={context !== 'Project' ? 4 : 3} className="px-3 py-2 text-right text-sm text-app-text">Totals</td>
                                    <td className="px-3 py-2 text-right text-app-text whitespace-nowrap">{CURRENCY} {totals.bill.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {totals.paid.toLocaleString()}</td>
                                    <td className={`px-3 py-2 text-right text-sm whitespace-nowrap ${finalBalance > 0 ? 'text-danger' : 'text-app-text'}`}>
                                        {selectedVendorId !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {reportData.length === 0 && (
                        <div className="text-center py-16">
                            <p className="text-app-muted">No ledger transactions found for the selected criteria.</p>
                        </div>
                    )}
                    <ReportFooter />
                </Card>
            </div>

            {/* Edit Bill Modal */}
            <Modal
                isOpen={!!billToEdit}
                onClose={() => setBillToEdit(null)}
                title={billToEdit ? `Edit Bill #${billToEdit.billNumber}` : "Edit Bill"}
            >
                {billToEdit && (
                    <InvoiceBillForm
                        type="bill"
                        itemToEdit={billToEdit}
                        onClose={() => setBillToEdit(null)}
                        projectContext={context === 'Project'}
                        rentalContext={context === 'Rental'}
                    />
                )}
            </Modal>

            {/* Edit Transaction Modal */}
            <Modal
                isOpen={!!transactionToEdit}
                onClose={() => setTransactionToEdit(null)}
                title="Edit Payment"
            >
                {transactionToEdit && (
                    <TransactionForm
                        transactionToEdit={transactionToEdit}
                        transactionTypeForNew={null}
                        onClose={() => setTransactionToEdit(null)}
                        onShowDeleteWarning={() => { }}
                    />
                )}
            </Modal>
        </div>
    );
};

export default VendorLedgerReport;
