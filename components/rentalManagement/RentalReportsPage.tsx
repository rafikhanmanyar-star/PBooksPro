
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
import AgreementExpiryReport from '../reports/AgreementExpiryReport';

const PRIMARY_REPORTS = ['Visual Layout', 'Tabular Layout'];
const REPORT_MENU_OPTIONS = [
    'Agreement Expiry',
    'Building Analysis',
    'BM Analysis',
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
    const [activeReport, setActiveReport] = useState(initialTab || 'Visual Layout');

    useEffect(() => {
        if (initialTab) {
            setActiveReport(initialTab);
        }
    }, [initialTab]);


    const renderReport = () => {
        switch (activeReport) {
            case 'Visual Layout':
                return <PropertyLayoutReport />;
            case 'Tabular Layout':
                return <UnitStatusReport />;
            case 'Agreement Expiry':
                return <AgreementExpiryReport />;
            case 'Building Analysis':
                return <BuildingAccountsReport />;
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

                {/* Report Menu Selector */}
                <div className="flex-grow min-w-[200px] max-w-sm">
                    <Select
                        value={REPORT_MENU_OPTIONS.includes(activeReport) ? activeReport : ''}
                        onChange={(e) => setActiveReport(e.target.value)}
                    >
                        <option value="" disabled>More Reports...</option>
                        {REPORT_MENU_OPTIONS.map((report) => (
                            <option key={report} value={report}>
                                {report}
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Active Report Badge (for menu reports) */}
                {REPORT_MENU_OPTIONS.includes(activeReport) && (
                    <div className="ml-auto px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-bold rounded-full border border-indigo-100 whitespace-nowrap">
                        {activeReport}
                    </div>
                )}
            </div>
            <div className="flex-grow overflow-y-auto animate-fade-in-fast pb-4">
                {renderReport()}
            </div>
        </div>
    );
};

export default RentalReportsPage;
