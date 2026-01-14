
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RentalAgreementStatus, Property, InvoiceType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface ReportRow {
    id: string;
    unitName: string;
    buildingName: string;
    ownerName: string;
    tenantName: string;
    status: 'Occupied' | 'Vacant';
    agreementEndDate: Date | null;
    expiryStatus: 'OK' | 'Expires Soon' | 'Expired' | 'N/A';
}

type SortKey = 'unitName' | 'buildingName' | 'ownerName' | 'tenantName' | 'status' | 'agreementEndDate' | 'expiryStatus';

interface UnitStatusReportProps {
    onReportChange?: (report: string) => void;
    activeReport?: string;
}

const UnitStatusReport: React.FC<UnitStatusReportProps> = ({ onReportChange, activeReport }) => {
    const { state } = useAppContext();
    const { handlePrint } = usePrint();
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState<string>('');
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'unitName', direction: 'asc' });

    const buildings = useMemo(() => state.buildings, [state.buildings]);
    const buildingItems = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...buildings], [buildings]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const reportData = useMemo<ReportRow[]>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let filteredProperties = state.properties;
        if (selectedBuildingId !== 'all') {
            filteredProperties = state.properties.filter(p => p.buildingId === selectedBuildingId);
        }

        let reportRows = filteredProperties.map(property => {
            // Look for an active agreement for this property
            const activeAgreement = state.rentalAgreements.find(ra =>
                ra.propertyId === property.id && ra.status === RentalAgreementStatus.ACTIVE
            );

            const owner = state.contacts.find(c => c.id === property.ownerId);
            const building = state.buildings.find(b => b.id === property.buildingId);

            let status: 'Occupied' | 'Vacant' = 'Vacant';
            let tenantName = '---';
            let agreementEndDate: Date | null = null;
            let expiryStatus: ReportRow['expiryStatus'] = 'N/A';

            if (activeAgreement) {
                status = 'Occupied';
                const tenant = state.contacts.find(c => c.id === activeAgreement.tenantId);
                tenantName = tenant?.name || 'Unknown Tenant';
                
                if (activeAgreement.endDate) {
                    agreementEndDate = new Date(activeAgreement.endDate);
                    agreementEndDate.setHours(23, 59, 59, 999); // Ensure end of day

                    const timeDiff = agreementEndDate.getTime() - today.getTime();
                    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                    if (daysDiff < 0) {
                        expiryStatus = 'Expired';
                    } else if (daysDiff <= 30) {
                        expiryStatus = 'Expires Soon';
                    } else {
                        expiryStatus = 'OK';
                    }
                }
            }

            return {
                id: property.id,
                unitName: property.name,
                buildingName: building?.name || 'N/A',
                ownerName: owner?.name || 'Unknown/Deleted Owner',
                tenantName,
                status,
                agreementEndDate,
                expiryStatus
            };
        });
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            reportRows = reportRows.filter(row => 
                row.unitName.toLowerCase().includes(q) ||
                row.tenantName.toLowerCase().includes(q) ||
                row.ownerName.toLowerCase().includes(q)
            );
        }

        // Handle Sort Logic
        return reportRows.sort((a, b) => {
            // If groupBy is active, it takes precedence for visual grouping
            if (groupBy === 'status') {
                const cmp = a.status.localeCompare(b.status);
                if (cmp !== 0) return cmp;
            } else if (groupBy === 'owner') {
                const cmp = a.ownerName.localeCompare(b.ownerName);
                if (cmp !== 0) return cmp;
            }
            
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];
            
            if (sortConfig.key === 'agreementEndDate') {
                valA = valA ? valA.getTime() : 0;
                valB = valB ? valB.getTime() : 0;
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [state, selectedBuildingId, searchQuery, groupBy, sortConfig]);


    const handleExport = () => {
        const dataToExport = reportData.map(item => ({
            'Building': item.buildingName,
            'Unit': item.unitName,
            'Owner': item.ownerName,
            'Tenant': item.tenantName,
            'Status': item.status,
            'Agreement End': item.agreementEndDate ? formatDate(item.agreementEndDate) : '',
            'Expiry Note': item.expiryStatus
        }));
        exportJsonToExcel(dataToExport, 'property-status-report.xlsx', 'Status');
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                {/* Custom Toolbar - All controls in first row */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
                    {/* First Row: Filters and Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Building Filter */}
                        <div className="w-48 flex-shrink-0">
                            <ComboBox 
                                items={buildingItems} 
                                selectedId={selectedBuildingId} 
                                onSelect={(item) => setSelectedBuildingId(item?.id || 'all')} 
                                allowAddNew={false}
                                placeholder="Filter Building"
                            />
                        </div>

                        {/* Group By */}
                        <div className="w-48 flex-shrink-0">
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value)}
                                className="block w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                            >
                                <option value="">No Grouping</option>
                                <option value="status">Group by Status</option>
                                <option value="owner">Group by Owner</option>
                            </select>
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

                        {/* Layout Toggle Buttons */}
                        {onReportChange && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onReportChange('Visual Layout')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap focus:outline-none ${
                                        activeReport === 'Visual Layout'
                                            ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300 shadow-sm'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    Visual Layout
                                </button>
                                <button
                                    onClick={() => onReportChange('Tabular Layout')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap focus:outline-none ${
                                        activeReport === 'Tabular Layout'
                                            ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300 shadow-sm'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    Tabular Layout
                                </button>
                            </div>
                        )}

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
                            <h3 className="text-2xl font-bold">Property Status Report</h3>
                            <p className="text-sm text-slate-500 font-semibold">
                                {selectedBuildingId !== 'all' ? `Building: ${state.buildings.find(b=>b.id===selectedBuildingId)?.name}` : 'All Buildings'}
                            </p>
                        </div>

                        {reportData.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th onClick={() => handleSort('buildingName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Building <SortIcon column="buildingName"/></th>
                                            <th onClick={() => handleSort('unitName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Unit <SortIcon column="unitName"/></th>
                                            <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Owner <SortIcon column="ownerName"/></th>
                                            <th onClick={() => handleSort('status')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Status <SortIcon column="status"/></th>
                                            <th onClick={() => handleSort('tenantName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Tenant <SortIcon column="tenantName"/></th>
                                            <th onClick={() => handleSort('agreementEndDate')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Agreement End <SortIcon column="agreementEndDate"/></th>
                                            <th onClick={() => handleSort('expiryStatus')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Note <SortIcon column="expiryStatus"/></th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {reportData.map(item => (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 whitespace-nowrap">{item.buildingName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{item.unitName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{item.ownerName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${item.status === 'Occupied' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">{item.tenantName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{item.agreementEndDate ? formatDate(item.agreementEndDate) : '-'}</td>
                                                <td className={`px-3 py-2 whitespace-nowrap font-semibold ${item.expiryStatus === 'Expired' ? 'text-rose-600' : item.expiryStatus === 'Expires Soon' ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                    {item.expiryStatus !== 'N/A' && item.expiryStatus !== 'OK' ? item.expiryStatus : ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (<div className="text-center py-16"><p className="text-slate-500">No properties found.</p></div>)}
                        <ReportFooter />
                    </Card>
                </div>
            </div>
        </>
    );
};

export default UnitStatusReport;
