import React, { useState, ReactNode } from 'react';
import { ICONS, CURRENCY } from '../../constants';
import Button from '../ui/Button';
import { Page } from '../../types';

// New interfaces for items
interface DashboardItem {
    id: string;
    title: string;
    amount?: number;
    onClick?: () => void;
}

interface DashboardSidebarProps {
    items: DashboardItem[];
    onConfigure: () => void;
    currentPage: Page;
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({ items, onConfigure, currentPage }) => {
    const [isOpen, setIsOpen] = useState(true);

    if (!isOpen) {
        return (
            <div className="fixed top-1/2 right-0 transform -translate-y-1/2 z-20 hidden md:block">
                <Button 
                    size="icon" 
                    onClick={() => setIsOpen(true)} 
                    className="rounded-r-none shadow-lg bg-sky-100 text-sky-800 hover:bg-sky-200"
                    aria-label="Show KPIs"
                >
                    <div className="w-5 h-5">{ICONS.chevronLeft}</div>
                </Button>
            </div>
        );
    }
    
    return (
        <aside className="hidden md:flex flex-col w-64 bg-sky-50 border-l border-sky-200 p-4 flex-shrink-0 animate-fade-in-fast h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-sky-900">Key Metrics</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8 text-sky-600 hover:bg-sky-100">
                    <div className="w-5 h-5">{ICONS.chevronRight}</div>
                </Button>
            </div>
            
            {currentPage === 'dashboard' ? (
                <>
                    <div className="space-y-4 flex-grow flex flex-col">
                        {items.map(item => (
                            <div key={item.id}>
                                {item.onClick ? (
                                    <button onClick={item.onClick} className="w-full text-left p-2 rounded-md hover:bg-sky-100 transition-colors">
                                        <p className="text-sm text-sky-700">{item.title}</p>
                                        <p className="font-bold text-xl text-sky-900 truncate">{CURRENCY} {(item.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                    </button>
                                ) : (
                                    <div className="p-2">
                                        <p className="text-sm text-sky-700">{item.title}</p>
                                        <p className="font-bold text-xl text-sky-900 truncate">{CURRENCY} {(item.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-auto pt-4">
                        <Button onClick={onConfigure} variant="outline" className="w-full border-sky-300 text-sky-800 hover:bg-sky-100 hover:text-sky-900">
                            <div className="w-4 h-4 mr-2">{ICONS.settings}</div>
                            Configure
                        </Button>
                    </div>
                </>
            ) : (
                <div className="text-center text-sky-700/80 text-sm mt-8">
                    <p>Key metrics are displayed on the Dashboard page.</p>
                </div>
            )}
        </aside>
    );
};

export default DashboardSidebar;
