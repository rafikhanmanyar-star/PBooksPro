
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, InvoiceType, InvoiceStatus, ContactType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import Modal from '../ui/Modal';
import Tabs from '../ui/Tabs';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import DatePicker from '../ui/DatePicker';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface BuildingBMData {
    id: string;
    buildingName: string;
    collected: number;
    receivable: number;
    expenses: number;
    net: number;
}

type BMDetailKind = 'collected' | 'receivable' | 'expense';

interface BMDetailLine {
    id: string;
    kind: BMDetailKind;
    date: string;
    label: string;
    amount: number;
    reference?: string;
}

interface BMBuildingDetail {
    buildingId: string;
    buildingName: string;
    collected: BMDetailLine[];
    receivable: BMDetailLine[];
    expenses: BMDetailLine[];
}

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';
type SortKey = 'buildingName' | 'collected' | 'receivable' | 'expenses' | 'net';

const BMAnalysisReport: React.FC = () => {
    const { state } = useAppContext();
    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'buildingName', direction: 'asc' });
    const [detailBuildingId, setDetailBuildingId] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState('Collected');

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

    const { reportData, bmDetailsByBuilding } = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const buildingData: Record<string, BuildingBMData> = {};
        const detailsMap: Record<string, BMBuildingDetail> = {};

        // Initialize all buildings
        state.buildings.forEach(b => {
            if (selectedBuildingId !== 'all' && b.id !== selectedBuildingId) return;
            buildingData[b.id] = {
                id: b.id,
                buildingName: b.name,
                collected: 0,
                receivable: 0,
                expenses: 0,
                net: 0
            };
            detailsMap[b.id] = {
                buildingId: b.id,
                buildingName: b.name,
                collected: [],
                receivable: [],
                expenses: []
            };
        });

        // Categories definition - Broad matching for Service Income
        const serviceIncomeCatIds = new Set(state.categories
            .filter(c => c.type === TransactionType.INCOME && c.name.toLowerCase().includes('service charge'))
            .map(c => c.id));
        
        // Categories to EXCLUDE from Building Expenses (Owner/Tenant specific costs that shouldn't affect BM fund)
        const ownerExpenseCategoryNames = [
            'Owner Payout', 
            'Security Deposit Refund', 
            'Broker Fee',
            'Owner Security Payout'
        ];
        
        const getCategory = (id: string | undefined) => state.categories.find(c => c.id === id);
        
        const isOwnerExpense = (catId: string | undefined) => {
            const cat = getCategory(catId);
            if (!cat) return false;
            // Case insensitive check
            return ownerExpenseCategoryNames.some(n => n.toLowerCase() === cat.name.toLowerCase());
        };

        const isTenant = (contactId: string | undefined) => {
            if (!contactId) return false;
            const c = state.contacts.find(con => con.id === contactId);
            return c?.type === ContactType.TENANT;
        };

        const isTenantBill = (bill: typeof state.bills[0]) => {
            if (!bill.projectAgreementId) return false;
            return state.rentalAgreements.some(ra => ra.id === bill.projectAgreementId);
        };

        // 1. Process Transactions (Collected & Direct Expenses)
        state.transactions.forEach(tx => {
            const date = new Date(tx.date);
            if (date < start || date > end) return;

            // Income Logic
            let buildingId = tx.buildingId;
            if (!buildingId && tx.propertyId) {
                const prop = state.properties.find(p => p.id === tx.propertyId);
                if (prop) buildingId = prop.buildingId;
            }

            if (buildingId && buildingData[buildingId]) {
                if (tx.type === TransactionType.INCOME && tx.categoryId && serviceIncomeCatIds.has(tx.categoryId)) {
                    buildingData[buildingId].collected += tx.amount;
                    const catName = getCategory(tx.categoryId)?.name;
                    detailsMap[buildingId].collected.push({
                        id: `tx-income-${tx.id}`,
                        kind: 'collected',
                        date: tx.date,
                        label: tx.description?.trim() || catName || 'Service charge collection',
                        amount: tx.amount,
                        reference: tx.reference
                    });
                }
            }

            // Expense Logic (Direct Transactions without Bills)
            // Rule: Include if linked to Building AND NOT linked to a Property (Owner) AND NOT linked to a Tenant
            if (tx.type === TransactionType.EXPENSE && !tx.billId) {
                if (tx.buildingId && buildingData[tx.buildingId]) {
                    // Explicit exclusion of Property-linked expenses (Owner Cost Center)
                    if (tx.propertyId) return;
                    
                    // Explicit exclusion of Tenant-linked expenses (Tenant Cost Center)
                    if (isTenant(tx.contactId)) return;

                    if (!isOwnerExpense(tx.categoryId)) {
                        buildingData[tx.buildingId].expenses += tx.amount;
                        const catName = getCategory(tx.categoryId)?.name;
                        detailsMap[tx.buildingId].expenses.push({
                            id: `tx-exp-${tx.id}`,
                            kind: 'expense',
                            date: tx.date,
                            label: tx.description?.trim() || catName || 'Building expense',
                            amount: tx.amount,
                            reference: tx.reference
                        });
                    }
                }
            }
        });

        // 2. Process Bills (Incurred Expenses - Accrual Basis)
        state.bills.forEach(bill => {
            const date = new Date(bill.issueDate);
            if (date < start || date > end) return;

            // Expense Logic: Include if linked to Building
            if (bill.buildingId && buildingData[bill.buildingId]) {
                // Exclude Owner Bills (linked to Property)
                if (bill.propertyId) return;

                // Exclude Tenant Bills (linked to Rental Agreement)
                if (isTenantBill(bill)) return;

                // Handle expenseCategoryItems: process each category separately
                if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                    bill.expenseCategoryItems.forEach((item, idx) => {
                        if (!item.categoryId) return;
                        // Only add if it's not an owner expense
                        if (!isOwnerExpense(item.categoryId)) {
                            const amt = item.netValue || 0;
                            buildingData[bill.buildingId].expenses += amt;
                            const catName = getCategory(item.categoryId)?.name || 'Expense';
                            detailsMap[bill.buildingId].expenses.push({
                                id: `bill-${bill.id}-line-${idx}`,
                                kind: 'expense',
                                date: bill.issueDate,
                                label: `${catName}${bill.description ? ` — ${bill.description}` : ''}`,
                                amount: amt,
                                reference: bill.billNumber
                            });
                        }
                    });
                } else {
                    // Fallback to old categoryId logic
                    if (!isOwnerExpense(bill.categoryId)) {
                        buildingData[bill.buildingId].expenses += bill.amount;
                        const catName = getCategory(bill.categoryId)?.name || 'Expense';
                        detailsMap[bill.buildingId].expenses.push({
                            id: `bill-${bill.id}`,
                            kind: 'expense',
                            date: bill.issueDate,
                            label: bill.description?.trim() || catName,
                            amount: bill.amount,
                            reference: bill.billNumber
                        });
                    }
                }
            }
        });

        // 3. Process Invoices (Receivable)
        state.invoices.forEach(inv => {
            const date = new Date(inv.issueDate);
            if (date < start || date > end) return;

            if (inv.invoiceType === InvoiceType.RENTAL && inv.status !== InvoiceStatus.PAID && (inv.serviceCharges || 0) > 0) {
                let buildingId = inv.buildingId;
                if (!buildingId && inv.propertyId) {
                    const prop = state.properties.find(p => p.id === inv.propertyId);
                    if (prop) buildingId = prop.buildingId;
                }

                if (buildingId && buildingData[buildingId]) {
                    const sc = inv.serviceCharges || 0;
                    buildingData[buildingId].receivable += sc;
                    const tenantName = state.contacts.find(c => c.id === inv.contactId)?.name;
                    detailsMap[buildingId].receivable.push({
                        id: `inv-${inv.id}-sc`,
                        kind: 'receivable',
                        date: inv.issueDate,
                        label: tenantName ? `Service charges — ${tenantName}` : 'Outstanding service charges',
                        amount: sc,
                        reference: inv.invoiceNumber
                    });
                }
            }
        });

        let result = Object.values(buildingData).map(b => ({
            ...b,
            net: b.collected - b.expenses
        }));

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(b => b.buildingName.toLowerCase().includes(q));
        }

        // Apply Sorting
        result.sort((a, b) => {
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

        return { reportData: result, bmDetailsByBuilding: detailsMap };

    }, [state, startDate, endDate, selectedBuildingId, searchQuery, sortConfig]);

    const activeDetail = detailBuildingId ? bmDetailsByBuilding[detailBuildingId] : null;

    const sortDetailLines = (lines: BMDetailLine[]) =>
        [...lines].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            collected: acc.collected + curr.collected,
            receivable: acc.receivable + curr.receivable,
            expenses: acc.expenses + curr.expenses,
            net: acc.net + curr.net
        }), { collected: 0, receivable: 0, expenses: 0, net: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            'Building': r.buildingName,
            'Collected': r.collected,
            'Receivable (Arrears)': r.receivable,
            'Expenses': r.expenses,
            'Net Income': r.net
        }));
        exportJsonToExcel(data, 'bm-analysis-report.xlsx', 'BM Analysis');
    };

    const { print: triggerPrint } = usePrintContext();
    
    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-app-muted">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
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

                    {/* Custom Date Pickers */}
                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(toLocalDateString(d), endDate)} />
                            <span className="text-app-muted">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, toLocalDateString(d))} />
                        </div>
                    )}

                    {/* Building Filter */}
                    <div className="w-48 flex-shrink-0">
                        <ComboBox 
                            items={buildings} 
                            selectedId={selectedBuildingId} 
                            onSelect={(item) => setSelectedBuildingId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="Filter Building"
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

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-app-text">Building Maintenance Analysis</h3>
                        <p className="text-sm text-app-muted">
                            Service Charges Collection & Expenses • {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-ds-success/10 rounded-lg border border-ds-success/20 text-center">
                            <p className="text-xs text-ds-success font-bold uppercase">Collected</p>
                            <p className="text-lg font-bold text-ds-success">{CURRENCY} {totals.collected.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-ds-warning/10 rounded-lg border border-ds-warning/20 text-center">
                            <p className="text-xs text-ds-warning font-bold uppercase">Receivable</p>
                            <p className="text-lg font-bold text-ds-warning">{CURRENCY} {totals.receivable.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-ds-danger/10 rounded-lg border border-ds-danger/20 text-center">
                            <p className="text-xs text-ds-danger font-bold uppercase">Expenses</p>
                            <p className="text-lg font-bold text-ds-danger">{CURRENCY} {totals.expenses.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-app-toolbar/40 rounded-lg border border-app-border text-center">
                            <p className="text-xs text-app-muted font-bold uppercase">Net Fund Flow</p>
                            <p className={`text-lg font-bold ${totals.net >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                                {CURRENCY} {totals.net.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-app-border text-sm">
                            <thead className="bg-app-toolbar/40 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('buildingName')} className="px-4 py-3 text-left font-semibold text-app-muted uppercase tracking-wider text-xs cursor-pointer hover:bg-app-toolbar/60 select-none">Building <SortIcon column="buildingName"/></th>
                                    <th onClick={() => handleSort('collected')} className="px-4 py-3 text-right font-semibold text-app-muted uppercase tracking-wider text-xs cursor-pointer hover:bg-app-toolbar/60 select-none">Collected <SortIcon column="collected"/></th>
                                    <th onClick={() => handleSort('receivable')} className="px-4 py-3 text-right font-semibold text-app-muted uppercase tracking-wider text-xs cursor-pointer hover:bg-app-toolbar/60 select-none">Receivable <SortIcon column="receivable"/></th>
                                    <th onClick={() => handleSort('expenses')} className="px-4 py-3 text-right font-semibold text-app-muted uppercase tracking-wider text-xs cursor-pointer hover:bg-app-toolbar/60 select-none">Expenses <SortIcon column="expenses"/></th>
                                    <th onClick={() => handleSort('net')} className="px-4 py-3 text-right font-semibold text-app-muted uppercase tracking-wider text-xs cursor-pointer hover:bg-app-toolbar/60 select-none">Net Income/Loss <SortIcon column="net"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border bg-app-card">
                                {reportData.map(row => (
                                    <tr
                                        key={row.id}
                                        role="button"
                                        tabIndex={0}
                                        className="hover:bg-app-toolbar/40 transition-colors cursor-pointer"
                                        title="View transactions and invoices for this building"
                                        onClick={() => {
                                            setDetailTab('Collected');
                                            setDetailBuildingId(row.id);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setDetailTab('Collected');
                                                setDetailBuildingId(row.id);
                                            }
                                        }}
                                    >
                                        <td className="px-4 py-3 font-medium text-app-text whitespace-normal break-words">{row.buildingName}</td>
                                        <td className="px-4 py-3 text-right text-ds-success whitespace-nowrap">{CURRENCY} {row.collected.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-ds-warning whitespace-nowrap">{CURRENCY} {row.receivable.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-ds-danger whitespace-nowrap">{CURRENCY} {row.expenses.toLocaleString()}</td>
                                        <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${row.net >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                                            {CURRENCY} {row.net.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-app-muted">No data found for the selected criteria.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-app-toolbar/40 font-bold border-t border-app-border sticky bottom-0">
                                <tr>
                                    <td className="px-4 py-3 text-right text-app-text">TOTALS</td>
                                    <td className="px-4 py-3 text-right text-ds-success whitespace-nowrap">{CURRENCY} {totals.collected.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-ds-warning whitespace-nowrap">{CURRENCY} {totals.receivable.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-ds-danger whitespace-nowrap">{CURRENCY} {totals.expenses.toLocaleString()}</td>
                                    <td className={`px-4 py-3 text-right whitespace-nowrap ${totals.net >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>{CURRENCY} {totals.net.toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <ReportFooter />
                </Card>
            </div>

            <Modal
                isOpen={!!detailBuildingId && !!activeDetail}
                onClose={() => setDetailBuildingId(null)}
                title={activeDetail ? `${activeDetail.buildingName} — line items` : 'Building detail'}
                size="xl"
                className="no-print"
            >
                {activeDetail && (
                    <>
                        <p className="text-xs text-app-muted mb-3">
                            Period: {formatDate(startDate)} — {formatDate(endDate)}
                        </p>
                        <Tabs
                            tabs={['Collected', 'Receivable', 'Expenses']}
                            activeTab={detailTab}
                            onTabClick={setDetailTab}
                            variant="browser"
                            className="mb-4"
                        />
                        {(() => {
                            const lines =
                                detailTab === 'Collected'
                                    ? sortDetailLines(activeDetail.collected)
                                    : detailTab === 'Receivable'
                                      ? sortDetailLines(activeDetail.receivable)
                                      : sortDetailLines(activeDetail.expenses);
                            const amountClass =
                                detailTab === 'Collected'
                                    ? 'text-ds-success'
                                    : detailTab === 'Receivable'
                                      ? 'text-ds-warning'
                                      : 'text-ds-danger';
                            if (lines.length === 0) {
                                return (
                                    <p className="text-center py-8 text-app-muted">
                                        No items in this category for the selected period.
                                    </p>
                                );
                            }
                            const subtotal = lines.reduce((s, l) => s + l.amount, 0);
                            return (
                                <div className="overflow-x-auto max-h-[min(60vh,480px)] overflow-y-auto border border-app-border rounded-lg">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-app-toolbar/40 sticky top-0 z-[1]">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-app-muted uppercase tracking-wider">Date</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-app-muted uppercase tracking-wider">Particulars</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-app-muted uppercase tracking-wider">Reference</th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-app-muted uppercase tracking-wider">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-app-border bg-app-card">
                                            {lines.map(line => (
                                                <tr key={line.id}>
                                                    <td className="px-3 py-2 whitespace-nowrap text-app-text">{formatDate(line.date)}</td>
                                                    <td className="px-3 py-2 text-app-text">{line.label}</td>
                                                    <td className="px-3 py-2 text-app-muted">{line.reference ?? '—'}</td>
                                                    <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${amountClass}`}>
                                                        {CURRENCY} {line.amount.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-app-toolbar/40 font-semibold border-t border-app-border">
                                            <tr>
                                                <td colSpan={3} className="px-3 py-2 text-right text-app-text">Subtotal</td>
                                                <td className={`px-3 py-2 text-right whitespace-nowrap ${amountClass}`}>
                                                    {CURRENCY} {subtotal.toLocaleString()}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            );
                        })()}
                        <div className="flex justify-end mt-4">
                            <Button variant="secondary" onClick={() => setDetailBuildingId(null)}>Close</Button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default BMAnalysisReport;
