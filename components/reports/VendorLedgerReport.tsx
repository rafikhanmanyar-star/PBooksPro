
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType, InvoiceStatus } from '../../types';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';
import Button from '../ui/Button';

interface VendorLedgerRow {
    id: string;
    date: string;
    vendorName: string;
    particulars: string;
    buildingName?: string;
    billAmount: number; // Credit (Payable increases)
    paidAmount: number; // Debit (Payable decreases)
    balance: number;
}

interface VendorLedgerReportProps {
    context?: 'Rental' | 'Project'; // Optional filtering context
}

type SortKey = 'date' | 'vendorName' | 'particulars' | 'billAmount' | 'paidAmount' | 'balance' | 'buildingName';

const VendorLedgerReport: React.FC<VendorLedgerReportProps> = ({ context }) => {
    const { state } = useAppContext();
    
    // Filters
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    
    const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    // Select Lists
    const vendors = useMemo(() => state.contacts.filter(c => c.type === ContactType.VENDOR), [state.contacts]);
    const vendorItems = useMemo(() => [{ id: 'all', name: 'All Vendors' }, ...vendors], [vendors]);
    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

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

    const reportData = useMemo<VendorLedgerRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const items: { date: string, vendorId: string, particulars: string, bill: number, paid: number, buildingName: string }[] = [];

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
        state.bills.forEach(bill => {
            const date = new Date(bill.issueDate);
            if (date >= start && date <= end) {
                // Filter by context
                if (context === 'Project' && !bill.projectId) return;
                if (context === 'Rental' && (bill.projectId || (!bill.buildingId && !bill.propertyId))) return;

                // Filter by Building
                const bId = getBuildingId(bill.buildingId, bill.propertyId);
                if (selectedBuildingId !== 'all' && bId !== selectedBuildingId) return;

                items.push({
                    date: bill.issueDate,
                    vendorId: bill.contactId,
                    particulars: `Bill #${bill.billNumber} (${bill.description || '-'})`,
                    bill: bill.amount,
                    paid: 0,
                    buildingName: getBuildingName(bill.buildingId, bill.propertyId)
                });
            }
        });

        // 2. Payments (Debit - Liability Decreases)
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.contactId) {
                const vendor = vendors.find(v => v.id === tx.contactId);
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
                            vendorId: tx.contactId,
                            particulars: tx.description || 'Payment',
                            bill: 0,
                            paid: tx.amount,
                            buildingName: getBuildingName(tx.buildingId, tx.propertyId)
                        });
                    }
                }
            }
        });

        let rows: VendorLedgerRow[] = [];
        let runningBalance = 0;
        let currentVendor = '';
        
        // Pre-sort for balance calculation grouping
        const sortedByVendor = items.sort((a, b) => {
            const vA = vendors.find(v => v.id === a.vendorId)?.name || '';
            const vB = vendors.find(v => v.id === b.vendorId)?.name || '';
            return vA.localeCompare(vB) || new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        rows = sortedByVendor.map((item, index): VendorLedgerRow | null => {
            if (selectedVendorId === 'all' && item.vendorId !== currentVendor) {
                currentVendor = item.vendorId;
                runningBalance = 0;
            }
            
            runningBalance += item.bill - item.paid;
            const vendorName = vendors.find(v => v.id === item.vendorId)?.name || 'Unknown';
            
            if (selectedVendorId !== 'all' && item.vendorId !== selectedVendorId) return null;

            return {
                id: `${item.vendorId}-${index}`,
                date: item.date,
                vendorName,
                particulars: item.particulars,
                billAmount: item.bill,
                paidAmount: item.paid,
                balance: runningBalance,
                buildingName: item.buildingName
            };
        }).filter((r): r is VendorLedgerRow => r !== null);

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r => 
                r.vendorName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q) ||
                (r.buildingName && r.buildingName.toLowerCase().includes(q))
            );
        }

        // Final Visual Sort
        return rows.sort((a, b) => {
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
            {/* Custom Toolbar */}
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
                    {/* Show Building Filter only for Rental or General context */}
                    {context !== 'Project' && (
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
                    )}
                    
                    <div className="w-48 flex-shrink-0">
                        <ComboBox 
                            label="Vendor"
                            items={vendorItems} 
                            selectedId={selectedVendorId} 
                            onSelect={(item) => setSelectedVendorId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="All Vendors"
                        />
                    </div>
                </ReportToolbar>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0">
                <Card className="min-h-full">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-4">
                        Vendor Ledger {context ? `(${context})` : ''}
                    </h3>
                    <div className="text-center text-sm text-slate-500 mb-6">
                        <p>{formatDate(startDate)} - {formatDate(endDate)}</p>
                        {selectedVendorId !== 'all' && <p className="font-semibold mt-1">Vendor: {state.contacts.find(c=>c.id===selectedVendorId)?.name}</p>}
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('vendorName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Vendor <SortIcon column="vendorName"/></th>
                                    {context !== 'Project' && <th onClick={() => handleSort('buildingName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Building <SortIcon column="buildingName"/></th>}
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('billAmount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Bill Amount <SortIcon column="billAmount"/></th>
                                    <th onClick={() => handleSort('paidAmount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Paid Amount <SortIcon column="paidAmount"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Balance <SortIcon column="balance"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words text-slate-800">{item.vendorName}</td>
                                        {context !== 'Project' && <td className="px-3 py-2 whitespace-normal break-words text-slate-600 text-xs">{item.buildingName || '-'}</td>}
                                        <td className="px-3 py-2 max-w-xs whitespace-normal break-words text-slate-500">{item.particulars}</td>
                                        <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{item.billAmount > 0 ? `${CURRENCY} ${item.billAmount.toLocaleString()}` : '-'}</td>
                                        <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.paidAmount > 0 ? `${CURRENCY} ${item.paidAmount.toLocaleString()}` : '-'}</td>
                                        <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-slate-700'}`}>{CURRENCY} {item.balance.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.1)]">
                                <tr>
                                    <td colSpan={context !== 'Project' ? 4 : 3} className="px-3 py-2 text-right text-sm bg-slate-50">Totals</td>
                                    <td className="px-3 py-2 text-right text-slate-800 whitespace-nowrap">{CURRENCY} {totals.bill.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {totals.paid.toLocaleString()}</td>
                                    <td className={`px-3 py-2 text-right text-sm bg-slate-50 whitespace-nowrap ${finalBalance > 0 ? 'text-danger' : 'text-slate-800'}`}>
                                        {selectedVendorId !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {reportData.length === 0 && (
                         <div className="text-center py-16">
                            <p className="text-slate-500">No ledger transactions found for the selected criteria.</p>
                        </div>
                    )}
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default VendorLedgerReport;
