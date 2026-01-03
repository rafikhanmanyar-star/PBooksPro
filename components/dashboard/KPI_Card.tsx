
import React, { ReactNode } from 'react';
import { CURRENCY } from '../../constants';
import { formatRoundedNumber } from '../../utils/numberUtils';

interface KPICardProps {
  title: string;
  amount: number;
  icon: ReactNode;
  colorClass?: string; // Kept for compat, but usage will change
  onClick?: () => void;
  description?: string;
  trend?: { value: number; isPositive: boolean }; // New prop for trend
}

const KPICard: React.FC<KPICardProps> = ({ title, amount, icon, colorClass, onClick, description, trend }) => {

  // Extract color from legacy colorClass or default to generic
  // Legacy classes were like "bg-indigo-50 text-indigo-800"
  // We want to extract just the color for the icon background
  const getIconStyles = () => {
    if (title.includes('Income') || title.includes('Revenue')) return 'text-emerald-600 bg-emerald-50';
    if (title.includes('Expense')) return 'text-rose-600 bg-rose-50';
    if (title.includes('Balance') || title.includes('Net')) return 'text-indigo-600 bg-indigo-50';
    return 'text-slate-600 bg-slate-50';
  };

  const content = (
    <div className={`
        relative overflow-hidden bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm transition-all duration-300 group
        ${onClick ? 'hover:shadow-md hover:border-indigo-200 cursor-pointer' : ''}
    `}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${getIconStyles()} transition-transform group-hover:scale-110 duration-300`}>
          {React.cloneElement(icon as React.ReactElement, { width: 20, height: 20 })}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${trend.isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          <span className="text-sm text-slate-400 font-normal mr-1">{CURRENCY}</span>
          {formatRoundedNumber(amount || 0)}
        </div>
        {description && (
          <p className="text-xs text-slate-400 mt-2 truncate">{description}</p>
        )}
      </div>

      {onClick && (
        <div className="absolute top-4 right-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      )}
    </div>
  );

  if (onClick) {
    return <div onClick={onClick}>{content}</div>;
  }

  return content;
};

export default KPICard;