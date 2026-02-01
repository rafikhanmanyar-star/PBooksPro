
import React from 'react';
import Card from '../ui/Card';
import { ICONS } from '../../constants';

interface ShopPlaceholderProps {
    title: string;
    description: string;
    icon: React.ReactNode;
}

const ShopPlaceholder: React.FC<ShopPlaceholderProps> = ({ title, description, icon }) => {
    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
                    <p className="text-slate-500 mt-1">{description}</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                    {React.cloneElement(icon as React.ReactElement<any>, { width: 32, height: 32 })}
                </div>
            </div>

            <Card className="p-12 flex flex-col items-center justify-center text-center space-y-4 border-dashed border-2 bg-slate-50/50">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                    {React.cloneElement(icon as React.ReactElement<any>, { width: 40, height: 40, className: "text-slate-300" })}
                </div>
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Module Under Development</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mt-2">
                        We are currently building the {title} module. This enterprise-level feature will be available soon.
                    </p>
                </div>
                <div className="flex gap-3 mt-4">
                    <div className="px-4 py-2 bg-white rounded-lg border border-slate-200 text-sm font-medium text-slate-600 shadow-sm">
                        Enterprise Grade
                    </div>
                    <div className="px-4 py-2 bg-white rounded-lg border border-slate-200 text-sm font-medium text-slate-600 shadow-sm">
                        Real-time Sync
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-50 pointer-events-none">
                {[1, 2, 3].map(i => (
                    <Card key={i} className="h-32 bg-slate-100 animate-pulse" />
                ))}
            </div>
        </div>
    );
};

export default ShopPlaceholder;
