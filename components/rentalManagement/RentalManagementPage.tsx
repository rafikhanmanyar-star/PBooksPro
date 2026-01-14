
import React, { useState, useEffect, useCallback, memo } from 'react';
import RentalAgreementsPage from '../rentalAgreements/RentalAgreementsPage';
import OwnerPayoutsPage from '../payouts/OwnerPayoutsPage';
import RentalReportsPage from './RentalReportsPage';
import { Page } from '../../types';
import Tabs from '../ui/Tabs';
import RentalInvoicesPage from './RentalInvoicesPage';
import RentalPaymentSearch from './RentalPaymentSearch';
import RentalBillsPage from './RentalBillsPage';
import { useAppContext } from '../../context/AppContext';
import useLocalStorage from '../../hooks/useLocalStorage';

interface RentalManagementPageProps {
  initialPage: Page;
}

const RentalManagementPage: React.FC<RentalManagementPageProps> = ({ initialPage }) => {
    const { state, dispatch } = useAppContext();
    const { initialTabs } = state;
    
    // Detect Mobile
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const availableTabs = isMobile 
        ? ['Invoices', 'Bills', 'Payment', 'Payouts', 'Reports']
        : ['Agreements', 'Invoices', 'Bills', 'Payment', 'Payouts', 'Reports'];

    const [activeTab, setActiveTab] = useLocalStorage<string>('rentalManagement_activeTab', isMobile ? 'Invoices' : 'Agreements');
    const [initialReportTab, setInitialReportTab] = useState<string | null>(null);
    
    // Ensure activeTab is valid for mobile
    useEffect(() => {
        if (isMobile && activeTab === 'Agreements') {
            setActiveTab('Invoices');
        }
    }, [isMobile, activeTab, setActiveTab]);

    useEffect(() => {
        // This hook handles the initial page load based on the footer navigation.
        switch(initialPage) {
            case 'rentalInvoices':
                setActiveTab('Invoices');
                break;
            case 'rentalAgreements':
                if (!isMobile) setActiveTab('Agreements');
                break;
            case 'ownerPayouts':
                setActiveTab('Payouts');
                break;
            case 'rentalManagement':
                // Do nothing - preserve current tab unless invalid
                break;
            default:
                // Do nothing
                break;
        }
    }, [initialPage, isMobile, setActiveTab]);

    useEffect(() => {
        // This hook specifically handles deep-linking from favorite reports,
        // overriding the initial page load if necessary.
        if (initialTabs && initialTabs.length > 0) {
            const [mainTab, subTab] = initialTabs;
            if (availableTabs.includes(mainTab)) {
                setActiveTab(mainTab);
                if (mainTab === 'Reports' && subTab) {
                    setInitialReportTab(subTab);
                }
            }
            // Clear global state immediately to prevent re-render loops in children
            dispatch({ type: 'CLEAR_INITIAL_TABS' });
        }
    }, [initialTabs, dispatch, availableTabs, setActiveTab]);


    const renderContent = () => {
        switch(activeTab) {
            case 'Agreements': return !isMobile ? <RentalAgreementsPage /> : null;
            case 'Invoices': return <RentalInvoicesPage />;
            case 'Bills': return <RentalBillsPage />;
            case 'Payment': return <RentalPaymentSearch />;
            case 'Payouts': return <OwnerPayoutsPage />;
            case 'Reports': return <RentalReportsPage initialTab={initialReportTab} />;
            default: return null;
        }
    };
    
    return (
        <div className="h-full overflow-auto bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Portfolio</p>
                            <h1 className="text-2xl font-semibold text-slate-900">Rental Management</h1>
                            <p className="text-sm text-slate-500">Agreements, invoices, bills, payments, payouts, and reports in one place.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-2 text-xs font-semibold uppercase rounded-full bg-slate-100 text-slate-600 border border-slate-200">UI refresh</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col min-h-[70vh]">
                    <div className="px-3 sm:px-4 pt-3 border-b border-slate-200 bg-slate-50">
                        <Tabs tabs={availableTabs} activeTab={activeTab} onTabClick={setActiveTab} />
                    </div>
                    <div className="flex-grow min-h-0 px-3 sm:px-4 py-3">
                        <div className="h-full">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default memo(RentalManagementPage);
