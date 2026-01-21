import React, { useState } from 'react';
import MyStockModule from './MyStockModule';
import PurchasingHubModule from './PurchasingHubModule';
import CustomerBillsModule from './CustomerBillsModule';
import FinancialIntelligenceModule from './FinancialIntelligenceModule';

const BusinessTransactionsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'stock' | 'purchasing' | 'sales' | 'reports'>('stock');

    return (
        <div className="flex flex-col h-full bg-slate-50 font-sans">
            <header className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold font-heading uppercase tracking-tight text-slate-950">
                            Business Transactions
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 font-sans">Multi-tenant Construction Inventory System</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full uppercase tracking-wider border border-slate-200">
                            v1.0.0
                        </span>
                        <span className="px-3 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full uppercase tracking-wider border border-orange-200">
                            Live Sync
                        </span>
                    </div>
                </div>
            </header>

            <nav className="flex bg-white border-b border-slate-200 px-6 overflow-x-auto scrollbar-none">
                {[
                    { id: 'stock', label: 'My Stock' },
                    { id: 'purchasing', label: 'Purchasing Hub' },
                    { id: 'sales', label: 'Customer Bills' },
                    { id: 'reports', label: 'Financial Intel' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                            activeTab === tab.id
                                ? 'border-orange-500 text-orange-600 bg-orange-50/30'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            <main className="flex-1 overflow-auto bg-slate-50/50 p-6">
                {activeTab === 'stock' && <MyStockModule />}
                {activeTab === 'purchasing' && <PurchasingHubModule />}
                {activeTab === 'sales' && <CustomerBillsModule />}
                {activeTab === 'reports' && <FinancialIntelligenceModule />}
            </main>
        </div>
    );
};

export default BusinessTransactionsPage;
