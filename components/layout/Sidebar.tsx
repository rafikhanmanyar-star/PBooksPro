
import React, { useState, useEffect, useCallback, memo } from 'react';
import { Page } from '../../types';
import { ICONS, APP_LOGO } from '../../constants';
import { useLicense } from '../../context/LicenseContext';
import RegistrationModal from '../license/RegistrationModal';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import packageJson from '../../package.json';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
    const { state, dispatch } = useAppContext();
    const { isRegistered, daysRemaining } = useLicense();
    const { logout, tenant } = useAuth();
    const { currentUser } = state;
    const [isRegModalOpen, setIsRegModalOpen] = useState(false);

    // Determine allowed pages based on role
    const isAccountsOnly = currentUser?.role === 'Accounts';

    const navGroups = [
        {
            title: 'Overview',
            items: [
                { page: 'dashboard', label: 'Dashboard', icon: ICONS.home },
                { page: 'tasks', label: 'Tasks & Todos', icon: ICONS.clipboard },
            ]
        },
        {
            title: 'Financials',
            items: [
                { page: 'transactions', label: 'General Ledger', icon: ICONS.trendingUp },
                { page: 'budgets', label: 'Budget Planner', icon: ICONS.barChart },
                { page: 'investmentManagement', label: 'Investments', icon: ICONS.dollarSign },
                { page: 'loans', label: 'Loan Manager', icon: ICONS.loan },
            ]
        },
        {
            title: 'Operations',
            items: [
                { page: 'projectManagement', label: 'Projects', icon: ICONS.archive },
                { page: 'rentalManagement', label: 'Rentals', icon: ICONS.building },
                { page: 'vendorDirectory', label: 'Vendors', icon: ICONS.briefcase },
                { page: 'pmConfig', label: 'PM Cycle', icon: ICONS.filter },
            ]
        },
        {
            title: 'People',
            items: [
                { page: 'contacts', label: 'Contacts', icon: ICONS.addressBook },
                { page: 'payroll', label: 'Payroll', icon: ICONS.users },
            ]
        }
    ];

    if (!isAccountsOnly) {
        navGroups.push({
            title: 'System',
            items: [
                { page: 'settings', label: 'Settings', icon: ICONS.settings },
            ]
        });
    }

    const isCurrent = (itemPage: Page) => {
        if (currentPage === itemPage) return true;
        if (itemPage === 'rentalManagement' && (currentPage.startsWith('rental') || currentPage === 'ownerPayouts')) return true;
        if (itemPage === 'projectManagement' && (currentPage.startsWith('project') || currentPage === 'bills')) return true;
        if (itemPage === 'payroll' && currentPage === 'payroll') return true;
        return false;
    };

    const handleLogout = async () => {
        if (confirm('Are you sure you want to logout?')) {
            try {
                // Call logout API to clear session
                await logout();
                // Clear local state
                dispatch({ type: 'LOGOUT' });
                // Clear localStorage
                localStorage.removeItem('last_tenant_id');
                localStorage.removeItem('last_identifier');
                // Redirect to login - will be handled by AuthContext
                window.location.href = '/';
            } catch (error) {
                console.error('Logout error:', error);
                // Still clear local state even if API call fails
                dispatch({ type: 'LOGOUT' });
                window.location.href = '/';
            }
        }
    };

    return (
        <>
            {/* Premium Dark Sidebar */}
            <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 fixed left-0 top-0 h-full z-40 text-slate-300">

                {/* Brand Header */}
                <div className="h-14 flex items-center px-5 border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-900/20 text-sm">
                            P
                        </div>
                        <div>
                            <h1 className="text-sm font-bold tracking-wide">
                                <span className="text-red-500">P</span>
                                <span className="text-white">Books</span>
                                <span className="text-indigo-400">Pro</span>
                            </h1>
                            <div className="text-[10px] text-slate-500 font-mono">v{packageJson.version}</div>
                        </div>
                    </div>
                </div>

                {/* Navigation Menu */}
                <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {navGroups.map((group, idx) => (
                        <div key={idx}>
                            <h3 className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 opacity-80">{group.title}</h3>
                            <div className="space-y-0.5">
                                {group.items.map((item) => {
                                    const active = isCurrent(item.page as Page);
                                    return (
                                        <button
                                            key={item.page}
                                            onClick={() => setCurrentPage(item.page as Page)}
                                            className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 group
                                    ${active
                                                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30'
                                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                                }`}
                                        >
                                            <div className={`transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                                {/* Clone element to force size if needed, though usually controlled by SVG props */}
                                                {React.cloneElement(item.icon as any, { width: 16, height: 16 })}
                                            </div>
                                            <span className="truncate">{item.label}</span>
                                            {active && <div className="ml-auto w-1 h-1 rounded-full bg-white/50"></div>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Footer / User Profile */}
                <div className="p-3 border-t border-slate-800 bg-slate-900/50">

                    {!isRegistered && (
                        <button
                            onClick={() => setIsRegModalOpen(true)}
                            className="w-full mb-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white p-2.5 rounded-lg shadow-lg relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <div className="relative flex items-center justify-between">
                                <div className="text-left">
                                    <div className="text-[10px] font-bold opacity-90">Trial Version</div>
                                    <div className="text-sm font-bold leading-tight">{daysRemaining} Days</div>
                                </div>
                                <div className="bg-white/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                                    Activate
                                </div>
                            </div>
                        </button>
                    )}

                    <div className="space-y-2">
                        {/* User Info */}
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-[10px] shadow-inner">
                                {currentUser?.name?.charAt(0) || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate leading-tight">{currentUser?.name}</div>
                                <div className="text-[10px] text-slate-400 truncate capitalize">{currentUser?.role}</div>
                                {tenant && (
                                    <div className="text-[10px] text-slate-500 truncate mt-0.5" title={tenant.companyName || tenant.name}>
                                        {tenant.companyName || tenant.name}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Logout Button */}
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white group"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                            <span className="text-xs font-medium">Logout</span>
                        </button>
                    </div>
                </div>
            </aside>
            <RegistrationModal isOpen={isRegModalOpen} onClose={() => setIsRegModalOpen(false)} />
        </>
    );
};

export default memo(Sidebar);
