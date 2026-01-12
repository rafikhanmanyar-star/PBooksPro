
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RentalAgreementStatus } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate } from '../../utils/dateUtils';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

interface AgreementExpiryRow {
    id: string;
    agreementNumber: string;
    propertyName: string;
    buildingName: string;
    tenantName: string;
    monthlyRent: number;
    endDate: string;
    daysUntilExpiry: number;
    expiryBucket: '1 Month' | '2 Months' | '3 Months';
}

type SortKey = 'propertyName' | 'tenantName' | 'monthlyRent' | 'endDate' | 'daysUntilExpiry';

const AgreementExpiryReport: React.FC = () => {
    const { state } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ 
        key: 'daysUntilExpiry', 
        direction: 'asc' 
    });

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const reportData = useMemo<AgreementExpiryRow[]>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Calculate date thresholds
        const oneMonthFromNow = new Date(today);
        oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
        
        const twoMonthsFromNow = new Date(today);
        twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
        
        const threeMonthsFromNow = new Date(today);
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

        // Filter active agreements expiring in next 3 months
        const expiringAgreements = state.rentalAgreements
            .filter(agreement => {
                if (agreement.status !== RentalAgreementStatus.ACTIVE) return false;
                
                const endDate = new Date(agreement.endDate);
                endDate.setHours(23, 59, 59, 999);
                
                return endDate >= today && endDate <= threeMonthsFromNow;
            });

        let result: AgreementExpiryRow[] = expiringAgreements.map(agreement => {
            const property = state.properties.find(p => p.id === agreement.propertyId);
            const building = property ? state.buildings.find(b => b.id === property.buildingId) : null;
            const tenant = state.contacts.find(c => c.id === agreement.tenantId);
            
            const endDate = new Date(agreement.endDate);
            endDate.setHours(23, 59, 59, 999);
            
            const timeDiff = endDate.getTime() - today.getTime();
            const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 3600 * 24));
            
            // Determine bucket
            let expiryBucket: '1 Month' | '2 Months' | '3 Months';
            if (daysUntilExpiry <= 30) {
                expiryBucket = '1 Month';
            } else if (daysUntilExpiry <= 60) {
                expiryBucket = '2 Months';
            } else {
                expiryBucket = '3 Months';
            }

            return {
                id: agreement.id,
                agreementNumber: agreement.agreementNumber,
                propertyName: property?.name || 'Unknown',
                buildingName: building?.name || 'N/A',
                tenantName: tenant?.name || 'Unknown',
                monthlyRent: agreement.monthlyRent,
                endDate: agreement.endDate,
                daysUntilExpiry,
                expiryBucket
            };
        });

        // Apply building filter
        if (selectedBuildingId !== 'all') {
            result = result.filter(row => {
                const property = state.properties.find(p => p.name === row.propertyName);
                return property?.buildingId === selectedBuildingId;
            });
        }

        // Apply search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(row => 
                row.propertyName.toLowerCase().includes(q) ||
                row.tenantName.toLowerCase().includes(q) ||
                row.agreementNumber.toLowerCase().includes(q)
            );
        }

        // Apply sorting
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
    }, [state, selectedBuildingId, searchQuery, sortConfig]);

    // Chart data
    const chartData = useMemo(() => {
        const buckets = {
            '1 Month': { count: 0, rent: 0 },
            '2 Months': { count: 0, rent: 0 },
            '3 Months': { count: 0, rent: 0 }
        };

        reportData.forEach(row => {
            buckets[row.expiryBucket].count += 1;
            buckets[row.expiryBucket].rent += row.monthlyRent;
        });

        return [
            { name: '1 Month', count: buckets['1 Month'].count, rent: buckets['1 Month'].rent },
            { name: '2 Months', count: buckets['2 Months'].count, rent: buckets['2 Months'].rent },
            { name: '3 Months', count: buckets['3 Months'].count, rent: buckets['3 Months'].rent }
        ];
    }, [reportData]);

    const totals = useMemo(() => {
        return {
            count: reportData.length,
            totalRent: reportData.reduce((sum, row) => sum + row.monthlyRent, 0)
        };
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            'Agreement Number': r.agreementNumber,
            'Property': r.propertyName,
            'Building': r.buildingName,
            'Tenant': r.tenantName,
            'Monthly Rent': r.monthlyRent,
            'End Date': formatDate(r.endDate),
            'Days Until Expiry': r.daysUntilExpiry,
            'Expiry Period': r.expiryBucket
        }));
        exportJsonToExcel(data, 'agreement-expiry-report.xlsx', 'Agreement Expiry');
    };

    const { handlePrint } = usePrint();
    
    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const CHART_COLORS = {
        '1 Month': '#ef4444', // red
        '2 Months': '#f59e0b', // amber
        '3 Months': '#22c55e' // green
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
            
            {/* Toolbar */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
                <div className="flex flex-wrap items-center gap-3">
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
                            placeholder="Search property, tenant, or agreement..." 
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
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={handlePrint}
                            className="whitespace-nowrap"
                        />
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Agreement Expiry Report</h3>
                        <p className="text-sm text-slate-500">
                            Rental Agreements Expiring in Next 1, 2, and 3 Months
                        </p>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                            <p className="text-xs text-slate-500 font-bold uppercase">Total Expiring</p>
                            <p className="text-2xl font-bold text-slate-800">{totals.count}</p>
                        </div>
                        <div className="p-4 bg-red-50 rounded-lg border border-red-100 text-center">
                            <p className="text-xs text-red-600 font-bold uppercase">1 Month</p>
                            <p className="text-2xl font-bold text-red-700">{chartData[0].count}</p>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 text-center">
                            <p className="text-xs text-amber-600 font-bold uppercase">2 Months</p>
                            <p className="text-2xl font-bold text-amber-700">{chartData[1].count}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                            <p className="text-xs text-emerald-600 font-bold uppercase">3 Months</p>
                            <p className="text-2xl font-bold text-emerald-700">{chartData[2].count}</p>
                        </div>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Count Chart */}
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <h4 className="text-center font-semibold text-slate-700 mb-4">Properties by Expiry Period</h4>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '12px' }} />
                                    <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#fff', 
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '12px'
                                        }}
                                    />
                                    <Bar dataKey="count" fill="#64748b" radius={[8, 8, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={Object.values(CHART_COLORS)[index]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Rent Chart */}
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <h4 className="text-center font-semibold text-slate-700 mb-4">Total Monthly Rent at Risk</h4>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '12px' }} />
                                    <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                                    <Tooltip 
                                        formatter={(value: number) => `${CURRENCY} ${value.toLocaleString()}`}
                                        contentStyle={{ 
                                            backgroundColor: '#fff', 
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '12px'
                                        }}
                                    />
                                    <Bar dataKey="rent" fill="#64748b" radius={[8, 8, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={Object.values(CHART_COLORS)[index]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs">Agreement</th>
                                    <th onClick={() => handleSort('propertyName')} className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">
                                        Property <SortIcon column="propertyName"/>
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs">Building</th>
                                    <th onClick={() => handleSort('tenantName')} className="px-4 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">
                                        Tenant <SortIcon column="tenantName"/>
                                    </th>
                                    <th onClick={() => handleSort('monthlyRent')} className="px-4 py-3 text-right font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">
                                        Monthly Rent <SortIcon column="monthlyRent"/>
                                    </th>
                                    <th onClick={() => handleSort('endDate')} className="px-4 py-3 text-center font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">
                                        End Date <SortIcon column="endDate"/>
                                    </th>
                                    <th onClick={() => handleSort('daysUntilExpiry')} className="px-4 py-3 text-center font-semibold text-slate-600 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 select-none">
                                        Days Left <SortIcon column="daysUntilExpiry"/>
                                    </th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600 uppercase tracking-wider text-xs">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {reportData.map(row => (
                                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{row.agreementNumber}</td>
                                        <td className="px-4 py-3 text-slate-800 whitespace-normal break-words">{row.propertyName}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-normal break-words">{row.buildingName}</td>
                                        <td className="px-4 py-3 text-slate-800 whitespace-normal break-words">{row.tenantName}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                                            {CURRENCY} {row.monthlyRent.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{formatDate(row.endDate)}</td>
                                        <td className="px-4 py-3 text-center whitespace-nowrap">
                                            <span className={`font-bold ${
                                                row.daysUntilExpiry <= 30 ? 'text-red-600' : 
                                                row.daysUntilExpiry <= 60 ? 'text-amber-600' : 
                                                'text-emerald-600'
                                            }`}>
                                                {row.daysUntilExpiry}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                row.expiryBucket === '1 Month' ? 'bg-red-100 text-red-800' :
                                                row.expiryBucket === '2 Months' ? 'bg-amber-100 text-amber-800' :
                                                'bg-emerald-100 text-emerald-800'
                                            }`}>
                                                {row.expiryBucket}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                                            No agreements expiring in the next 3 months.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {reportData.length > 0 && (
                                <tfoot className="bg-slate-50 font-bold border-t border-slate-300 sticky bottom-0">
                                    <tr>
                                        <td colSpan={4} className="px-4 py-3 text-right">TOTAL</td>
                                        <td className="px-4 py-3 text-right text-slate-800 whitespace-nowrap">
                                            {CURRENCY} {totals.totalRent.toLocaleString()}
                                        </td>
                                        <td colSpan={3} className="px-4 py-3 text-center text-slate-600">
                                            {totals.count} Agreement{totals.count !== 1 ? 's' : ''}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default AgreementExpiryReport;
