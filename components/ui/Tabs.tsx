
import React from 'react';

interface TabsProps {
  tabs: string[];
  activeTab: string;
  onTabClick: (tab: string) => void;
}

const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onTabClick }) => {
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
