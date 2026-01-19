
import React, { useState, useEffect, useRef } from 'react';
import OwnerPayoutsReport from '../reports/OwnerPayoutsReport';
import UnitStatusReport from '../reports/UnitStatusReport';
import TenantLedgerReport from '../reports/TenantLedgerReport';
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

const ALL_REPORTS = [
    'Visual Layout',
    'Tabular Layout',
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
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialTab) {
            setActiveReport(initialTab);
        }
    }, [initialTab]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);


    const handleReportSelect = (reportName: string) => {
        setActiveReport(reportName);
        setIsMenuOpen(false);
    };

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
                {/* Reports Menu Button */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-300 transition-colors flex items-center gap-2"
                    >
                        <span>Reports</span>
                        <svg 
                            className={`w-4 h-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {isMenuOpen && (
                        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                            <div className="py-1">
                                {ALL_REPORTS.map((report) => (
                                    <button
                                        key={report}
                                        onClick={() => handleReportSelect(report)}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 transition-colors ${
                                            activeReport === report 
                                                ? 'bg-indigo-50 text-indigo-700 font-semibold' 
                                                : 'text-slate-700'
                                        }`}
                                    >
                                        {report}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Active Report Badge */}
                {activeReport && (
                    <div className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-bold rounded-full border border-indigo-100 whitespace-nowrap">
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
