
import React, { memo, useCallback } from 'react';
import { Page } from '../../types';
import { ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';

interface FooterProps {
  isPanelOpen: boolean;
}

const Footer: React.FC<FooterProps> = ({ isPanelOpen }) => {
  const { state, dispatch } = useAppContext();
  const { currentPage } = state;
  
  // Direct navigation - no transition overhead
  const handleNavigate = useCallback((page: Page) => {
    dispatch({ type: 'SET_PAGE', payload: page });
  }, [dispatch]);

  // Optimized for mobile day-to-day operations
  const navItems = [
    { page: 'dashboard' as Page, label: 'Dashboard', icon: ICONS.home },
    { page: 'transactions' as Page, label: 'Ledger', icon: ICONS.trendingUp },
    { page: 'payments' as Page, label: 'Payments', icon: ICONS.dollarSign },
    { page: 'tasks' as Page, label: 'Tasks', icon: ICONS.clipboard },
    { page: 'settings' as Page, label: 'Config', icon: ICONS.settings },
  ];

  return (
    <footer className={`fixed bottom-0 right-0 bg-white shadow-top border-t border-gray-200 z-40 transition-all duration-300 ease-in-out ${isPanelOpen ? 'md:left-80' : 'left-0'}`}>
      <nav className="flex justify-around items-center h-16 overflow-x-auto no-scrollbar">
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => handleNavigate(item.page)}
            className={`flex flex-col items-center justify-center flex-1 h-full min-w-[4rem] transition-colors duration-200
              ${
                currentPage === item.page
                  ? 'text-green-600 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            <div className={`w-6 h-6 ${currentPage === item.page ? 'text-green-600' : 'text-gray-500'}`}>{item.icon}</div>
            <span className="text-[10px] sm:text-xs mt-1 truncate w-full text-center px-1">{item.label}</span>
          </button>
        ))}
      </nav>
    </footer>
  );
};

export default memo(Footer);
