
import React from 'react';

interface TabsProps {
  tabs: string[];
  activeTab: string;
  onTabClick: (tab: string) => void;
}

const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onTabClick }) => {
  const getTabColor = (tab: string) => {
    switch(tab) {
        case 'Income': return 'border-green-600 text-green-600';
        case 'Expense': return 'border-red-600 text-red-600';
        case 'Transfer': return 'border-green-600 text-green-600';
        case 'Loan': return 'border-amber-500 text-amber-600';
        default: return 'border-gray-700 text-gray-700';
    }
  }

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-4 sm:space-x-6 overflow-x-auto no-scrollbar px-1" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabClick(tab)}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-semibold text-sm transition-colors duration-200 flex-shrink-0 select-none focus:outline-none
              ${ activeTab === tab
                ? `${getTabColor(tab)}`
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Tabs;
