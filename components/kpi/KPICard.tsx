
import React from 'react';

interface KPICardProps {
    title: string;
    value: number;
    onClick: () => void;
    isActive?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, onClick, isActive }) => {
    const isNegative = value < 0;
    const displayValue = Math.abs(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const valueColor = isNegative ? 'text-rose-400' : 'text-emerald-400';

    return (
        <button 
            onClick={onClick}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md backdrop-blur-sm border border-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 group ${
                isActive
                ? 'bg-white/20 shadow-inner border-white/30'
                : 'bg-white/5 hover:bg-white/10 hover:shadow-sm'
            }`}
        >
            <span className="text-sm font-medium text-white/70 truncate mr-2 text-left flex-1 group-hover:text-white/90 transition-colors">{title}</span>
            <span className={`text-base font-bold whitespace-nowrap ${valueColor}`}>
                {displayValue}
            </span>
        </button>
    );
};

export default KPICard;
