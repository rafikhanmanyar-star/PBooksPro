
import React, { ReactNode } from 'react';
import { CURRENCY } from '../../constants';
import { formatRoundedNumber } from '../../utils/numberUtils';

interface KPICardProps {
  title: string;
  amount: number;
  icon: ReactNode;
  colorClass?: string;
  onClick?: () => void;
  description?: string;
  trend?: { value: number; isPositive: boolean };
}

const KPICard: React.FC<KPICardProps> = ({ title, amount, icon, onClick, description, trend }) => {

  const getIconStyles = () => {
    if (title.includes('Income') || title.includes('Revenue')) {
      return 'text-ds-success bg-app-toolbar border border-app-border';
    }
    if (title.includes('Expense')) {
      return 'text-ds-danger bg-app-toolbar border border-app-border';
    }
    if (title.includes('Balance') || title.includes('Net')) {
      return 'text-primary bg-app-toolbar border border-app-border';
    }
    return 'text-app-muted bg-app-toolbar border border-app-border';
  };

  const content = (
    <div className={`
        relative overflow-hidden bg-app-card p-4 md:p-6 rounded-2xl border border-app-border shadow-ds-card transition-all duration-ds group touch-manipulation
        ${onClick ? 'hover:shadow-md hover:border-primary active:shadow-lg cursor-pointer' : ''}
    `}>
      <div className="flex justify-between items-start mb-3 md:mb-4">
        <div className={`p-2 md:p-3 rounded-xl ${getIconStyles()} transition-transform group-hover:scale-110 duration-300`}>
          {React.cloneElement(icon as React.ReactElement, { width: 18, height: 18, className: 'md:w-5 md:h-5' })}
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 md:gap-1 text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 md:py-1 rounded-full ${trend.isPositive ? 'ds-badge-paid' : 'ds-badge-unpaid'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs md:text-sm font-medium text-app-muted mb-1">{title}</h3>
        <div className="text-xl md:text-2xl font-bold text-app-text tracking-tight">
          <span className="text-xs md:text-sm text-app-muted font-normal mr-0.5 md:mr-1">{CURRENCY}</span>
          {formatRoundedNumber(amount || 0)}
        </div>
        {description && (
          <p className="text-[10px] md:text-xs text-app-muted mt-1 md:mt-2 truncate">{description}</p>
        )}
      </div>

      {onClick && (
        <div className="absolute top-3 right-3 md:top-4 md:right-4 text-app-muted opacity-0 group-hover:opacity-100 transition-opacity duration-ds">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="md:w-4 md:h-4"><polyline points="9 18 15 12 9 6"></polyline></svg>
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
