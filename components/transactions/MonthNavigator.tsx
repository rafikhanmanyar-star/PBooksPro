
import React from 'react';
import { ICONS } from '../../constants';

interface MonthNavigatorProps {
  currentDate: Date;
  onDateChange: (newDate: Date) => void;
}

const MonthNavigator: React.FC<MonthNavigatorProps> = ({ currentDate, onDateChange }) => {
  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    onDateChange(newDate);
  };

  const formattedDate = currentDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex items-center justify-between bg-white p-1 rounded-lg shadow-sm border border-slate-200/80 w-full sm:w-auto min-w-[200px]">
      <button onClick={() => changeMonth(-1)} className="p-2 rounded-md hover:bg-slate-100 text-slate-600 transition-colors flex-shrink-0">
        <div className="w-5 h-5">{ICONS.chevronLeft}</div>
      </button>
      <h3 className="text-base font-semibold text-slate-800 text-center px-2 truncate">{formattedDate}</h3>
      <button onClick={() => changeMonth(1)} className="p-2 rounded-md hover:bg-slate-100 text-slate-600 transition-colors flex-shrink-0">
        <div className="w-5 h-5">{ICONS.chevronRight}</div>
      </button>
    </div>
  );
};

export default MonthNavigator;