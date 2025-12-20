import React, { ReactNode } from 'react';
import { CURRENCY } from '../../constants';

interface KPICardProps {
  title: string;
  amount: number;
  icon: ReactNode;
  colorClass: string;
  onClick?: () => void;
  description?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, amount, icon, colorClass, onClick, description }) => {
  const cardContent = (
    <div className={`p-4 sm:p-5 rounded-xl shadow-md transition-all duration-300 ${onClick ? 'hover:shadow-xl hover:-translate-y-1' : ''} ${colorClass}`}>
      <div className="flex justify-between items-center">
        <h3 className="text-sm sm:text-base font-semibold opacity-80">{title}</h3>
        <div className="w-6 h-6 sm:w-8 sm:h-8 opacity-70">{icon}</div>
      </div>
      <p className="text-xl sm:text-3xl font-bold mt-2 truncate">{CURRENCY} {(amount || 0).toLocaleString()}</p>
      {description && <p className="text-xs sm:text-sm opacity-80 mt-1">{description}</p>}
    </div>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded-xl">
        {cardContent}
      </button>
    );
  }

  return cardContent;
};

export default KPICard;