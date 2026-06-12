
import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo } from 'react';
import { ContractStatus } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface ContractReportRow {
    contractId: string;
    contractNumber: string;
    name: string;
    projectName: string;
    vendorName: string;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    progress: number;
    status: string;
}

const ProjectContractReport: React.FC = () => {
    const state = useProjectReportAppState();
    const { print: triggerPrint } = usePrintContext();
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');
    const [searchQuery, setSearchQuery] = useState('');

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const reportData = useMemo<ContractReportRow[]>(() => {
        let contracts = state.contracts || [];

        if (selectedProjectId !== 'all') {
            contracts = contracts.filter(c => c.projectId === selectedProjectId);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            contracts = contracts.filter(c =>
                c.contractNumber.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q)
            );
        }

        return contracts.map(contract => {
            const project = state.projects.find(p => p.id === contract.projectId);
            const vendor = state.vendors?.find(v => v.id === contract.vendorId);

            // Calculate paid amount based on linked transactions
            const paidAmount = state.transactions
                .filter(tx => tx.contractId === contract.id)
                .reduce((sum, tx) => sum + tx.amount, 0);

            const balance = Math.max(0, contract.totalAmount - paidAmount);
            const progress = contract.totalAmount > 0 ? (paidAmount / contract.totalAmount) * 100 : 0;

            return {
                contractId: contract.id,
                contractNumber: contract.contractNumber,
                name: contract.name,
                projectName: project?.name || 'Unknown',
                vendorName: vendor?.name || 'Unknown',
                totalAmount: contract.totalAmount,
                paidAmount,
                balance,
                progress,
                status: contract.status
            };
        }).sort((a, b) => a.projectName.localeCompare(b.projectName));

    }, [state.contracts, state.transactions, state.projects, state.vendors, selectedProjectId, searchQuery]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            'Contract #': r.contractNumber,
            'Title': r.name,
            'Project': r.projectName,
            'Vendor': r.vendorName,
            'Total Value': r.totalAmount,
            'Paid': r.paidAmount,
            'Balance': r.balance,
            'Status': r.status
        }));
        exportJsonToExcel(data, 'contract-report.xlsx', 'Contracts');
    };


    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex-shrink-0">
                <ReportToolbar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onExport={handleExport}
                    onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                    hideGroup={true}
                    hideDate={true}
                >
                    <ComboBox
                        label="Project"
                        items={projectItems}
                        selectedId={selectedProjectId}
                        onSelect={(item) => setSelectedProjectId(item?.id || 'all')}
                        allowAddNew={false}
                    />
                </ReportToolbar>
            </div>

            <div className="flex-grow overflow-y-auto min-h-0 bg-app-bg" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-app-text">Project Contract Report</h3>
                        <p className="text-sm text-app-muted">
                            {selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name}
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-app-border text-sm">
                            <thead className="bg-app-table-header">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-app-muted">Ref</th>
                                    <th className="px-3 py-2 text-left font-semibold text-app-muted">Title</th>
                                    <th className="px-3 py-2 text-left font-semibold text-app-muted">Vendor</th>
                                    <th className="px-3 py-2 text-left font-semibold text-app-muted">Project</th>
                                    <th className="px-3 py-2 text-right font-semibold text-app-muted">Total</th>
                                    <th className="px-3 py-2 text-right font-semibold text-app-muted">Paid</th>
                                    <th className="px-3 py-2 text-right font-semibold text-app-muted">Balance</th>
                                    <th className="px-3 py-2 text-center font-semibold text-app-muted">%</th>
                                    <th className="px-3 py-2 text-center font-semibold text-app-muted">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border bg-app-card">
                                {reportData.map(row => (
                                    <tr key={row.contractId} className="hover:bg-app-table-hover">
                                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-app-text">{row.contractNumber}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words font-medium text-app-text">{row.name}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words text-app-text">{row.vendorName}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words text-app-text">{row.projectName}</td>
                                        <td className="px-3 py-2 text-right font-bold whitespace-nowrap text-app-text">{CURRENCY} {row.totalAmount.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right text-ds-success whitespace-nowrap">{CURRENCY} {row.paidAmount.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right text-ds-danger whitespace-nowrap">{CURRENCY} {row.balance.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-center">
                                            <div className="flex items-center gap-2 justify-center">
                                                <div className="w-12 bg-app-border rounded-full h-1.5 hidden sm:block">
                                                    <div className={`h-1.5 rounded-full ${row.progress > 100 ? 'bg-ds-danger' : 'bg-ds-success'}`} style={{ width: `${Math.min(row.progress, 100)}%` }}></div>
                                                </div>
                                                <span className="text-xs text-app-text">{row.progress.toFixed(0)}%</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase ${row.status === 'Active' ? 'bg-[color:var(--badge-paid-bg)] text-ds-success border border-ds-success/30' : 'bg-app-toolbar text-app-muted border border-app-border'}`}>
                                                {row.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default ProjectContractReport;
