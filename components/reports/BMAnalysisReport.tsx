
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, InvoiceType, InvoiceStatus, ContactType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import DatePicker from '../ui/DatePicker';
import { formatDate } from '../../utils/dateUtils';

interface BuildingBMData {
    id: string;
    buildingName: string;
    collected: number;
    receivable: number;
    expenses: number;
    net: number;
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

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

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

    const reportData = useMemo<BuildingBMData[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const buildingData: Record<string, BuildingBMData> = {};

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
                    bill.expenseCategoryItems.forEach(item => {
                        if (!item.categoryId) return;
                        // Only add if it's not an owner expense
                        if (!isOwnerExpense(item.categoryId)) {
                            buildingData[bill.buildingId].expenses += (item.netValue || 0);
                        }
                    });
                } else {
                    // Fallback to old categoryId logic
                    if (!isOwnerExpense(bill.categoryId)) {
                        buildingData[bill.buildingId].expenses += bill.amount;
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
                    buildingData[buildingId].receivable += (inv.serviceCharges || 0);
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

        return result;

    }, [state, startDate, endDate, selectedBuildingId, searchQuery, sortConfig]);

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

    const handlePrint = () => window.print();
    
    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
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
                        <Button variant="secondary" size="sm" onClick={handlePrint} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                            <div className="w-4 h-4 mr-1">{ICONS.print}</div> Print
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Building Maintenance Analysis</h3>
                        <p className="text-sm text-slate-500">
                            Service Charges Collection & Expenses • {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                            <p className="text-xs text-emerald-600 font-bold uppercase">Collected</p>
                            <p className="text-lg font-bold text-emerald-700">{CURRENCY} {totals.collected.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 text-center">
                            <p className="text-xs text-amber-600 font-bold uppercase">Receivable</p>
                            <p className="text-lg font-bold text-amber-700">{CURRENCY} {totals.receivable.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-rose-50 rounded-lg border border-rose-100 text-center">
                            <p className="text-xs text-rose-600 font-bold uppercase">Expenses</p>
                            <p className="text-lg font-bold text-rose-700">{CURRENCY} {totals.expenses.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                            <p className="text-xs text-slate-500 font-bold uppercase">Net Fund Flow</p>
                            <p className={`text-lg font-bold ${totals.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                                {CURRENCY} {totals.net.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('buildingName')} className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">Building <SortIcon column="buildingName"/></th>
                                    <th onClick={() => handleSort('collected')} className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">Collected <SortIcon column="collected"/></th>
                                    <th onClick={() => handleSort('receivable')} className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">Receivable <SortIcon column="receivable"/></th>
                                    <th onClick={() => handleSort('expenses')} className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">Expenses <SortIcon column="expenses"/></th>
                                    <th onClick={() => handleSort('net')} className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">Net Income/Loss <SortIcon column="net"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(row => (
                                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-normal break-words">{row.buildingName}</td>
                                        <td className="px-4 py-3 text-right text-emerald-600 whitespace-nowrap">{CURRENCY} {row.collected.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-amber-600 whitespace-nowrap">{CURRENCY} {row.receivable.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-rose-600 whitespace-nowrap">{CURRENCY} {row.expenses.toLocaleString()}</td>
                                        <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${row.net >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>
                                            {CURRENCY} {row.net.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No data found for the selected criteria.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold border-t border-slate-300 sticky bottom-0">
                                <tr>
                                    <td className="px-4 py-3 text-right">TOTALS</td>
                                    <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">{CURRENCY} {totals.collected.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-amber-700 whitespace-nowrap">{CURRENCY} {totals.receivable.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-rose-700 whitespace-nowrap">{CURRENCY} {totals.expenses.toLocaleString()}</td>
                                    <td className={`px-4 py-3 text-right whitespace-nowrap ${totals.net >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{CURRENCY} {totals.net.toLocaleString()}</td>
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

export default BMAnalysisReport;
