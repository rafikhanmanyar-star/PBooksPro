
import React, { useState, useEffect } from 'react';
import ProjectUnitReport from '../reports/ProjectUnitReport';
import ClientLedgerReport from '../reports/ClientLedgerReport';
import Select from '../ui/Select';
import ProjectSummaryReport from '../reports/ProjectSummaryReport';
import ProjectCategoryReport from '../reports/ProjectCategoryReport';
import VendorLedgerReport from '../reports/VendorLedgerReport';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import ProjectLayoutReport from '../reports/ProjectLayoutReport';
import RevenueAnalysisReport from '../reports/RevenueAnalysisReport';
import ProjectBrokerReport from '../reports/ProjectBrokerReport';
import ProjectContractReport from '../reports/ProjectContractReport';

const PRIMARY_REPORTS = ['Visual Layout', 'Project Units'];
const SECONDARY_REPORTS = [
    'Project Summary',
    'Contract Report',
    'Revenue Analysis', 
    'Owner Ledger', 
    'Broker Report', 
    'Income by Category',
    'Expense by Category',
    'Vendor Ledger'
];

interface ProjectReportsPageProps {
    initialTab?: string | null;
}

const ProjectReportsPage: React.FC<ProjectReportsPageProps> = ({ initialTab }) => {
    const [activeReport, setActiveReport] = useState(initialTab || 'Visual Layout');

    useEffect(() => {
        if (initialTab) {
            setActiveReport(initialTab);
        }
    }, [initialTab]);

    const renderReport = () => {
        switch (activeReport) {
            case 'Visual Layout':
                return <ProjectLayoutReport />;
            case 'Project Summary':
                return <ProjectSummaryReport />;
            case 'Contract Report':
                return <ProjectContractReport />;
            case 'Revenue Analysis':
                return <RevenueAnalysisReport />;
            case 'Income by Category':
                return <ProjectCategoryReport type={TransactionType.INCOME} />;
            case 'Expense by Category':
                return <ProjectCategoryReport type={TransactionType.EXPENSE} />;
            case 'Project Units':
                return <ProjectUnitReport />;
            case 'Owner Ledger':
                return <ClientLedgerReport />;
            case 'Broker Report':
                return <ProjectBrokerReport />;
            case 'Vendor Ledger':
                return <VendorLedgerReport context="Project" />;
            default:
                return <p>Select a report to view.</p>;
        }
    };

    return (
        <div className="space-y-4">
            <div className="no-print flex flex-wrap items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                {/* Primary Report Toggles */}
                <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
                    {PRIMARY_REPORTS.map(reportName => (
                        <button
                            key={reportName}
                            onClick={() => setActiveReport(reportName)}
                            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all duration-200 whitespace-nowrap focus:outline-none ${
                                activeReport === reportName
                                ? 'bg-white text-accent shadow-sm ring-1 ring-slate-200'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                        >
                            {reportName}
                        </button>
                    ))}
                </div>

                <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>

                {/* Secondary Report Selector */}
                <div className="flex-grow min-w-[200px] max-w-sm">
                    <Select
                        value={SECONDARY_REPORTS.includes(activeReport) ? activeReport : ''}
                        onChange={(e) => setActiveReport(e.target.value)}
                    >
                        <option value="" disabled>More Reports...</option>
                        {SECONDARY_REPORTS.map((report) => (
                            <option key={report} value={report}>
                                {report}
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Active Report Badge (for secondary reports) */}
                {SECONDARY_REPORTS.includes(activeReport) && (
                    <div className="ml-auto px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-bold rounded-full border border-indigo-100 whitespace-nowrap">
                        {activeReport}
                    </div>
                )}
            </div>

            <div className="animate-fade-in-fast">
                {renderReport()}
            </div>
        </div>
    );
};

export default ProjectReportsPage;
