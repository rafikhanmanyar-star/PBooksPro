
import React, { useState, useEffect, useRef } from 'react';
import OwnerPayoutsReport from '../reports/OwnerPayoutsReport';
import UnitStatusReport from '../reports/UnitStatusReport';
import TenantLedgerReport from '../reports/TenantLedgerReport';
import BuildingAccountsReport from '../reports/BuildingAccountsReport';
import VendorLedgerReport from '../reports/VendorLedgerReport';
import OwnerSecurityDepositReport from '../reports/OwnerSecurityDepositReport';
import BrokerFeeReport from '../reports/BrokerFeeReport';
import PropertyLayoutReport from '../reports/PropertyLayoutReport';
import ServiceChargesDeductionReport from '../reports/ServiceChargesDeductionReport';
import BMAnalysisReport from '../reports/BMAnalysisReport';
import AgreementExpiryReport from '../reports/AgreementExpiryReport';
import InvoicePaymentAnalysisReport from '../reports/InvoicePaymentAnalysisReport';
import RentalReceivableReport from '../reports/RentalReceivableReport';

const ALL_REPORTS = [
    'Visual Layout',
    'Tabular Layout',
    'Agreement Expiry',
    'Building Analysis',
    'BM Analysis',
    'Invoice & Payment Analysis',
    'Owner Rental Income',
    'Service Charges Deduction',
    'Tenant Ledger',
    'Vendor Ledger',
    'Owner Security Deposit',
    'Broker Fees',
    'Rental Receivable'
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
            case 'Invoice & Payment Analysis':
                return <InvoicePaymentAnalysisReport />;
            case 'Owner Rental Income':
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
            case 'Rental Receivable':
                return <RentalReceivableReport />;
            default:
                return <p className="text-app-muted">Select a report to view.</p>;
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0 space-y-4">
            <div className="no-print flex flex-wrap items-center gap-3 bg-app-card p-2 rounded-lg border border-app-border shadow-ds-card">
                {/* Reports Menu Button */}
                <div className="relative" ref={menuRef}>
                    <button
                        type="button"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="px-4 py-2 text-sm font-semibold bg-app-toolbar hover:bg-app-toolbar/80 text-app-text rounded-md border border-app-border transition-colors flex items-center gap-2"
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
                        <div className="absolute top-full left-0 mt-1 w-56 bg-app-card border border-app-border rounded-lg shadow-ds-card z-50 max-h-96 overflow-y-auto">
                            <div className="py-1">
                                {ALL_REPORTS.map((report) => (
                                    <button
                                        type="button"
                                        key={report}
                                        onClick={() => handleReportSelect(report)}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-app-toolbar/60 transition-colors ${activeReport === report
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'text-app-text'
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
                    <div className="px-3 py-1.5 bg-primary/10 text-primary text-xs sm:text-sm font-bold rounded-full border border-primary/25 whitespace-nowrap">
                        {activeReport}
                    </div>
                )}

            </div>
            <div className="flex-1 min-h-0 overflow-hidden animate-fade-in-fast">
                {renderReport()}
            </div>
        </div>
    );
};

export default RentalReportsPage;
