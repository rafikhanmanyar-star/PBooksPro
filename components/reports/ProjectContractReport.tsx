
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContractStatus } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import { usePrint } from '../../hooks/usePrint';
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
    const { state } = useAppContext();
    const { handlePrint } = usePrint();
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
            const vendor = state.contacts.find(c => c.id === contract.vendorId);
            
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

    }, [state.contracts, state.transactions, selectedProjectId, searchQuery]);

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
                    onPrint={handlePrint}
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

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Project Contract Report</h3>
                        <p className="text-sm text-slate-500">
                            {selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name}
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Ref</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Title</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Vendor</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Project</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Paid</th>
                                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Balance</th>
                                    <th className="px-3 py-2 text-center font-semibold text-slate-600">%</th>
                                    <th className="px-3 py-2 text-center font-semibold text-slate-600">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(row => (
                                    <tr key={row.contractId} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{row.contractNumber}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words font-medium">{row.name}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words">{row.vendorName}</td>
                                        <td className="px-3 py-2 whitespace-normal break-words">{row.projectName}</td>
                                        <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{CURRENCY} {row.totalAmount.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right text-emerald-600 whitespace-nowrap">{CURRENCY} {row.paidAmount.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right text-rose-600 whitespace-nowrap">{CURRENCY} {row.balance.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-center">
                                            <div className="flex items-center gap-2 justify-center">
                                                <div className="w-12 bg-slate-200 rounded-full h-1.5 hidden sm:block">
                                                    <div className={`h-1.5 rounded-full ${row.progress > 100 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{width: `${Math.min(row.progress, 100)}%`}}></div>
                                                </div>
                                                <span className="text-xs">{row.progress.toFixed(0)}%</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase ${row.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
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
