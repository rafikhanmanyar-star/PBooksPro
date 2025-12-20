
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
    buildingName: string;
    propertyName: string;
    ownerName: string;
    particulars: string;
    amount: number;
}

type SortKey = 'date' | 'buildingName' | 'propertyName' | 'ownerName' | 'particulars' | 'amount';

const ServiceChargesDeductionReport: React.FC = () => {
    const { state } = useAppContext();
    
    // Filters State
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' });

    // Dropdown Items
    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);
    const owners = useMemo(() => {
        const ownerContacts = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
        return [{ id: 'all', name: 'All Owners' }, ...ownerContacts];
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
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const reportData = useMemo<ReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const rentalIncomeCatId = state.categories.find(c => c.name === 'Rental Income')?.id;
        
        const deductionCategoryIds = new Set(state.categories
            .filter(c => c.type === TransactionType.EXPENSE && c.name.toLowerCase().includes('service charge'))
            .map(c => c.id));
        
        const legacyId = state.categories.find(c => c.name === 'Service Charge Deduction')?.id;
        if (legacyId) deductionCategoryIds.add(legacyId);

        const rows: ReportRow[] = [];

        state.transactions.forEach(tx => {
            const date = new Date(tx.date);
            if (date < start || date > end) return;

            let isDeduction = false;
            let amount = 0;

            if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCatId && tx.amount < 0) {
                isDeduction = true;
                amount = Math.abs(tx.amount);
            } else if (tx.type === TransactionType.EXPENSE && tx.categoryId && deductionCategoryIds.has(tx.categoryId)) {
                isDeduction = true;
                amount = tx.amount;
            }

            if (isDeduction) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                const building = state.buildings.find(b => b.id === (tx.buildingId || property?.buildingId));
                const owner = state.contacts.find(c => c.id === (tx.contactId || property?.ownerId));

                // Apply Filters
                if (selectedBuildingId !== 'all') {
                    if (building?.id !== selectedBuildingId) return;
                }
                if (selectedOwnerId !== 'all') {
                    if (owner?.id !== selectedOwnerId) return;
                }

                rows.push({
                    id: tx.id,
                    date: tx.date,
                    buildingName: building?.name || 'Unknown',
                    propertyName: property?.name || 'Unknown',
                    ownerName: owner?.name || 'Unknown',
                    particulars: tx.description || 'Service Charge Deduction',
                    amount
                });
            }
        });

        // Sorting
        if (sortConfig) {
            rows.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];

                if (sortConfig.key === 'date') {
                     return sortConfig.direction === 'asc' 
                        ? new Date(aVal as string).getTime() - new Date(bVal as string).getTime()
                        : new Date(bVal as string).getTime() - new Date(aVal as string).getTime();
                }

                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                }
                return 0;
            });
        } else {
            // Default Sort
            rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return rows.filter(r => r.ownerName.toLowerCase().includes(q) || r.propertyName.toLowerCase().includes(q));
        }

        return rows;
    }, [state, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, sortConfig]);

    const totalAmount = useMemo(() => reportData.reduce((sum, r) => sum + r.amount, 0), [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Building: r.buildingName,
            Property: r.propertyName,
            Owner: r.ownerName,
            Particulars: r.particulars,
            Amount: r.amount
        }));
        exportJsonToExcel(data, 'service-charges-report.xlsx', 'Deductions');
    };

    const handlePrint = () => window.print();

    const SortIcon = ({ column }: { column: keyof ReportRow }) => {
        if (sortConfig?.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

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
                        <h3 className="text-2xl font-bold text-slate-800">Service Charges Deduction Report</h3>
                        <p className="text-sm text-slate-500">
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
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('buildingName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Building <SortIcon column="buildingName"/></th>
                                    <th onClick={() => handleSort('propertyName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Property <SortIcon column="propertyName"/></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Owner <SortIcon column="ownerName"/></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('amount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Amount <SortIcon column="amount"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.buildingName}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.propertyName}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.ownerName}</td>
                                        <td className="px-3 py-2 max-w-xs truncate" title={item.particulars}>{item.particulars}</td>
                                        <td className="px-3 py-2 text-right font-medium text-slate-800">{CURRENCY} {(item.amount || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {reportData.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-8 text-slate-500">No records found for the selected criteria.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold sticky bottom-0 border-t border-slate-300">
                                <tr>
                                    <td colSpan={5} className="px-3 py-2 text-right">Total Deductions</td>
                                    <td className="px-3 py-2 text-right text-sm">{CURRENCY} {(totalAmount || 0).toLocaleString()}</td>
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

export default ServiceChargesDeductionReport;
