
import React, { useState, useEffect } from 'react';
import OwnerPayoutsReport from '../reports/OwnerPayoutsReport';
import UnitStatusReport from '../reports/UnitStatusReport';
import TenantLedgerReport from '../reports/TenantLedgerReport';
import Select from '../ui/Select';
import EmployeePaymentReport from '../reports/EmployeePaymentReport';
import BuildingAccountsReport from '../reports/BuildingAccountsReport';
import VendorLedgerReport from '../reports/VendorLedgerReport';
import { useAppContext } from '../../context/AppContext';
import OwnerSecurityDepositReport from '../reports/OwnerSecurityDepositReport';
import BrokerFeeReport from '../reports/BrokerFeeReport';
import PropertyLayoutReport from '../reports/PropertyLayoutReport';
import ServiceChargesDeductionReport from '../reports/ServiceChargesDeductionReport';
import BMAnalysisReport from '../reports/BMAnalysisReport';

const PRIMARY_REPORTS = ['Building Analysis', 'Visual Layout', 'Property Status', 'BM Analysis'];
const SECONDARY_REPORTS = [
    'Owner Income',
    'Service Charges Deduction',
    'Tenant Ledger',
    'Vendor Ledger',
    'Owner Security Deposit',
    'Broker Fees',
    'Employee Payments (Rental)'
];

interface RentalReportsPageProps {
    initialTab?: string | null;
}

const RentalReportsPage: React.FC<RentalReportsPageProps> = ({ initialTab }) => {
    const [activeReport, setActiveReport] = useState(initialTab || 'Building Analysis');

    useEffect(() => {
        if (initialTab) {
            setActiveReport(initialTab);
        }
    }, [initialTab]);


    const renderReport = () => {
        switch (activeReport) {
            case 'Building Analysis':
                return <BuildingAccountsReport />;
            case 'Visual Layout':
                return <PropertyLayoutReport />;
            case 'Property Status':
                return <UnitStatusReport />;
            case 'BM Analysis':
                return <BMAnalysisReport />;
            case 'Owner Income':
                return <OwnerPayoutsReport />;
            case 'Service Charges Deduction':
                return <ServiceChargesDeductionReport />;
            case 'Tenant Ledger':
                return <TenantLedgerReport />;
            case 'Vendor Ledger':
                return <VendorLedgerReport context="Rental" />;
            case 'Owner Security Deposit':
                return <OwnerSecurityDepositReport />;
            case 'Broker Fees':
                return <BrokerFeeReport />;
            case 'Employee Payments (Rental)':
                return <EmployeePaymentReport payrollType="Rental" />;
            default:
                return <p>Select a report to view.</p>;
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4">
             <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                
                {/* Primary Report Toggles - Capsule/Pill Style */}
                <div className="flex items-center bg-slate-100 rounded-full p-1 self-start overflow-x-auto no-scrollbar max-w-full">
                    {PRIMARY_REPORTS.map(reportName => (
                        <button
                            key={reportName}
                            onClick={() => setActiveReport(reportName)}
                            className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap focus:outline-none ${
                                activeReport === reportName
                                ? 'bg-white text-accent shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                        >
                            {reportName}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="hidden md:block w-px h-6 bg-slate-200"></div>

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
                        <div className="hidden md:block px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-bold rounded-full border border-indigo-100 whitespace-nowrap">
                            {activeReport}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-grow overflow-y-auto animate-fade-in-fast pb-4">
                {renderReport()}
            </div>
        </div>
    );
};

export default RentalReportsPage;
