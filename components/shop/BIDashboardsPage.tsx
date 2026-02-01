
import React, { useState } from 'react';
import { BIProvider, useBI } from '../../context/BIContext';
import ExecutiveOverview from './bi/ExecutiveOverview';
import SalesAnalytics from './bi/SalesAnalytics';
import InventoryIntelligence from './bi/InventoryIntelligence';
import ProfitabilityAnalysis from './bi/ProfitabilityAnalysis';
import { ICONS } from '../../constants';

const BIContent: React.FC = () => {
    const { dateRange, setDateRange } = useBI();
    const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'inventory' | 'profit'>('overview');

    const handleExport = () => {
        alert(`Exporting BI Report for ${dateRange}...`);
        // In real app, trigger PDF/CSV generation here
    };

    const tabs = [
        { id: 'overview', label: 'Executive Overview', icon: ICONS.barChart },
        { id: 'sales', label: 'Sales Analytics', icon: ICONS.trendingUp },
        { id: 'inventory', label: 'Inventory Intelligence', icon: ICONS.package },
        { id: 'profit', label: 'Profitability Analysis', icon: ICONS.dollarSign },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-slate-900 border-b border-white/10 px-8 pt-8 shadow-2xl z-20">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500 rounded-lg text-white">
                                {ICONS.globe}
                            </div>
                            <h1 className="text-2xl font-black text-white tracking-tight">Intelligence Engine</h1>
                        </div>
                        <p className="text-slate-400 text-sm font-medium mt-1">Enterprise Analytics & Predictive Decision Support.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
                            {['Today', 'MTD', 'QTD', 'YTD'].map(range => (
                                <button
                                    key={range}
                                    onClick={() => setDateRange(range)}
                                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${dateRange === range
                                        ? 'bg-indigo-600 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleExport}
                            className="p-3 bg-white/5 text-white rounded-xl border border-white/10 hover:bg-white/10 transition-all"
                            title="Export Report"
                        >
                            {ICONS.download}
                        </button>
                    </div>
                </div>

                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm font-black transition-all relative flex items-center gap-2 tracking-widest uppercase text-[10px] ${activeTab === tab.id
                                ? 'text-indigo-400'
                                : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 16, height: 16 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 rounded-t-full shadow-[0_-4px_12px_rgba(99,102,241,0.5)]"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {activeTab === 'overview' && <ExecutiveOverview />}
                {activeTab === 'sales' && <SalesAnalytics />}
                {activeTab === 'inventory' && <InventoryIntelligence />}
                {activeTab === 'profit' && <ProfitabilityAnalysis />}
            </div>
        </div>
    );
};

const BIDashboardsPage: React.FC = () => {
    return (
        <BIProvider>
            <BIContent />
        </BIProvider>
    );
};

export default BIDashboardsPage;
