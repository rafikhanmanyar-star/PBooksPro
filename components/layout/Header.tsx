
import React, { useState, useEffect, memo } from 'react';
import { APP_LOGO } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import SyncScannerModal from '../sync/SyncScannerModal';
import { syncService } from '../../services/SyncService';
import InstallPWA from '../pwa/InstallPWA';
import { ICONS } from '../../constants';

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  const { dispatch } = useAppContext();
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // Listen for sync status to update icon indicator
    const unsub = syncService.subscribe((state) => {
      setIsConnected(state.status === 'connected');
    });
    return unsub;
  }, []);

  return (
    <>
      {/* QuickBooks-style Dark Gray Header */}
      <header className="sticky top-0 z-30 bg-gray-700 border-b border-gray-600 transition-all duration-300">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Left Section: Hamburger Menu and Page Title */}
          <div className="flex items-center gap-3 flex-shrink-0 flex-1 min-w-0">
            {/* Hamburger Menu Icon */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded hover:bg-gray-600 transition-colors text-white"
              aria-label="Toggle menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            {/* Selected Page Title */}
            <h1 className="text-white font-semibold text-lg truncate">
              {title}
            </h1>
          </div>

          {/* Right Section: Action Icons */}
          <div className="flex items-center gap-1">
            {/* Plus Icon (New Item) */}
            <button
              className="p-2 rounded hover:bg-gray-600 transition-colors text-white"
              title="New"
              aria-label="New"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
            </button>

            {/* Search Icon */}
            <button
              className="p-2 rounded hover:bg-gray-600 transition-colors text-white"
              title="Search"
              aria-label="Search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>

            {/* Settings Icon */}
            <button
              className="p-2 rounded hover:bg-gray-600 transition-colors text-white"
              onClick={() => dispatch({ type: 'SET_PAGE', payload: 'settings' })}
              title="Settings"
              aria-label="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m16.97-6.364L16.95 7.05M7.05 16.95l-2.12 2.12M22.364 16.97L16.95 16.95M7.05 7.05l-2.12-2.12"></path>
              </svg>
            </button>

            {/* Help Icon */}
            <button
              className="p-2 rounded hover:bg-gray-600 transition-colors text-white"
              title="Help"
              aria-label="Help"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </button>

            {/* Mobile: Sync and PWA Icons */}
            <div className="md:hidden flex items-center gap-1 ml-2 pl-2 border-l border-gray-600">
              <InstallPWA variant="header" />
              
              <button 
                onClick={() => setIsScannerOpen(true)}
                className={`p-2 rounded transition-colors relative ${isConnected ? 'text-emerald-400' : 'text-white hover:bg-gray-600'}`}
                title={isConnected ? "Sync Connected" : "Sync with Desktop"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                  <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                  <line x1="12" y1="20" x2="12.01" y2="20"></line>
                </svg>
                
                {isConnected && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full border border-gray-700"></span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Optional: Progress Bar for User Limits (can be added later) */}
        {/* <div className="h-1 bg-gray-600">
          <div className="h-full bg-green-500" style={{ width: '60%' }}></div>
        </div> */}
      </header>

      <SyncScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
      />
    </>
  );
};

export default memo(Header);
