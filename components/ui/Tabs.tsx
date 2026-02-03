
import React from 'react';

interface TabsProps {
  tabs: string[];
  activeTab: string;
  onTabClick: (tab: string) => void;
  variant?: 'default' | 'pill' | 'browser';
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onTabClick, variant = 'default', className = '' }) => {
  const getTabColor = (tab: string) => {
    switch(tab) {
        case 'Income': return 'text-green-600';
        case 'Expense': return 'text-red-600';
        case 'Transfer': return 'text-green-600';
        case 'Loan': return 'text-amber-600';
        case 'General':
        case 'ID Sequences':
        case 'Communication & Branding':
        case 'Tools & Utilities':
        case 'Backup and Restore':
        case 'Import and Export':
            return 'text-indigo-600';
        default: return 'text-gray-700';
    }
  };

  // Browser-style variant: trapezoidal tabs, rounded top / straight bottom, seamless with content (app colors)
  if (variant === 'browser') {
    return (
      <div className={`flex flex-col ${className}`} aria-label="Tabs">
        <nav
          className="flex rounded-t-lg overflow-hidden bg-slate-200 pt-1.5 px-1.5 pb-0 gap-0.5"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabClick(tab)}
                className={`whitespace-nowrap py-2 px-4 text-sm font-medium transition-all duration-200 flex-shrink-0 select-none focus:outline-none
                  rounded-t-lg border-t border-x border-transparent
                  ${isActive
                    ? 'bg-white text-slate-900 border-slate-300 shadow-[0_-1px_0_0_rgba(255,255,255,1)] -mb-px z-10'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200/80 border-transparent'
                  }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  // Pill variant: single rounded pill container, active = highlighted pill + white bold + ring + shadow
  if (variant === 'pill') {
    return (
      <div className={`flex items-center ${className}`} aria-label="Tabs">
        <nav
          className="inline-flex rounded-full p-1 bg-[#2E3A4E] overflow-x-auto no-scrollbar"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabClick(tab)}
                className={`whitespace-nowrap py-2 px-4 text-sm transition-all duration-200 flex-shrink-0 select-none focus:outline-none rounded-full
                  ${isActive
                    ? 'bg-[#4B6A9E] text-white font-bold shadow-md shadow-black/25 ring-2 ring-white/30'
                    : 'bg-transparent text-[#A3B0C2] font-normal hover:text-slate-200'
                  }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="bg-slate-200 border-b border-slate-300">
      <nav className="flex space-x-0.5 overflow-x-auto no-scrollbar px-2 pt-1.5" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          const tabColorClass = getTabColor(tab);
          
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabClick(tab)}
              className={`whitespace-nowrap py-2.5 px-5 font-medium text-sm transition-all duration-200 flex-shrink-0 select-none focus:outline-none relative
                ${ isActive
                  ? `bg-white text-slate-900 rounded-t-md border-t-2 border-l border-r border-slate-300 ${tabColorClass}`
                  : 'bg-transparent text-slate-600 hover:text-slate-800 rounded-t-md'
                }`}
              style={isActive ? {
                marginBottom: '-1px',
                zIndex: 10
              } : {}}
            >
              {tab}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default Tabs;
