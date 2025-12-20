
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

interface DatePickerProps {
  value: string; // ISO string YYYY-MM-DD
  onChange: (date: Date) => void;
  label?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, label, id, name, disabled, required, placeholder }) => {
  // Generate an id if not provided (for accessibility)
  const inputId = id || (label ? `datepicker-${name || label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Positioning state
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [direction, setDirection] = useState<'down' | 'up'>('down');

  const getSafeDate = (val: string | undefined) => {
      if (!val) return new Date();
      const d = new Date(val + 'T00:00:00');
      return isNaN(d.getTime()) ? new Date() : d;
  };

  const [currentMonth, setCurrentMonth] = useState(getSafeDate(value));

  // Sync input text with external value prop
  useEffect(() => {
    setInputValue(formatDate(value));
    const d = getSafeDate(value);
    if (!isNaN(d.getTime())) {
        setCurrentMonth(d);
    }
  }, [value]);

  // Update position when opening or scrolling
  const updatePosition = () => {
      if (wrapperRef.current && isOpen) {
          const rect = wrapperRef.current.getBoundingClientRect();
          const screenHeight = window.innerHeight;
          const spaceBelow = screenHeight - rect.bottom;
          const calendarHeight = 320; // Approx height

          // Decide direction based on available space
          let newDirection: 'down' | 'up' = 'down';
          if (spaceBelow < calendarHeight && rect.top > calendarHeight) {
              newDirection = 'up';
          }
          setDirection(newDirection);

          setPosition({
              top: newDirection === 'down' ? rect.bottom + window.scrollY : rect.top + window.scrollY - calendarHeight - 8,
              left: rect.left + window.scrollX
          });
      }
  };

  useEffect(() => {
      if (isOpen) {
          updatePosition();
          // Use capture: true to detect scroll on parent elements (like modals)
          window.addEventListener('scroll', updatePosition, true);
          window.addEventListener('resize', updatePosition);
      }
      return () => {
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
      };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both the input wrapper AND the portal calendar
      if (
          wrapperRef.current && !wrapperRef.current.contains(target) &&
          calendarRef.current && !calendarRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const parseDateInput = (input: string): Date | null => {
      // Try DD/MM/YYYY
      const dmyMatch = input.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (dmyMatch) {
          const d = parseInt(dmyMatch[1], 10);
          const m = parseInt(dmyMatch[2], 10) - 1;
          const y = parseInt(dmyMatch[3], 10);
          const date = new Date(y, m, d);
          if (!isNaN(date.getTime()) && date.getDate() === d) return date;
      }
      // Try YYYY-MM-DD
      const ymdMatch = input.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
      if (ymdMatch) {
          const y = parseInt(ymdMatch[1], 10);
          const m = parseInt(ymdMatch[2], 10) - 1;
          const d = parseInt(ymdMatch[3], 10);
          const date = new Date(y, m, d); 
          if (!isNaN(date.getTime()) && date.getDate() === d) return date;
      }
      return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      const parsedDate = parseDateInput(val);
      if (parsedDate) {
          const utcDate = new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()));
          onChange(utcDate);
          setCurrentMonth(parsedDate);
      }
  };

  const generateCalendarGrid = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    if (isNaN(year) || isNaN(month)) return [];
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (Date | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) grid.push(null);
    for (let i = 1; i <= daysInMonth; i++) grid.push(new Date(year, month, i));
    return grid;
  };

  const calendarGrid = generateCalendarGrid();

  const changeMonth = (offset: number) => {
    setCurrentMonth(prev => {
        const newDate = new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
        return isNaN(newDate.getTime()) ? new Date() : newDate;
    });
  };

  const handleDateSelect = (date: Date) => {
    if (isNaN(date.getTime())) return;
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    onChange(utcDate);
    setIsOpen(false);
  };
  
  const inputClassName = `block w-full px-3 py-3 sm:py-2 border rounded-lg shadow-sm placeholder-gray-400 focus:outline-none text-base sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500/50 focus:border-green-500 border-gray-300 transition-colors`;

  return (
    <div className="relative" ref={wrapperRef}>
        {label && <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="relative">
        <input
            id={inputId}
            name={name || inputId}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => !disabled && setIsOpen(true)}
            onClick={() => !disabled && setIsOpen(true)}
            className={inputClassName}
            disabled={disabled}
            required={required}
            placeholder={placeholder || "DD/MM/YYYY"}
            autoComplete="off"
        />
        <div 
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
            onClick={() => !disabled && setIsOpen(!isOpen)}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        </div>
      </div>

      {isOpen && !disabled && createPortal(
        <div 
            ref={calendarRef}
            className="fixed z-[9999] w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-4 animate-fade-in-fast"
            style={{ 
                top: position.top, 
                left: position.left,
                // Center on mobile if screen width is narrow
                ...(window.innerWidth < 640 ? {
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    position: 'fixed'
                } : {})
            }}
        >
            {/* Mobile Overlay for closing */}
            <div className="fixed inset-0 bg-black/20 z-[-1] sm:hidden" onClick={() => setIsOpen(false)}></div>

            <div className="flex justify-between items-center mb-4 relative z-10">
                <button type="button" onClick={() => changeMonth(-1)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
                    <div className="w-5 h-5">{ICONS.chevronLeft}</div>
                </button>
                <h3 className="text-base font-semibold text-gray-800">
                    {isValidDate(currentMonth) ? currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' }) : 'Invalid Date'}
                </h3>
                <button type="button" onClick={() => changeMonth(1)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
                    <div className="w-5 h-5">{ICONS.chevronRight}</div>
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 mb-2 relative z-10">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => <div key={i}>{day}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-1 relative z-10">
                {calendarGrid.map((date, i) => {
                    if (!date) return <div key={`empty-${i}`} />;
                    
                    const valueDate = getSafeDate(value);
                    const isSelected = isValidDate(valueDate) && 
                        date.getDate() === valueDate.getDate() &&
                        date.getMonth() === valueDate.getMonth() &&
                        date.getFullYear() === valueDate.getFullYear();
                    
                    const today = new Date();
                    const isToday = date.getDate() === today.getDate() &&
                        date.getMonth() === today.getMonth() &&
                        date.getFullYear() === today.getFullYear();

                    let classes = 'w-9 h-9 flex items-center justify-center rounded-full cursor-pointer transition-colors text-sm ';
                    if (isSelected) classes += 'bg-green-600 text-white font-bold';
                    else if (isToday) classes += 'bg-gray-200 text-gray-800';
                    else classes += 'hover:bg-gray-100 text-gray-700';

                    return (
                        <button
                            type="button"
                            key={i}
                            className={classes}
                            onClick={() => handleDateSelect(date)}
                        >
                            {date.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());

export default DatePicker;
