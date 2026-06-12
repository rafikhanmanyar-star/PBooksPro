
import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo } from 'react';
import { Unit, ProjectAgreementStatus } from '../../types';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar from './ReportToolbar';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface ReportRow {
    id: string;
    unitName: string;
    projectName: string;
    ownerName: string; // Renamed from clientName
    status: 'Sold' | 'Available';
    salePrice: number;
    amountReceived: number;
    balanceDue: number;
}

const ProjectUnitReport: React.FC = () => {
    const state = useProjectReportAppState();
    const { print: triggerPrint } = usePrintContext();
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ReportRow; direction: 'asc' | 'desc' } | null>(null);

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const reportData = useMemo(() => {
        let unitsToReportOn: Unit[] = state.units;
        if (selectedProjectId !== 'all') {
            unitsToReportOn = state.units.filter(u => u.projectId === selectedProjectId);
        }

        let rows = unitsToReportOn.map(unit => {
            const project = state.projects.find(p => p.id === unit.projectId);
            
            // Determine Status based on Active Agreement
            const activeAgreement = state.projectAgreements.find(pa => 
                pa.unitIds?.includes(unit.id) && 
                pa.status === ProjectAgreementStatus.ACTIVE
            );

            // Determine Financials based on Invoices
            const relatedInvoices = state.invoices.filter(inv => inv.unitId === unit.id);
            const salePrice = relatedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
            const amountReceived = relatedInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
            const balanceDue = salePrice - amountReceived;

            if (activeAgreement) {
                // Unit is SOLD based on Agreement
                const client = state.contacts.find(c => c.id === activeAgreement.clientId);
                
                return {
                    id: unit.id,
                    unitName: unit.name,
                    projectName: project?.name || 'N/A',
                    ownerName: client?.name || 'N/A',
                    status: 'Sold' as 'Sold' | 'Available',
                    salePrice: salePrice, // Sum of invoices (Billed Amount)
                    amountReceived: amountReceived,
                    balanceDue: balanceDue,
                };
            } else {
                // Unit is AVAILABLE (Unsold)
                const displayPrice = salePrice > 0 ? salePrice : (unit.salePrice || 0);
                const displayBalance = balanceDue > 0 ? balanceDue : displayPrice;

                return {
                    id: unit.id,
                    unitName: unit.name,
                    projectName: project?.name || 'N/A',
                    ownerName: '---',
                    status: 'Available' as 'Sold' | 'Available',
                    salePrice: displayPrice,
                    amountReceived: amountReceived,
                    balanceDue: displayBalance,
                };
            }
        });
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r => 
                r.unitName.toLowerCase().includes(q) ||
                r.ownerName.toLowerCase().includes(q)
            );
        }

        // Sorting
        rows.sort((a,b) => {
            if (sortConfig) {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            } else {
                // Default sort
                if (groupBy === 'status' && a.status !== b.status) return a.status.localeCompare(b.status);
                if (a.projectName < b.projectName) return -1;
                if (a.projectName > b.projectName) return 1;
                return a.unitName.localeCompare(b.unitName);
            }
            return 0;
        });
        
        return rows;
    }, [state, selectedProjectId, searchQuery, groupBy, sortConfig]);
    
    const requestSort = (key: keyof ReportRow) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            if (item.status === 'Sold') {
                acc.totalSaleValue += item.salePrice;
            }
            acc.totalAmountReceived += item.amountReceived;
            acc.totalBalanceDue += item.balanceDue;
            return acc;
        }, { totalSaleValue: 0, totalAmountReceived: 0, totalBalanceDue: 0 });
      }, [reportData]);
  
      const handleExport = () => {
        const dataToExport = reportData.map(item => ({
            'Project': item.projectName,
            'Unit': item.unitName,
            'Status': item.status,
            'Owner': item.ownerName,
            'Sale/Billed Price': item.salePrice,
            'Amount Received': item.amountReceived,
            'Balance Due': item.balanceDue,
        }));
        exportJsonToExcel(dataToExport, 'project-unit-report.xlsx', 'Units');
    };

    const SortHeader: React.FC<{ label: string, sortKey: keyof ReportRow, align?: 'left' | 'right' | 'center' }> = ({ label, sortKey, align = 'left' }) => (
        <th 
            className={`px-3 py-2 text-${align} font-semibold text-app-muted cursor-pointer hover:bg-app-table-hover select-none`}
            onClick={() => requestSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
                {label}
                {sortConfig?.key === sortKey && (
                    <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
            </div>
        </th>
    );

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        hideDate={true}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onExport={handleExport}
                        onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                        groupBy={groupBy}
                        onGroupByChange={setGroupBy}
                        groupByOptions={[
                            { label: 'Project (Default)', value: '' },
                            { label: 'Status', value: 'status' }
                        ]}
                    >
                        <ComboBox label="Filter by Project" items={projectItems} selectedId={selectedProjectId} onSelect={(item) => setSelectedProjectId(item?.id || 'all')} allowAddNew={false}/>
                    </ReportToolbar>
                </div>

                <div className="flex-grow overflow-y-auto min-h-0 bg-app-bg" id="printable-area">
                    <Card className="min-h-full flex flex-col">
                         <ReportHeader />
                        <div className="text-center mb-6 flex-shrink-0">
                            <h3 className="text-2xl font-bold">Project Units Report</h3>
                            <p className="text-sm text-app-muted font-semibold">Project: {selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p=>p.id === selectedProjectId)?.name}</p>
                        </div>

                        <div className="mb-6 p-4 bg-app-toolbar rounded-lg border border-app-border flex-shrink-0">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <h4 className="text-sm font-medium text-app-muted uppercase">Total Sales Value</h4>
                                    <p className="text-xl font-bold text-emerald-600 mt-1">{CURRENCY} {(totals.totalSaleValue || 0).toLocaleString()}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-app-muted uppercase">Total Received</h4>
                                    <p className="text-xl font-bold text-app-text mt-1">{CURRENCY} {(totals.totalAmountReceived || 0).toLocaleString()}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-app-muted uppercase">Total Balance Due</h4>
                                    <p className="text-xl font-bold text-rose-600 mt-1">{CURRENCY} {(totals.totalBalanceDue || 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        {reportData.length > 0 ? (
                            <div className="overflow-auto flex-grow border border-app-border rounded-lg shadow-inner relative min-h-[300px]">
                                <table className="min-w-full divide-y divide-app-border text-sm relative">
                                    <thead className="bg-app-table-header sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <SortHeader label="Unit" sortKey="unitName" align="left" />
                                            <SortHeader label="Project" sortKey="projectName" align="left" />
                                            <SortHeader label="Owner" sortKey="ownerName" align="left" />
                                            <SortHeader label="Status" sortKey="status" align="center" />
                                            <SortHeader label="Price" sortKey="salePrice" align="right" />
                                            <SortHeader label="Received" sortKey="amountReceived" align="right" />
                                            <SortHeader label="Balance" sortKey="balanceDue" align="right" />
                                        </tr>
                                    </thead>
                                    <tbody className="bg-app-card divide-y divide-app-border">
                                        {reportData.map(item => (
                                            <tr key={item.id} className="hover:bg-app-table-hover transition-colors">
                                                <td className="px-3 py-2 font-medium text-app-text whitespace-nowrap">{item.unitName}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words">{item.projectName}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words">{item.ownerName}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.status === 'Sold' ? 'bg-ds-success/15 text-ds-success' : 'bg-app-toolbar text-app-muted'}`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right text-app-muted whitespace-nowrap">{CURRENCY} {(item.salePrice || 0).toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {(item.amountReceived || 0).toLocaleString()}</td>
                                                <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balanceDue > 0 ? 'text-danger' : 'text-app-muted'}`}>{CURRENCY} {(item.balanceDue || 0).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-app-table-header font-bold sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.1)]">
                                        <tr>
                                            <td colSpan={4} className="px-3 py-2 text-right">Totals (Displayed)</td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">{CURRENCY} {(reportData.reduce((sum, item) => sum + (item.salePrice || 0), 0)).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {(reportData.reduce((sum, item) => sum + (item.amountReceived || 0), 0)).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{CURRENCY} {(reportData.reduce((sum, item) => sum + (item.balanceDue || 0), 0)).toLocaleString()}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-16"><p className="text-app-muted">No units found matching criteria.</p></div>
                        )}
                        
                        <div className="flex-shrink-0 mt-auto">
                            <ReportFooter />
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
};

export default ProjectUnitReport;
