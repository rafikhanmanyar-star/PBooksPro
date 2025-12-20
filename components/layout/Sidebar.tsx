
import React, { useState, useEffect, useCallback, memo } from 'react';
import { Page } from '../../types';
import { ICONS } from '../../constants';
import { useLicense } from '../../context/LicenseContext';
import RegistrationModal from '../license/RegistrationModal';
import InstallPWA from '../pwa/InstallPWA';
import { useAppContext } from '../../context/AppContext';
import { syncService } from '../../services/SyncService';
import Modal from '../ui/Modal';
import QRCode from 'qrcode';
import Button from '../ui/Button';
import packageJson from '../../package.json';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
  const { state, dispatch } = useAppContext();
  const { isRegistered, daysRemaining } = useLicense();
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);
  const { currentUser } = state;
  
  // Sync State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('disconnected');
  const [hostId, setHostId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    // Subscribe to sync service
    const unsub = syncService.subscribe((syncState) => {
        setSyncStatus(syncState.status);
    });
    return unsub;
  }, []);

  const handleStartSync = async () => {
      setIsSyncModalOpen(true);
      try {
          if (syncStatus === 'disconnected' || syncStatus === 'error') {
            const id = await syncService.startHosting();
            setHostId(id);
            // Generate QR
            const url = await QRCode.toDataURL(JSON.stringify({ hostId: id, type: 'finance-sync' }));
            setQrCodeUrl(url);
          }
      } catch (e) {
          console.error("Failed to start hosting", e);
      }
  };

  const handleDisconnect = () => {
      syncService.disconnect();
      setIsSyncModalOpen(false);
  };

  // Determine allowed pages based on role
  const isAccountsOnly = currentUser?.role === 'Accounts';
  
  const navItems: { page: Page; label: string; icon: React.ReactElement }[] = [
    { page: 'dashboard', label: 'Dashboard', icon: ICONS.home },
    { page: 'transactions', label: 'General Ledger', icon: ICONS.trendingUp },
    { page: 'rentalManagement', label: 'Rental Management', icon: ICONS.building },
    { page: 'projectManagement', label: 'Project Management', icon: ICONS.archive },
    { page: 'payroll', label: 'Payroll', icon: ICONS.users }, // Added Payroll
    { page: 'vendorDirectory', label: 'Vendors', icon: ICONS.briefcase },
    { page: 'loans', label: 'Loan Manager', icon: ICONS.loan },
    { page: 'contacts', label: 'Contacts', icon: ICONS.addressBook },
    { page: 'budgets', label: 'Budget Planner', icon: ICONS.barChart },
    { page: 'tasks', label: 'Tasks', icon: ICONS.clipboard },
  ];

  if (!isAccountsOnly) {
      navItems.push({ page: 'settings', label: 'Configuration', icon: ICONS.settings });
  }

  const isCurrent = (itemPage: Page) => {
    if (currentPage === itemPage) return true;
    if (itemPage === 'rentalManagement' && (currentPage.startsWith('rental') || currentPage === 'ownerPayouts')) return true;
    if (itemPage === 'projectManagement' && (currentPage.startsWith('project') || currentPage === 'bills')) return true;
    if (itemPage === 'payroll' && currentPage === 'payroll') return true;
    return false;
  };

  const handleLogout = () => {
      if(confirm('Are you sure you want to logout?')) {
          syncService.disconnect();
          dispatch({ type: 'LOGOUT' });
      }
  };

  return (
    <>
    {/* QuickBooks-style White Sidebar */}
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed left-0 top-0 h-full z-40 shadow-sm">
        {/* Sidebar Header - Empty or minimal for QuickBooks style */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200 justify-between">
             <h1 className="text-lg font-semibold text-gray-800 tracking-tight">
              My Projects Pro
            </h1>
            {syncStatus === 'connected' && (
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" title="Device Connected"></span>
            )}
        </div>
        
        {/* User Info Block - QuickBooks style */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Logged in as</div>
            <div className="flex items-center justify-between">
                <div className="font-medium text-gray-900 truncate text-sm">{currentUser?.name}</div>
                <div className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">{currentUser?.role}</div>
            </div>
        </div>

        {/* Navigation Menu - QuickBooks style */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => (
            <button
                key={item.page}
                onClick={() => setCurrentPage(item.page)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all duration-150
                ${
                    isCurrent(item.page)
                    ? 'bg-green-50 text-green-700 border-l-4 border-green-600'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
                aria-current={isCurrent(item.page)}
            >
                <div className={`w-5 h-5 flex-shrink-0 ${isCurrent(item.page) ? 'text-green-600' : 'text-gray-500'}`}>{item.icon}</div>
                <span className="truncate text-left">{item.label}</span>
            </button>
            ))}
            
            {/* Sync Mobile Button */}
            <button
                onClick={handleStartSync}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150 mt-2 border-t border-gray-200 pt-3"
            >
                <div className="w-5 h-5 flex-shrink-0 text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </div>
                <span className="truncate text-left">Sync Mobile</span>
                {syncStatus === 'connected' && <span className="text-[10px] bg-emerald-500 text-white px-1.5 rounded ml-auto">ON</span>}
            </button>
      </nav>
      
      {/* Footer Section */}
      <div className="p-4 border-t border-gray-200 space-y-2 bg-gray-50">
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded transition-colors"
          >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Logout
          </button>

          <div className="w-full pt-1">
            <InstallPWA />
          </div>
          
          <div className="text-xs text-gray-500 text-center">v{packageJson.version}</div>
          
          {isRegistered ? (
              <div className="flex items-center justify-center gap-1 text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 py-1.5 px-2 rounded text-xs">
                  <span className="text-[10px]">✓</span> Registered Pro
              </div>
          ) : (
              <div className="bg-white rounded p-2 border border-gray-300 text-center">
                  <div className={`font-semibold mb-1.5 text-xs ${daysRemaining <= 5 ? 'text-red-600' : 'text-amber-600'}`}>
                      Trial: {daysRemaining} Days Left
                  </div>
                  <button 
                    onClick={() => setIsRegModalOpen(true)}
                    className="text-[10px] bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded w-full transition-colors font-medium"
                  >
                      Activate Now
                  </button>
              </div>
          )}
      </div>
    </aside>
    <RegistrationModal isOpen={isRegModalOpen} onClose={() => setIsRegModalOpen(false)} />
    
    <Modal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} title="Sync with Mobile">
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
            {syncStatus === 'connected' ? (
                <div className="text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Connected!</h3>
                    <p className="text-sm text-slate-600 mt-2">Data is syncing in real-time.</p>
                    
                    <div className="mt-6 w-full">
                        <Button variant="danger" onClick={handleDisconnect} className="w-full justify-center">
                            Disconnect Session
                        </Button>
                    </div>
                </div>
            ) : qrCodeUrl ? (
                <>
                    <p className="text-sm text-slate-600 text-center">Scan this QR code with the mobile app to sync data.</p>
                    <div className="p-4 bg-white border rounded-lg shadow-sm">
                        <img src={qrCodeUrl} alt="Sync QR Code" className="w-48 h-48" />
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-2">{hostId}</div>
                    <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">Keep this window open to maintain connection.</p>
                </>
            ) : (
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
                    <p className="text-sm text-slate-500">Initializing Secure P2P Session...</p>
                </div>
            )}
            
            <div className="w-full flex justify-end pt-4">
                <Button variant="secondary" onClick={() => setIsSyncModalOpen(false)}>Close</Button>
            </div>
        </div>
    </Modal>
    </>
  );
};

export default memo(Sidebar);
