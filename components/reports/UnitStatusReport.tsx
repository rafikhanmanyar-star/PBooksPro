
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RentalAgreementStatus, Property, InvoiceType } from '../../types';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { exportJsonToExcel } from '../../services/exportService';
import { ICONS } from '../../constants';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar from './ReportToolbar';
import { formatDate } from '../../utils/dateUtils';

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

const UnitStatusReport: React.FC = () => {
    const { state } = useAppContext();
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

    const handlePrint = () => window.print();

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
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        hideDate={true} // Snapshot report
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onExport={handleExport}
                        onPrint={handlePrint}
                        groupBy={groupBy}
                        onGroupByChange={setGroupBy}
                        groupByOptions={[
                            { label: 'Building (Default)', value: '' },
                            { label: 'Status', value: 'status' },
                            { label: 'Owner', value: 'owner' },
                        ]}
                    >
                        <ComboBox label="Filter by Building" items={buildingItems} selectedId={selectedBuildingId} onSelect={(item) => setSelectedBuildingId(item?.id || 'all')} allowAddNew={false}/>
                    </ReportToolbar>
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0">
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
