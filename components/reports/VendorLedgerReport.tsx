
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Bill, Transaction, TransactionType, Vendor } from '../../types';
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
import {
    prepaidAppliedToBillNotInTransactions,
    prepaidClearingDisplayDateForBill,
    VENDOR_LEDGER_MONEY_EPS,
} from '../../utils/vendorLedgerPrepaid';
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
    /** Same-day ordering: bill (0), prepaid clearing (1), bank payment (2). */
    sortTie?: number;
}

interface VendorLedgerReportProps {
    context?: 'Rental' | 'Project'; // Optional filtering context
}

type LedgerSort = { key: 'date'; direction: 'desc' } | null;

const formatLongDate = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return formatDate(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });
};

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
    const [treeSearchQuery, setTreeSearchQuery] = useState('');
    const [vendorsFolderExpanded, setVendorsFolderExpanded] = useState(true);
    /** null = chronological date ascending (default, correct running balance). Only `desc` is stored. */
    const [dateSort, setDateSort] = useState<LedgerSort>(null);

    // Editing state
    const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);

    // Select Lists
    const vendors = useMemo(() => state.vendors || [], [state.vendors]);
    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

    const vendorsSortedForTree = useMemo(() => {
        const q = treeSearchQuery.trim().toLowerCase();
        let list = [...vendors];
        if (q) list = list.filter(v => v.name.toLowerCase().includes(q));
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        return list;
    }, [vendors, treeSearchQuery]);

    const vendorsByLetter = useMemo(() => {
        const m = new Map<string, Vendor[]>();
        for (const v of vendorsSortedForTree) {
            const ch = (v.name.trim()[0] || '#').toUpperCase();
            const key = /^[A-Z]$/.test(ch) ? ch : '#';
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(v);
        }
        return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [vendorsSortedForTree]);

    const [letterExpanded, setLetterExpanded] = useState<Record<string, boolean>>({});

    const isLetterOpen = (letter: string) => letterExpanded[letter] !== false;

    const toggleLetter = (letter: string) => {
        setLetterExpanded(prev => ({ ...prev, [letter]: !(prev[letter] !== false) }));
    };

    const expandAllLetters = () => setLetterExpanded({});

    const collapseAllLetters = () => {
        const next: Record<string, boolean> = {};
        vendorsByLetter.forEach(([L]) => {
            next[L] = false;
        });
        setLetterExpanded(next);
    };

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

    const requestDateSortToggle = () => {
        setDateSort(current => (current?.direction === 'desc' ? null : { key: 'date', direction: 'desc' }));
    };

    const reportData = useMemo<VendorLedgerRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const items: {
            date: string;
            vendorId: string;
            particulars: string;
            bill: number;
            paid: number;
            buildingName: string;
            billId?: string;
            transactionId?: string;
            sortTie: number;
        }[] = [];

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
                    ,
                    sortTie: 0,
                });
            }
        });

        billsMap.forEach((bill) => {
            const vendorId = bill.vendorId;
            if (!vendorId) return;
            if (selectedVendorId !== 'all' && vendorId !== selectedVendorId) return;
            if (context === 'Project' && !bill.projectId) return;
            if (context === 'Rental' && (bill.projectId || (!bill.buildingId && !bill.propertyId))) return;
            const bId = getBuildingId(bill.buildingId, bill.propertyId);
            if (selectedBuildingId !== 'all' && bId !== selectedBuildingId) return;

            const prepaid = prepaidAppliedToBillNotInTransactions(bill, state.transactions);
            if (prepaid <= VENDOR_LEDGER_MONEY_EPS) return;

            const rowDate = prepaidClearingDisplayDateForBill(bill, state.transactions);
            const d = new Date(rowDate);
            if (d < start || d > end) return;

            items.push({
                date: rowDate,
                vendorId,
                particulars: `Supplier prepaid applied — Bill #${bill.billNumber}`,
                bill: 0,
                paid: prepaid,
                buildingName: getBuildingName(bill.buildingId, bill.propertyId),
                billId: bill.id,
                sortTie: 1,
            });
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
                            ,
                            sortTie: 2,
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
                vendorId: item.vendorId, // Store for grouping
                sortTie: item.sortTie,
            });
        });

        // Canonical sort: date ascending within vendor (when showing all vendors, group by vendor name)
        rows.sort((a, b) => {
            if (selectedVendorId === 'all') {
                const vendorCompare = a.vendorName.localeCompare(b.vendorName);
                if (vendorCompare !== 0) return vendorCompare;
            }

            const tA = new Date(a.date).getTime();
            const tB = new Date(b.date).getTime();
            if (tA !== tB) return tA - tB;
            const ta = a.sortTie ?? 0;
            const tb = b.sortTie ?? 0;
            if (ta !== tb) return ta - tb;
            return String(a.particulars).localeCompare(String(b.particulars));
        });

        let runningBalance = 0;
        let currentVendor = '';

        rows.forEach(row => {
            if (selectedVendorId === 'all' && row.vendorId !== currentVendor) {
                currentVendor = row.vendorId!;
                runningBalance = 0;
            }

            runningBalance += row.billAmount - row.paidAmount;
            row.balance = runningBalance;
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r =>
                r.vendorName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q) ||
                (r.buildingName && r.buildingName.toLowerCase().includes(q))
            );
        }

        if (dateSort?.key === 'date' && dateSort.direction === 'desc') {
            rows = [...rows].reverse();
        }

        return rows;

    }, [state, startDate, endDate, selectedVendorId, selectedBuildingId, searchQuery, context, vendors, dateSort]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            bill: acc.bill + curr.billAmount,
            paid: acc.paid + curr.paidAmount
        }), { bill: 0, paid: 0 });
    }, [reportData]);

    const selectionSummary = useMemo(() => {
        const vendorLabel =
            selectedVendorId === 'all'
                ? 'All vendors'
                : vendors.find(v => v.id === selectedVendorId)?.name ?? 'Selected vendor';
        const closing = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;
        return {
            vendorLabel,
            lineCount: reportData.length,
            totalBill: totals.bill,
            totalPaid: totals.paid,
            closing,
        };
    }, [reportData, selectedVendorId, vendors, totals.bill, totals.paid]);

    const finalBalance = selectionSummary.closing;

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


    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full min-h-0">
                <div className="flex-shrink-0 px-6 pt-5 pb-4 no-print">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-app-text tracking-tight">
                                Vendor Ledger{context ? ` (${context})` : ''}
                            </h1>
                            <div className="flex items-center gap-1.5 mt-1 text-sm text-app-muted">
                                <div className="w-4 h-4 opacity-60">{ICONS.calendar}</div>
                                <span>
                                    {formatLongDate(startDate)} – {formatLongDate(endDate)}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleExport}
                                className="whitespace-nowrap bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border"
                            >
                                <span className="w-4 h-4 mr-1 inline-flex">{ICONS.export}</span> Export
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

                <div className="flex-shrink-0 mx-6 mb-4 no-print">
                    <div className="bg-app-card rounded-xl border border-app-border px-5 py-3.5 flex flex-wrap items-center gap-3">
                        <div className="flex bg-app-toolbar p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                            {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleRangeChange(opt)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                        dateRange === opt
                                            ? 'bg-primary text-ds-on-primary shadow-sm font-bold'
                                            : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                    }`}
                                >
                                    {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                                </button>
                            ))}
                        </div>

                        {dateRange === 'custom' && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <DatePicker value={startDate} onChange={d => handleCustomDateChange(toLocalDateString(d), endDate)} />
                                <span className="text-app-muted">–</span>
                                <DatePicker value={endDate} onChange={d => handleCustomDateChange(startDate, toLocalDateString(d))} />
                            </div>
                        )}

                        {context !== 'Project' && (
                            <div className="w-48 flex-shrink-0">
                                <ComboBox
                                    items={buildings}
                                    selectedId={selectedBuildingId}
                                    onSelect={item => setSelectedBuildingId(item?.id || 'all')}
                                    allowAddNew={false}
                                    placeholder="All Buildings"
                                />
                            </div>
                        )}

                        <div className="relative flex-grow min-w-[180px] max-w-md ml-auto">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                                <span className="h-4 w-4">{ICONS.search}</span>
                            </div>
                            <Input
                                placeholder="Search ledger…"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="ds-input-field pl-9 py-1.5 text-sm"
                            />
                            {searchQuery ? (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                                >
                                    <span className="w-4 h-4">{ICONS.x}</span>
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex min-h-0 mx-6 mb-6 gap-4">
                    <aside className="no-print w-72 shrink-0 flex flex-col rounded-xl border border-app-border bg-app-card shadow-ds-card overflow-hidden min-h-0">
                        <div className="p-3 border-b border-app-border flex-shrink-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Vendor list</span>
                            <div className="relative mt-2">
                                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-app-muted">
                                    <span className="w-3.5 h-3.5">{ICONS.search}</span>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Find vendor…"
                                    value={treeSearchQuery}
                                    onChange={e => setTreeSearchQuery(e.target.value)}
                                    className="ds-input-field pl-8 pr-7 py-1.5 text-sm w-full rounded-md"
                                />
                                {treeSearchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => setTreeSearchQuery('')}
                                        className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                                        aria-label="Clear vendor search"
                                    >
                                        <span className="w-3.5 h-3.5">{ICONS.x}</span>
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto py-2 text-sm">
                            <button
                                type="button"
                                onClick={() => setSelectedVendorId('all')}
                                className={`mx-2 w-[calc(100%-1rem)] text-left px-3 py-2 rounded-lg transition-colors ${
                                    selectedVendorId === 'all'
                                        ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/25'
                                        : 'text-app-text hover:bg-app-toolbar/60'
                                }`}
                            >
                                All vendors
                                <span className="block text-[11px] font-normal text-app-muted mt-0.5">{vendors.length} on file</span>
                            </button>

                            <div className="mt-2 px-2">
                                <div className="flex items-center gap-1 px-1 py-1 rounded-md hover:bg-app-toolbar/30">
                                    <button
                                        type="button"
                                        onClick={() => setVendorsFolderExpanded(v => !v)}
                                        className="p-1 rounded text-app-muted hover:text-app-text hover:bg-app-toolbar/50"
                                        title={vendorsFolderExpanded ? 'Collapse group' : 'Expand group'}
                                    >
                                        <span className="text-[10px] w-4 inline-block text-center">{vendorsFolderExpanded ? '▼' : '▶'}</span>
                                    </button>
                                    <span className="text-xs font-semibold text-app-text truncate flex-1">Vendors ({vendorsSortedForTree.length})</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={expandAllLetters}
                                            className="text-[10px] px-1.5 py-0.5 rounded text-primary hover:bg-primary/10"
                                        >
                                            Expand all
                                        </button>
                                        <button
                                            type="button"
                                            onClick={collapseAllLetters}
                                            className="text-[10px] px-1.5 py-0.5 rounded text-app-muted hover:bg-app-toolbar/50"
                                        >
                                            Collapse all
                                        </button>
                                    </div>
                                </div>

                                {vendorsFolderExpanded ? (
                                    vendorsByLetter.length === 0 ? (
                                        <p className="px-3 py-4 text-xs text-app-muted text-center">No vendors match your search.</p>
                                    ) : (
                                        vendorsByLetter.map(([letter, list]) => (
                                            <div key={letter} className="mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleLetter(letter)}
                                                    className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-app-muted hover:text-app-text hover:bg-app-toolbar/40 rounded-md"
                                                >
                                                    <span className="w-4 text-center text-[10px]">{isLetterOpen(letter) ? '▼' : '▶'}</span>
                                                    <span>
                                                        {letter === '#' ? 'Other' : letter}
                                                        <span className="ml-1 font-normal opacity-70">({list.length})</span>
                                                    </span>
                                                </button>
                                                {isLetterOpen(letter) ? (
                                                    <ul className="mt-0.5 space-y-0.5 pl-3 border-l border-app-border/60 ml-3">
                                                        {list.map(v => (
                                                            <li key={v.id}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedVendorId(v.id)}
                                                                    className={`w-full text-left px-2 py-1.5 rounded-md truncate transition-colors ${
                                                                        selectedVendorId === v.id
                                                                            ? 'bg-primary/15 text-primary font-medium ring-1 ring-primary/20'
                                                                            : 'text-app-text hover:bg-app-toolbar/50'
                                                                    }`}
                                                                >
                                                                    {v.name}
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </div>
                                        ))
                                    )
                                ) : null}
                            </div>
                        </div>
                    </aside>

                    <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4 overflow-y-auto">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
                            <div className="bg-app-card rounded-xl border border-app-border p-4 shadow-ds-card">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">Total billed</span>
                                    <span className="text-[10px] font-medium text-app-muted truncate max-w-[55%]" title={selectionSummary.vendorLabel}>
                                        {selectionSummary.vendorLabel}
                                    </span>
                                </div>
                                <div className="text-xl font-bold text-app-text tabular-nums">
                                    {CURRENCY} {selectionSummary.totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-app-muted mt-1">Bill amount in selected period</p>
                            </div>
                            <div className="bg-app-card rounded-xl border border-app-border p-4 shadow-ds-card">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">Total paid</span>
                                    <span className="text-[10px] text-app-muted">
                                        {selectionSummary.lineCount} line{selectionSummary.lineCount !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="text-xl font-bold text-success tabular-nums">
                                    {CURRENCY} {selectionSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-app-muted mt-1">Payments in selected period</p>
                            </div>
                            <div className="bg-app-card rounded-xl border border-app-border border-l-[3px] border-l-primary p-4 shadow-ds-card">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">Closing balance</span>
                                </div>
                                <div
                                    className={`text-xl font-bold tabular-nums ${
                                        selectionSummary.closing > 0 ? 'text-danger' : 'text-app-text'
                                    }`}
                                >
                                    {selectedVendorId !== 'all'
                                        ? `${CURRENCY} ${selectionSummary.closing.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                        : '–'}
                                </div>
                                <p className="text-xs text-app-muted mt-1">
                                    {selectedVendorId !== 'all' ? 'After last row in table (period)' : 'Select a vendor for a running balance'}
                                </p>
                            </div>
                        </div>

                        <div id="printable-area" className="printable-area flex flex-col min-h-0">
                            <div className="hidden print:block">
                                <ReportHeader />
                                <div className="text-center mb-4">
                                    <h3 className="text-2xl font-bold text-app-text">
                                        Vendor Ledger{context ? ` (${context})` : ''}
                                    </h3>
                                    <p className="text-sm text-app-muted">
                                        {formatDate(startDate)} – {formatDate(endDate)}
                                    </p>
                                    {selectedVendorId !== 'all' && (
                                        <p className="text-sm text-app-muted font-semibold mt-1">
                                            Vendor: {vendors.find(v => v.id === selectedVendorId)?.name}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden flex-1 min-h-0 flex flex-col">
                                {reportData.length > 0 ? (
                                    <div className="overflow-x-auto flex-1 min-h-0">
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
                                                <th
                                                    onClick={requestDateSortToggle}
                                                    className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap"
                                                >
                                                    Date{' '}
                                                    <span className="text-[10px] text-primary">
                                                        {dateSort?.direction === 'desc' ? '▼' : '▲'}
                                                    </span>
                                                </th>
                                                <th className="px-3 py-2 text-left font-semibold text-app-muted select-none">Vendor</th>
                                                {context !== 'Project' && (
                                                    <th className="px-3 py-2 text-left font-semibold text-app-muted select-none">Building</th>
                                                )}
                                                <th className="px-3 py-2 text-left font-semibold text-app-muted select-none">Particulars</th>
                                                <th className="px-3 py-2 text-right font-semibold text-app-muted select-none whitespace-nowrap">
                                                    Bill Amount
                                                </th>
                                                <th className="px-3 py-2 text-right font-semibold text-app-muted select-none whitespace-nowrap">
                                                    Paid Amount
                                                </th>
                                                <th className="px-3 py-2 text-right font-semibold text-app-muted select-none whitespace-nowrap">
                                                    Balance
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-app-border">
                                            {reportData.map(item => {
                                                const isClickable = !!(item.billId || item.transactionId);
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        className={`transition-colors ${
                                                            isClickable ? 'cursor-pointer hover:bg-app-toolbar/50' : 'hover:bg-app-toolbar/30'
                                                        }`}
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
                                                        <td className="px-3 py-2 whitespace-nowrap text-app-text overflow-hidden text-ellipsis">
                                                            {formatDate(item.date)}
                                                        </td>
                                                        <td
                                                            className="px-3 py-2 text-app-text overflow-hidden text-ellipsis"
                                                            title={item.vendorName}
                                                        >
                                                            {item.vendorName}
                                                        </td>
                                                        {context !== 'Project' && (
                                                            <td
                                                                className="px-3 py-2 text-app-muted text-xs overflow-hidden text-ellipsis"
                                                                title={item.buildingName || '-'}
                                                            >
                                                                {item.buildingName || '-'}
                                                            </td>
                                                        )}
                                                        <td
                                                            className="px-3 py-2 text-app-muted overflow-hidden text-ellipsis"
                                                            title={item.particulars}
                                                        >
                                                            {item.particulars}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-app-text whitespace-nowrap">
                                                            {item.billAmount > 0 ? `${CURRENCY} ${item.billAmount.toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-success whitespace-nowrap">
                                                            {item.paidAmount > 0 ? `${CURRENCY} ${item.paidAmount.toLocaleString()}` : '-'}
                                                        </td>
                                                        <td
                                                            className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-app-text'}`}
                                                        >
                                                            {CURRENCY} {item.balance.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-app-toolbar/40 font-bold border-t border-app-border">
                                            <tr>
                                                <td
                                                    colSpan={context !== 'Project' ? 4 : 3}
                                                    className="px-3 py-2 text-right text-sm text-app-text"
                                                >
                                                    Totals
                                                </td>
                                                <td className="px-3 py-2 text-right text-app-text whitespace-nowrap">
                                                    {CURRENCY} {totals.bill.toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2 text-right text-success whitespace-nowrap">
                                                    {CURRENCY} {totals.paid.toLocaleString()}
                                                </td>
                                                <td
                                                    className={`px-3 py-2 text-right text-sm whitespace-nowrap ${finalBalance > 0 ? 'text-danger' : 'text-app-text'}`}
                                                >
                                                    {selectedVendorId !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                                </td>
                                            </tr>
                                        </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-16 px-4">
                                        <p className="text-app-muted">No ledger transactions found for the selected criteria.</p>
                                        <p className="text-app-muted/70 text-sm mt-1">Try another vendor, building, date range, or search.</p>
                                    </div>
                                )}
                            </div>
                            <div className="hidden print:block mt-4">
                                <ReportFooter />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={!!billToEdit}
                onClose={() => setBillToEdit(null)}
                title={billToEdit ? `Edit Bill #${billToEdit.billNumber}` : 'Edit Bill'}
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

            <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Payment">
                {transactionToEdit && (
                    <TransactionForm
                        transactionToEdit={transactionToEdit}
                        transactionTypeForNew={null}
                        onClose={() => setTransactionToEdit(null)}
                        onShowDeleteWarning={() => {}}
                    />
                )}
            </Modal>
        </>
    );
};

export default VendorLedgerReport;
