
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
import { usePrintContext } from '../../context/PrintContext';
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
    const { print: triggerPrint } = usePrintContext();
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
                const tenant = state.contacts.find(c => c.id === activeAgreement.contactId);
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
        <span className="ml-1 text-[10px] text-app-muted">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                {/* Custom Toolbar - All controls in first row */}
                <div className="bg-app-card p-3 rounded-lg border border-app-border shadow-ds-card no-print">
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
                                className="ds-input-field block w-full px-3 py-1.5 text-sm"
                                aria-label="Group by"
                            >
                                <option value="">No Grouping</option>
                                <option value="status">Group by Status</option>
                                <option value="owner">Group by Owner</option>
                            </select>
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

                        {/* Layout Toggle Buttons */}
                        {onReportChange && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onReportChange('Visual Layout')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap focus:outline-none ${
                                        activeReport === 'Visual Layout'
                                            ? 'bg-primary/15 text-primary border-2 border-primary/40 shadow-sm'
                                            : 'bg-app-toolbar text-app-text border border-app-border hover:bg-app-toolbar/80'
                                    }`}
                                >
                                    Visual Layout
                                </button>
                                <button
                                    onClick={() => onReportChange('Tabular Layout')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap focus:outline-none ${
                                        activeReport === 'Tabular Layout'
                                            ? 'bg-primary/15 text-primary border-2 border-primary/40 shadow-sm'
                                            : 'bg-app-toolbar text-app-text border border-app-border hover:bg-app-toolbar/80'
                                    }`}
                                >
                                    Tabular Layout
                                </button>
                            </div>
                        )}

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
                            <h3 className="text-2xl font-bold text-app-text">Property Status Report</h3>
                            <p className="text-sm text-app-muted font-semibold">
                                {selectedBuildingId !== 'all' ? `Building: ${state.buildings.find(b=>b.id===selectedBuildingId)?.name}` : 'All Buildings'}
                            </p>
                        </div>

                        {reportData.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-app-border text-sm">
                                    <thead className="bg-app-toolbar/40 sticky top-0">
                                        <tr>
                                            <th onClick={() => handleSort('buildingName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Building <SortIcon column="buildingName"/></th>
                                            <th onClick={() => handleSort('unitName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Unit <SortIcon column="unitName"/></th>
                                            <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Owner <SortIcon column="ownerName"/></th>
                                            <th onClick={() => handleSort('status')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Status <SortIcon column="status"/></th>
                                            <th onClick={() => handleSort('tenantName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Tenant <SortIcon column="tenantName"/></th>
                                            <th onClick={() => handleSort('agreementEndDate')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Agreement End <SortIcon column="agreementEndDate"/></th>
                                            <th onClick={() => handleSort('expiryStatus')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Note <SortIcon column="expiryStatus"/></th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-app-card divide-y divide-app-border text-app-text">
                                        {reportData.map(item => (
                                            <tr key={item.id} className="hover:bg-app-toolbar/30">
                                                <td className="px-3 py-2 whitespace-nowrap">{item.buildingName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap font-medium text-app-text">{item.unitName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{item.ownerName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${item.status === 'Occupied' ? 'bg-ds-success/15 text-ds-success' : 'bg-app-toolbar text-app-muted'}`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">{item.tenantName}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{item.agreementEndDate ? formatDate(item.agreementEndDate) : '-'}</td>
                                                <td className={`px-3 py-2 whitespace-nowrap font-semibold ${item.expiryStatus === 'Expired' ? 'text-ds-danger' : item.expiryStatus === 'Expires Soon' ? 'text-ds-warning' : 'text-ds-success'}`}>
                                                    {item.expiryStatus !== 'N/A' && item.expiryStatus !== 'OK' ? item.expiryStatus : ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (<div className="text-center py-16"><p className="text-app-muted">No properties found.</p></div>)}
                        <ReportFooter />
                    </Card>
                </div>
            </div>
        </>
    );
};

export default UnitStatusReport;
