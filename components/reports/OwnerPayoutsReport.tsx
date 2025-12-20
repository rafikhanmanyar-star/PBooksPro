
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, ContactType } from '../../types';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';

interface ReportRow {
    id: string;
    date: string;
    ownerName: string;
    propertyName: string;
    particulars: string;
    rentIn: number;
    paidOut: number;
    balance: number;
}

type SortKey = 'date' | 'ownerName' | 'propertyName' | 'particulars' | 'rentIn' | 'paidOut' | 'balance';

const OwnerPayoutsReport: React.FC = () => {
    const { state } = useAppContext();
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);
    
    const owners = useMemo(() => {
        const relevantContacts = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
        return [{ id: 'all', name: 'All Owners' }, ...relevantContacts];
    }, [state.contacts]);

    const handleRangeChange = (option: ReportDateRange) => {
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

    const reportData = useMemo<ReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');

        if (!rentalIncomeCategory) return [];

        const items: any[] = [];

        // 1. Rental Income
        state.transactions
            .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id)
            .forEach(tx => {
                const date = new Date(tx.date);
                if (date >= start && date <= end && tx.propertyId) {
                    const property = state.properties.find(p => p.id === tx.propertyId);
                    const owner = state.contacts.find(c => c.id === property?.ownerId);
                    const buildingId = tx.buildingId || property?.buildingId;

                    // Filters
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                    if (selectedOwnerId !== 'all' && owner?.id !== selectedOwnerId) return;
                    
                    items.push({
                        id: tx.id,
                        date: tx.date,
                        ownerName: owner?.name || 'Unknown',
                        propertyName: property?.name || 'Unknown',
                        particulars: tx.description || 'Rent Collected',
                        rentIn: tx.amount,
                        paidOut: 0
                    });
                }
            });

        // 2. Expenses (Payouts, Fees, Repairs, General Property Expenses)
        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE)
            .forEach(tx => {
                const date = new Date(tx.date);
                if (date >= start && date <= end) {
                    let isRelevant = false;
                    let ownerId = tx.contactId;
                    let propertyId = tx.propertyId;
                    
                    // CRITICAL: If cost center is explicitly a Tenant, DO NOT include in owner report
                    if (tx.contactId) {
                        const contact = state.contacts.find(c => c.id === tx.contactId);
                        if (contact?.type === ContactType.TENANT) return;
                    }

                    // A. Direct Payouts (Category match)
                    if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                        isRelevant = true;
                    } 
                    // B. Expenses linked to a specific Property (Cost Center = Owner/Property)
                    else if (propertyId) {
                        const category = state.categories.find(c => c.id === tx.categoryId);
                        const isTenantExpense = category?.name.includes('(Tenant)') || category?.name === 'Security Deposit Refund';
                        
                        if (!isTenantExpense) {
                            isRelevant = true;
                        }
                    }

                    if (isRelevant) {
                        let propertyName = '-';
                        let buildingId = tx.buildingId;

                        if (propertyId) {
                            const property = state.properties.find(p => p.id === propertyId);
                            if (property) {
                                ownerId = property.ownerId; // Override contactId with property owner
                                propertyName = property.name;
                                if (!buildingId) buildingId = property.buildingId;
                            }
                        }
                        
                        // Apply Filters
                        if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                        if (selectedBuildingId !== 'all') {
                            if (buildingId !== selectedBuildingId) return;
                        }

                        const owner = state.contacts.find(c => c.id === ownerId);
                        
                        items.push({
                            id: tx.id,
                            date: tx.date,
                            ownerName: owner?.name || 'Unknown',
                            propertyName: propertyName,
                            particulars: tx.description || 'Expense/Payout',
                            rentIn: 0,
                            paidOut: tx.amount
                        });
                    }
                }
            });

        // Sort
        items.sort((a, b) => {
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

        let runningBalance = 0;
        let rows = items.map(item => {
            runningBalance += item.rentIn - item.paidOut;
            return { ...item, balance: runningBalance };
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r => 
                r.ownerName.toLowerCase().includes(q) || 
                r.propertyName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q)
            );
        }

        return rows;
    }, [state, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, sortConfig]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            totalIn: acc.totalIn + curr.rentIn,
            totalOut: acc.totalOut + curr.paidOut
        }), { totalIn: 0, totalOut: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Owner: r.ownerName,
            Property: r.propertyName,
            Particulars: r.particulars,
            'Rent Collected': r.rentIn,
            'Paid Out': r.paidOut,
            Balance: r.balance
        }));
        exportJsonToExcel(data, 'owner-income-report.xlsx', 'Owner Income');
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
            
            <div className="flex-shrink-0">
                <ReportToolbar
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleCustomDateChange}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onExport={handleExport}
                    onPrint={handlePrint}
                    showDateFilterPills={true}
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                >
                    <div className="w-48 flex-shrink-0">
                        <ComboBox 
                            label="Building"
                            items={buildings} 
                            selectedId={selectedBuildingId} 
                            onSelect={(item) => setSelectedBuildingId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="All Buildings"
                        />
                    </div>
                    <div className="w-48 flex-shrink-0">
                        <ComboBox 
                            label="Owner"
                            items={owners} 
                            selectedId={selectedOwnerId} 
                            onSelect={(item) => setSelectedOwnerId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="All Owners"
                        />
                    </div>
                </ReportToolbar>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Owner Income Report</h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all') && (
                            <p className="text-xs text-slate-400 mt-1">
                                Filters: 
                                {selectedBuildingId !== 'all' && ` Building: ${state.buildings.find(b=>b.id===selectedBuildingId)?.name} `}
                                {selectedOwnerId !== 'all' && ` Owner: ${state.contacts.find(c=>c.id===selectedOwnerId)?.name}`}
                            </p>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Owner <SortIcon column="ownerName"/></th>
                                    <th onClick={() => handleSort('propertyName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Property <SortIcon column="propertyName"/></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('rentIn')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Rent In <SortIcon column="rentIn"/></th>
                                    <th onClick={() => handleSort('paidOut')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Paid Out <SortIcon column="paidOut"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Balance <SortIcon column="balance"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words text-slate-700 max-w-[150px]">{item.ownerName}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words text-slate-700 max-w-[150px]">{item.propertyName}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words text-slate-600 max-w-xs" title={item.particulars}>{item.particulars}</td>
                                        <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.rentIn > 0 ? `${CURRENCY} ${(item.rentIn || 0).toLocaleString()}` : '-'}</td>
                                        <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{item.paidOut > 0 ? `${CURRENCY} ${(item.paidOut || 0).toLocaleString()}` : '-'}</td>
                                        <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance >= 0 ? 'text-slate-800' : 'text-danger'}`}>{CURRENCY} {(item.balance || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-8 text-center text-slate-500">No records found for the selected period.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold border-t border-slate-300 sticky bottom-0">
                                <tr>
                                    <td colSpan={4} className="px-3 py-2 text-right">Totals (Period)</td>
                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {(totals.totalIn || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{CURRENCY} {(totals.totalOut || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right"></td>
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

export default OwnerPayoutsReport;
