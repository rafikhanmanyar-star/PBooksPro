import React from 'react';
import { Page } from '../../types';
import { ICONS } from '../../constants';

interface VendorsPageProps {
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

const VendorsPage: React.FC<VendorsPageProps> = ({ setCurrentPage }) => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Vendors</h2>
            
            <div className="space-y-4 animate-fade-in-fast">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ActionCard 
                        title="Vendor Directory" 
                        icon={ICONS.users} 
                        description="View, add, and manage all your suppliers and their ledgers."
                        onClick={() => setCurrentPage('vendorDirectory')} 
                    />
                    <ActionCard 
                        title="Manage Bills" 
                        icon={ICONS.fileText} 
                        description="Track and pay all incoming bills from suppliers."
                        onClick={() => setCurrentPage('bills')} 
                    />
                </div>
            </div>
        </div>
    );
};

export default VendorsPage;