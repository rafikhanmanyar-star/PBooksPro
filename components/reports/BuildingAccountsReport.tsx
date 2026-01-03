
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, InvoiceType, InvoiceStatus } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate } from '../../utils/dateUtils';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface BuildingAnalysisRow {
    buildingId: string;
    buildingName: string;
    // Rents
    rentCollected: number;
    rentArrears: number;
    // Security
    securityCollected: number;
    securityArrears: number;
    // Services
    serviceCollected: number;
    serviceArrears: number;
    // Payments
    rentPaidOut: number; // Owner Payout
    securityPaidOut: number; // Refund
    // Expenses
    ownerExpenses: number;
    tenantExpenses: number;
    
    netFlow: number; // Calculated as (All Collected - All Paid Out - Expenses)
}

type SortKey = 'buildingName' | 'rentCollected' | 'rentArrears' | 'securityCollected' | 'securityArrears' | 'serviceCollected' | 'serviceArrears' | 'rentPaidOut' | 'securityPaidOut' | 'ownerExpenses' | 'tenantExpenses' | 'netFlow';

const BuildingAccountsReport: React.FC = () => {
    const { state } = useAppContext();
    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    
    // Sorting
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

    const reportData = useMemo<BuildingAnalysisRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const buildingMap: Record<string, BuildingAnalysisRow> = {};
        
        // Initialize map
        state.buildings.forEach(b => {
            if (selectedBuildingId !== 'all' && b.id !== selectedBuildingId) return;
            buildingMap[b.id] = {
                buildingId: b.id,
                buildingName: b.name,
                rentCollected: 0,
                rentArrears: 0,
                securityCollected: 0,
                securityArrears: 0,
                serviceCollected: 0,
                serviceArrears: 0,
                rentPaidOut: 0,
                securityPaidOut: 0,
                ownerExpenses: 0,
                tenantExpenses: 0,
                netFlow: 0
            };
        });

        // Helper: Map Categories
        const cats = {
            rentInc: state.categories.find(c => c.name === 'Rental Income')?.id,
            secDep: state.categories.find(c => c.name === 'Security Deposit')?.id,
            svcInc: state.categories.find(c => c.name === 'Service Charge Income')?.id,
            ownPay: state.categories.find(c => c.name === 'Owner Payout')?.id,
            secRef: state.categories.find(c => c.name === 'Security Deposit Refund')?.id,
            ownSecPay: state.categories.find(c => c.name === 'Owner Security Payout')?.id,
            repOwn: state.categories.find(c => c.name === 'Property Repair (Owner)')?.id,
            repTen: state.categories.find(c => c.name === 'Property Repair (Tenant)')?.id,
            brokFee: state.categories.find(c => c.name === 'Broker Fee')?.id,
            bldMaint: state.categories.find(c => c.name === 'Building Maintenance')?.id,
            bldUtil: state.categories.find(c => c.name === 'Building Utilities')?.id,
        };
        
        // 1. Process Transactions
        state.transactions.forEach(tx => {
            const date = new Date(tx.date);
            if (date < start || date > end) return;

            let bId = tx.buildingId;
            if (!bId && tx.propertyId) {
                const p = state.properties.find(p => p.id === tx.propertyId);
                if (p) bId = p.buildingId;
            }

            if (bId && buildingMap[bId]) {
                const row = buildingMap[bId];
                const amt = tx.amount;

                if (tx.type === TransactionType.INCOME) {
                    if (tx.categoryId === cats.rentInc) row.rentCollected += amt;
                    else if (tx.categoryId === cats.secDep) row.securityCollected += amt;
                    else if (tx.categoryId === cats.svcInc) row.serviceCollected += amt;
                } else if (tx.type === TransactionType.EXPENSE) {
                    if (tx.categoryId === cats.ownPay) row.rentPaidOut += amt;
                    else if (tx.categoryId === cats.secRef || tx.categoryId === cats.ownSecPay) row.securityPaidOut += amt;
                    else if (tx.categoryId === cats.repTen) row.tenantExpenses += amt;
                    else if ([cats.repOwn, cats.brokFee, cats.bldMaint, cats.bldUtil].includes(tx.categoryId)) row.ownerExpenses += amt;
                }
            }
        });

        // 2. Process Invoices for Arrears
        // Arrears = (Amount - PaidAmount). We distribute this proportionally to components.
        state.invoices.forEach(inv => {
            // Filter by date range? "Arrears" usually implies outstanding at snapshot, but for "Analysis" in a period,
            // we usually look at invoices ISSUED in that period that are unpaid.
            const date = new Date(inv.issueDate);
            if (date < start || date > end) return;
            if (inv.invoiceType !== InvoiceType.RENTAL && inv.invoiceType !== InvoiceType.SERVICE_CHARGE) return;
            if (inv.status === InvoiceStatus.PAID) return;

            let bId = inv.buildingId;
            if (!bId && inv.propertyId) {
                const p = state.properties.find(p => p.id === inv.propertyId);
                if (p) bId = p.buildingId;
            }

            if (bId && buildingMap[bId]) {
                const row = buildingMap[bId];
                const outstanding = inv.amount - inv.paidAmount;
                if (outstanding <= 0) return;

                const sec = inv.securityDepositCharge || 0;
                const svc = inv.serviceCharges || 0;
                const rent = inv.amount - sec - svc;

                // Avoid division by zero
                if (inv.amount > 0) {
                    const ratio = outstanding / inv.amount;
                    row.rentArrears += (rent * ratio);
                    row.securityArrears += (sec * ratio);
                    row.serviceArrears += (svc * ratio);
                }
            }
        });

        // 3. Calculate Net Flow and Sort
        let rows = Object.values(buildingMap).map(row => {
            const totalIn = row.rentCollected + row.securityCollected + row.serviceCollected;
            const totalOut = row.rentPaidOut + row.securityPaidOut + row.ownerExpenses + row.tenantExpenses;
            row.netFlow = totalIn - totalOut;
            return row;
        });
        
        // Sorting logic
        rows.sort((a, b) => {
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
        
        return rows;

    }, [state, startDate, endDate, selectedBuildingId, sortConfig]);

    const filteredData = useMemo(() => {
        if (!searchQuery) return reportData;
        const q = searchQuery.toLowerCase();
        return reportData.filter(r => r.buildingName.toLowerCase().includes(q));
    }, [reportData, searchQuery]);

    const totals = useMemo(() => {
        return filteredData.reduce((acc, curr) => ({
            rentCollected: acc.rentCollected + curr.rentCollected,
            rentArrears: acc.rentArrears + curr.rentArrears,
            securityCollected: acc.securityCollected + curr.securityCollected,
            securityArrears: acc.securityArrears + curr.securityArrears,
            serviceCollected: acc.serviceCollected + curr.serviceCollected,
            serviceArrears: acc.serviceArrears + curr.serviceArrears,
            rentPaidOut: acc.rentPaidOut + curr.rentPaidOut,
            securityPaidOut: acc.securityPaidOut + curr.securityPaidOut,
            ownerExpenses: acc.ownerExpenses + curr.ownerExpenses,
            tenantExpenses: acc.tenantExpenses + curr.tenantExpenses,
            netFlow: acc.netFlow + curr.netFlow,
        }), { 
            rentCollected: 0, rentArrears: 0, securityCollected: 0, securityArrears: 0, 
            serviceCollected: 0, serviceArrears: 0, rentPaidOut: 0, securityPaidOut: 0, 
            ownerExpenses: 0, tenantExpenses: 0, netFlow: 0 
        });
    }, [filteredData]);

    const handleExport = () => {
        const data = filteredData.map(r => ({
            'Building': r.buildingName,
            'Rent Collected': r.rentCollected,
            'Rent Arrears': r.rentArrears,
            'Security Collected': r.securityCollected,
            'Security Arrears': r.securityArrears,
            'Service Collected': r.serviceCollected,
            'Service Arrears': r.serviceArrears,
            'Rent Paid (Owner)': r.rentPaidOut,
            'Security Paid (Refund)': r.securityPaidOut,
            'Owner Expenses': r.ownerExpenses,
            'Tenant Expenses': r.tenantExpenses,
            'Net Cash Flow': r.netFlow
        }));
        exportJsonToExcel(data, 'building-analysis-report.xlsx', 'Analysis');
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

            {/* Report Content */}
            <div className="flex-grow overflow-y-auto printable-area min-h-0">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Detailed Building Analysis</h3>
                        <p className="text-sm text-slate-500">
                            {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th rowSpan={2} className="px-3 py-2 text-left font-bold text-slate-700 border-r border-slate-200 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('buildingName')}>
                                        Building <SortIcon column="buildingName"/>
                                    </th>
                                    <th colSpan={2} className="px-2 py-1 text-center font-semibold text-slate-600 border-b border-r border-slate-200 bg-blue-50/50">Rents</th>
                                    <th colSpan={2} className="px-2 py-1 text-center font-semibold text-slate-600 border-b border-r border-slate-200 bg-purple-50/50">Security</th>
                                    <th colSpan={2} className="px-2 py-1 text-center font-semibold text-slate-600 border-b border-r border-slate-200 bg-amber-50/50">Services</th>
                                    <th colSpan={2} className="px-2 py-1 text-center font-semibold text-slate-600 border-b border-r border-slate-200 bg-emerald-50/50">Paid Out</th>
                                    <th colSpan={2} className="px-2 py-1 text-center font-semibold text-slate-600 border-b border-r border-slate-200 bg-rose-50/50">Expenses</th>
                                    <th rowSpan={2} className="px-3 py-2 text-right font-bold text-slate-700 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('netFlow')}>
                                        Net Flow <SortIcon column="netFlow"/>
                                    </th>
                                </tr>
                                <tr>
                                    {/* Sub Headers */}
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-blue-50/30 border-r border-slate-100 cursor-pointer hover:bg-blue-100/30" onClick={() => handleSort('rentCollected')}>Col <SortIcon column="rentCollected"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-blue-50/30 border-r border-slate-200 cursor-pointer hover:bg-blue-100/30" onClick={() => handleSort('rentArrears')}>Arr <SortIcon column="rentArrears"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-purple-50/30 border-r border-slate-100 cursor-pointer hover:bg-purple-100/30" onClick={() => handleSort('securityCollected')}>Col <SortIcon column="securityCollected"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-purple-50/30 border-r border-slate-200 cursor-pointer hover:bg-purple-100/30" onClick={() => handleSort('securityArrears')}>Arr <SortIcon column="securityArrears"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-amber-50/30 border-r border-slate-100 cursor-pointer hover:bg-amber-100/30" onClick={() => handleSort('serviceCollected')}>Col <SortIcon column="serviceCollected"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-amber-50/30 border-r border-slate-200 cursor-pointer hover:bg-amber-100/30" onClick={() => handleSort('serviceArrears')}>Arr <SortIcon column="serviceArrears"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-emerald-50/30 border-r border-slate-100 cursor-pointer hover:bg-emerald-100/30" onClick={() => handleSort('rentPaidOut')}>Rent <SortIcon column="rentPaidOut"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-emerald-50/30 border-r border-slate-200 cursor-pointer hover:bg-emerald-100/30" onClick={() => handleSort('securityPaidOut')}>Sec <SortIcon column="securityPaidOut"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-rose-50/30 border-r border-slate-100 cursor-pointer hover:bg-rose-100/30" onClick={() => handleSort('ownerExpenses')}>Own <SortIcon column="ownerExpenses"/></th>
                                    <th className="px-2 py-1 text-right font-medium text-slate-500 bg-rose-50/30 border-r border-slate-200 cursor-pointer hover:bg-rose-100/30" onClick={() => handleSort('tenantExpenses')}>Ten <SortIcon column="tenantExpenses"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {filteredData.map(row => (
                                    <tr key={row.buildingId} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-medium text-slate-800 border-r border-slate-100 min-w-[150px] whitespace-normal break-words">{row.buildingName}</td>
                                        
                                        <td className="px-2 py-2 text-right text-slate-700 bg-blue-50/10 whitespace-nowrap">{row.rentCollected.toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-rose-500 bg-blue-50/10 border-r border-slate-100 whitespace-nowrap">{row.rentArrears > 0 ? row.rentArrears.toLocaleString() : '-'}</td>
                                        
                                        <td className="px-2 py-2 text-right text-slate-700 bg-purple-50/10 whitespace-nowrap">{row.securityCollected.toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-rose-500 bg-purple-50/10 border-r border-slate-100 whitespace-nowrap">{row.securityArrears > 0 ? row.securityArrears.toLocaleString() : '-'}</td>
                                        
                                        <td className="px-2 py-2 text-right text-slate-700 bg-amber-50/10 whitespace-nowrap">{row.serviceCollected.toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-rose-500 bg-amber-50/10 border-r border-slate-100 whitespace-nowrap">{row.serviceArrears > 0 ? row.serviceArrears.toLocaleString() : '-'}</td>
                                        
                                        <td className="px-2 py-2 text-right text-slate-600 bg-emerald-50/10 whitespace-nowrap">{row.rentPaidOut.toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-slate-600 bg-emerald-50/10 border-r border-slate-100 whitespace-nowrap">{row.securityPaidOut.toLocaleString()}</td>
                                        
                                        <td className="px-2 py-2 text-right text-slate-600 bg-rose-50/10 whitespace-nowrap">{row.ownerExpenses.toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-slate-600 bg-rose-50/10 border-r border-slate-100 whitespace-nowrap">{row.tenantExpenses.toLocaleString()}</td>
                                        
                                        <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${row.netFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {row.netFlow.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {filteredData.length === 0 && (
                                    <tr><td colSpan={12} className="text-center py-8 text-slate-500">No data found.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-100 font-bold border-t border-slate-300 sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.1)]">
                                <tr>
                                    <td className="px-3 py-2 border-r border-slate-200">TOTALS</td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap">{totals.rentCollected.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right text-rose-600 border-r border-slate-200 whitespace-nowrap">{totals.rentArrears.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap">{totals.securityCollected.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right text-rose-600 border-r border-slate-200 whitespace-nowrap">{totals.securityArrears.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap">{totals.serviceCollected.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right text-rose-600 border-r border-slate-200 whitespace-nowrap">{totals.serviceArrears.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap">{totals.rentPaidOut.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right border-r border-slate-200 whitespace-nowrap">{totals.securityPaidOut.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap">{totals.ownerExpenses.toLocaleString()}</td>
                                    <td className="px-2 py-2 text-right border-r border-slate-200 whitespace-nowrap">{totals.tenantExpenses.toLocaleString()}</td>
                                    <td className={`px-3 py-2 text-right whitespace-nowrap ${totals.netFlow >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>{totals.netFlow.toLocaleString()}</td>
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

export default BuildingAccountsReport;
