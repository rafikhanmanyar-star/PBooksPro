import React from 'react';
import { Page } from '../../types';
import { ICONS } from '../../constants';

interface CustomersPageProps {
  setCurrentPage: (page: Page) => void;
}

const ActionCard: React.FC<{ title: string; icon: React.ReactNode; onClick: () => void; description: string }> = ({ title, icon, onClick, description }) => (
    <button onClick={onClick} className="w-full text-left p-4 bg-white rounded-lg shadow-sm border border-slate-200/80 hover:shadow-md hover:border-accent/50 transition-all flex items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg">
            {icon}
        </div>
        <div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
            <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="ml-auto text-slate-400">
            {ICONS.chevronRight}
        </div>
    </button>
);

const CustomersPage: React.FC<CustomersPageProps> = ({ setCurrentPage }) => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Rental Customers</h2>
            
            <div className="space-y-4 animate-fade-in-fast">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ActionCard 
                        title="Rental Invoices" 
                        icon={ICONS.fileText} 
                        description="View, create, and manage all tenant invoices."
                        onClick={() => setCurrentPage('rentalInvoices')} 
                    />
                    <ActionCard 
                        title="Rental Agreements" 
                        icon={ICONS.clipboard} 
                        description="Access and manage all tenant contracts."
                        onClick={() => setCurrentPage('rentalAgreements')} 
                    />
                    <ActionCard 
                        title="Owner Payouts" 
                        icon={ICONS.briefcase} 
                        description="Process and track payments to property owners."
                        onClick={() => setCurrentPage('ownerPayouts')} 
                    />
                     <ActionCard 
                        title="Rental Settings" 
                        icon={ICONS.settings} 
                        description="Configure buildings, properties, tenants, and owners."
                        onClick={() => setCurrentPage('settings')} 
                    />
                </div>
            </div>
        </div>
    );
};

export default CustomersPage;