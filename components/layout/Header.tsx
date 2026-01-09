import React, { useState, memo } from 'react';
import { useAppContext } from '../../context/AppContext';
import SearchModal from './SearchModal';
import HelpModal from './HelpModal';

interface HeaderProps {
  title: string;
  isNavigating?: boolean;
}

const Header: React.FC<HeaderProps> = ({ title, isNavigating = false }) => {
  const { dispatch, state } = useAppContext();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile menu logic if needed
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Format breadcrumbs based on current page
  const getBreadcrumbs = () => {
    return (
      <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500">
        <span className="hover:text-slate-800 cursor-pointer transition-colors" onClick={() => dispatch({ type: 'SET_PAGE', payload: 'dashboard' })}>Home</span>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-900">{title}</span>
      </div>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-sm transition-all duration-300">
        {isNavigating && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-pulse" />
        )}

        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          {/* Left: Mobile Toggle & Breadcrumbs */}
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
              aria-label="Toggle sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>

            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-slate-900 leading-tight md:hidden">{title}</h1>
              {getBreadcrumbs()}
            </div>
          </div>

          {/* Center: Command Bar (Fake Input) */}
          <div className="hidden md:flex flex-1 max-w-xl justify-center">
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="w-full max-w-md flex items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-400 rounded-xl hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all group touch-manipulation"
              aria-label="Search"
            >
              <svg className="text-slate-400 group-hover:text-indigo-500 transition-colors" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <span className="flex-1 text-left text-sm font-medium">Search transactions, contacts...</span>
              <div className="flex items-center gap-1">
                <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-500">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-4 justify-end flex-1">

            <button
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors relative group hidden sm:block min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
              title="Notifications"
              aria-label="Notifications"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 0 0 1 1-3.46 0"></path></svg>
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>

            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors hidden sm:block min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
              title="Help & Support"
              aria-label="Help & Support"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            <div className="flex items-center gap-2">
              {/* Mobile Search Trigger */}
              <button
                onClick={() => setIsSearchModalOpen(true)}
                className="p-2 md:hidden text-slate-500 min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
                aria-label="Search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>
            </div>
          </div>

        </div>
      </header>

      {isSearchModalOpen && <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} currentPage={state.currentPage} />}
      {isHelpModalOpen && <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} currentPage={state.currentPage} />}
    </>
  );
};

export default memo(Header);
