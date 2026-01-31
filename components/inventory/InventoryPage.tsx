import React, { useState } from 'react';
import PurchasesTab from './PurchasesTab';
import InventoryItemsReport from './InventoryItemsReport';
import Tabs from '../ui/Tabs';

type ShopTab = 'purchases' | 'sales' | 'inventory' | 'dashboard';

const InventoryPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ShopTab>('dashboard');

    const tabs: { id: ShopTab; label: string }[] = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'purchases', label: 'Purchases' },
        { id: 'sales', label: 'Sales' },
        { id: 'inventory', label: 'Inventory' },
    ];
    const tabLabels = tabs.map((t) => t.label);
    const labelToId = Object.fromEntries(tabs.map((t) => [t.label, t.id])) as Record<string, ShopTab>;
    const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? tabLabels[0];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <p>Dashboard content coming soon...</p>
                    </div>
                );
            case 'purchases':
                return <PurchasesTab />;
            case 'sales':
                return (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <p>Sales content coming soon...</p>
                    </div>
                );
            case 'inventory':
                return <InventoryItemsReport />;
            default:
                return null;
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="20" 
                            height="20" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="white" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                        >
                            <path d="m7.5 4.27 9 5.15"></path>
                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                            <path d="m3.3 7 8.7 5 8.7-5"></path>
                            <path d="M12 22V12"></path>
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">My Shop</h1>
                </div>
            </div>

            {/* Browser-style tabs (same as payroll, rental-payout, etc.) */}
            <div className="flex-shrink-0">
                <Tabs
                    variant="browser"
                    tabs={tabLabels}
                    activeTab={activeTabLabel}
                    onTabClick={(label) => {
                        const id = labelToId[label];
                        if (id) setActiveTab(id);
                    }}
                />
            </div>

            {/* Tab content - seamless with active tab */}
            <div className="flex-1 overflow-auto bg-white rounded-b-lg -mt-px p-6">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default InventoryPage;
