
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
    <div className="flex items-center justify-between bg-app-surface-2 p-0.5 rounded-lg border border-app-border w-full sm:w-auto min-w-[180px]">
      <button type="button" onClick={() => changeMonth(-1)} className="p-1 rounded-md hover:bg-app-toolbar text-app-muted hover:text-app-text transition-colors duration-ds flex-shrink-0">
        <div className="w-4 h-4">{ICONS.chevronLeft}</div>
      </button>
      <h3 className="text-xs font-semibold text-app-text text-center px-2 truncate">{formattedDate}</h3>
      <button type="button" onClick={() => changeMonth(1)} className="p-1 rounded-md hover:bg-app-toolbar text-app-muted hover:text-app-text transition-colors duration-ds flex-shrink-0">
        <div className="w-4 h-4">{ICONS.chevronRight}</div>
      </button>
    </div>
  );
};

export default MonthNavigator;