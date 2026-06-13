
import React, { useState, useEffect, useCallback, memo } from 'react';
import { Page } from '../../types';
import { ICONS } from '../../constants';
import LicenseManagement from '../license/LicenseManagement';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import { useLicense } from '../../context/LicenseContext';
import { apiClient } from '../../services/api/client';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useCompanyOptional } from '../../context/CompanyContext';
import { useUpdate } from '../../context/UpdateContext';
import packageJson from '../../package.json';
import ChatModal from '../chat/ChatModal';
import { connectRealtimeSocket } from '../../core/socket';
import { ChatMessagesRepository } from '../../services/database/repositories';
import { getDatabaseService } from '../../services/database/databaseService';
import { getInMemoryUnreadCount, subscribeInMemoryChat } from '../../services/chat/inMemoryChatStore';
import Modal from '../ui/Modal';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useViewport } from '../../context/ViewportContext';
import { isAdminRole } from '../../hooks/useRecordLock';
import { usePermissions } from '../../hooks/usePermissions';
import NavGroupHeader from './NavGroupHeader';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

/** Sidebar entries that get a persistent accent so frequent modules stand out */
const PRIMARY_SIDEBAR_MODULE_PAGES: ReadonlySet<Page> = new Set([
    'projectSelling',
    'projectManagement',
    'rentalManagement',
    'accounting',
]);

function isPrimarySidebarModule(page: Page): boolean {
    return PRIMARY_SIDEBAR_MODULE_PAGES.has(page);
}

const TOUR_DATA_ATTR: Partial<Record<string, string>> = {
    dashboard: 'nav-dashboard',
    rentalManagement: 'nav-rental',
    projectManagement: 'nav-projects',
    projectSelling: 'nav-project-selling',
    transactions: 'nav-ledger',
    budgets: 'nav-budgets',
    accounting: 'nav-accounting',
    vendorDirectory: 'nav-vendors',
    settings: 'nav-settings',
};

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
    const { mainNavCollapsed, toggleMainNav } = useViewport();

    const mainNavToggleTitle = mainNavCollapsed ? 'Expand navigation' : 'Collapse navigation to icons';
    const dispatch = useDispatchOnly();
    const currentUser = useStateSelector(s => s.currentUser);
    const { logout, tenant, user } = useAuth();
    const { hasModule } = useLicense();
    const companyCtx = useCompanyOptional();
    const { appVersion, isElectronUpdate } = useUpdate();
    const displayVersion = isElectronUpdate ? (appVersion ?? '...') : packageJson.version;
    const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<number | null>(null);
    const [onlineUsersList, setOnlineUsersList] = useState<any[]>([]);
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    const [unreadMessageCount, setUnreadMessageCount] = useState(0);
    const [licenseInfo, setLicenseInfo] = useState<{
        licenseStatus: string;
        daysRemaining: number;
        isExpired: boolean;
    } | null>(null);

    // Get user name - prefer AuthContext user (cloud auth) over AppContext currentUser (local)
    // Fallback order: name -> username -> 'User'
    const userName = user?.name || currentUser?.name || user?.username || currentUser?.username || 'User';
    /** Prefer JWT/API user role over AppState (LAN login may not sync currentUser). */
    const effectiveRole = user?.role || currentUser?.role || '';
    const organizationName = tenant?.companyName || tenant?.name || '';
    const currentUserId = user?.id || currentUser?.id || '';

    const chatRepo = new ChatMessagesRepository();

    // Fetch license status (skip in local-only)
    useEffect(() => {
        const fetchLicenseStatus = async () => {
            if (!apiClient.getToken()) return;
            try {
                const response = await apiClient.get<{
                    licenseStatus: string;
                    daysRemaining: number;
                    isExpired: boolean;
                }>('/tenants/license-status');
                setLicenseInfo(response);
            } catch (error) {
                console.error('Error fetching license status:', error);
            }
        };

        if (!isLocalOnlyMode() && (user || currentUser)) {
            fetchLicenseStatus();
            const interval = setInterval(fetchLicenseStatus, 300000);
            return () => clearInterval(interval);
        }
    }, [user, currentUser]);

    const fetchOnlineUsersCount = useCallback(async () => {
        if (!apiClient.getToken()) return;
        try {
            const countResponse = await apiClient.get<{ onlineUsers: number }>('/tenants/online-users-count');
            setOnlineUsers(countResponse.onlineUsers);
        } catch (error) {
            if (import.meta.env.DEV) {
                console.warn('Online user count unavailable:', error);
            }
        }
    }, []);

    const fetchOnlineUsersList = useCallback(async () => {
        if (!apiClient.getToken()) return;
        try {
            const listResponse = await apiClient.get<any[]>('/tenants/online-users');
            setOnlineUsersList(listResponse || []);
        } catch (error) {
            if (import.meta.env.DEV) {
                console.warn('Online users list unavailable:', error);
            }
        }
    }, []);

    // Poll online user count only (lightweight; list loads when chat opens).
    useEffect(() => {
        if (!isLocalOnlyMode() && (user || currentUser)) {
            void fetchOnlineUsersCount();
            const interval = setInterval(() => {
                void fetchOnlineUsersCount();
            }, 60000);
            return () => clearInterval(interval);
        }
    }, [user, currentUser, fetchOnlineUsersCount]);

    useEffect(() => {
        if (isChatModalOpen && !isLocalOnlyMode()) {
            void fetchOnlineUsersList();
        }
    }, [isChatModalOpen, fetchOnlineUsersList]);

    // Check for unread messages
    const checkUnreadMessages = useCallback(() => {
        if (!currentUserId) return;
        try {
            if (!isLocalOnlyMode()) {
                setUnreadMessageCount(getInMemoryUnreadCount(currentUserId));
                return;
            }
            const dbService = getDatabaseService();
            if (!dbService.isReady()) {
                return;
            }
            const count = chatRepo.getUnreadCount(currentUserId);
            setUnreadMessageCount(count);
        } catch (error) {
            console.error('Error checking unread messages:', error);
        }
    }, [currentUserId]);

    useEffect(() => {
        if (isLocalOnlyMode()) return;
        return subscribeInMemoryChat(() => {
            if (currentUserId) {
                setUnreadMessageCount(getInMemoryUnreadCount(currentUserId));
            }
        });
    }, [currentUserId]);

    // Listen for incoming chat messages via Socket.IO (same connection as AppContext entity sync)
    useEffect(() => {
        if (isLocalOnlyMode() || !currentUserId) return;

        const token = apiClient.getToken();
        if (!token) return;

        checkUnreadMessages();

        const socket = connectRealtimeSocket(token);
        const handleChatMessage = (data: { recipientId?: string }) => {
            if (data.recipientId === currentUserId) {
                checkUnreadMessages();
            }
        };

        socket.on('chat:message', handleChatMessage);

        return () => {
            socket.off('chat:message', handleChatMessage);
        };
    }, [currentUserId, checkUnreadMessages]);

    // Update unread count when chat modal opens/closes
    useEffect(() => {
        if (currentUserId) {
            if (isChatModalOpen) {
                // Reset unread count when modal opens (messages will be marked as read when conversation is selected)
                setUnreadMessageCount(0);
            } else {
                // Check for unread messages when modal closes (in case new messages arrived while modal was open)
                checkUnreadMessages();
            }
        }
    }, [isChatModalOpen, currentUserId, checkUnreadMessages]);

    const roleLc = effectiveRole.toLowerCase();
    const isAccountsOnly = roleLc === 'accounts';
    const isAdmin = isAdminRole(effectiveRole);
    const {
        enterpriseRole,
        canReadProjectSelling,
        canWriteFinancial,
        canReadPayroll,
    } = usePermissions();
    const isSalesFocusedUser = enterpriseRole === 'sales_user';
    const canAccessProjectSellingNav = canReadProjectSelling;

    /** Show count below the user card: LAN/API when server count loaded; local-only = single session. */
    const showLoggedInUsersRow =
        (isLocalOnlyMode() && !!(user || currentUser)) ||
        (!isLocalOnlyMode() && onlineUsers !== null);
    const loggedInUsersCount = isLocalOnlyMode() ? 1 : (onlineUsers ?? 0);

    // Persisted state for collapsible groups
    const [collapsedGroups, setCollapsedGroups] = useLocalStorage<Record<string, boolean>>('sidebar_collapsed_groups', {});

    const handleToggleGroup = useCallback((title: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [title]: !prev[title]
        }));
    }, [setCollapsedGroups]);

    // Navigation groups - defined as a stable constant to prevent re-render issues
    // Payroll and other core modules are always visible regardless of auth state
    const navGroups = React.useMemo(() => {
        const groups = [
            {
                title: 'Overview',
                items: [
                    { page: 'dashboard', label: 'Dashboard', icon: ICONS.home },
                ]
            },
            {
                title: 'Financials',
                items: [
                    { page: 'transactions', label: 'General Ledger', icon: ICONS.trendingUp },
                    { page: 'accounting', label: 'Accounting', icon: ICONS.clipboard },
                    ...(isAdmin ? [{ page: 'personalTransactions', label: 'Personal transactions', icon: ICONS.wallet }] : []),
                    { page: 'budgets', label: 'Budget Planner', icon: ICONS.barChart },
                ]
            },
            {
                title: 'Selling',
                items: [
                    { page: 'projectSelling', label: 'Project selling', icon: ICONS.trendingUp },
                    { page: 'investmentManagement', label: 'Inv Mgmt', icon: ICONS.dollarSign },
                ]
            },
            {
                title: 'Construction',
                items: [
                    { page: 'projectManagement', label: 'Project construction', icon: ICONS.archive },
                    { page: 'vendorDirectory', label: 'Vendor directory', icon: ICONS.briefcase },
                    { page: 'pmConfig', label: 'PM cycle', icon: ICONS.filter },
                ]
            },
            {
                title: 'Rental',
                items: [
                    { page: 'rentalManagement', label: 'Rental', icon: ICONS.building },
                ]
            },
            {
                title: 'People',
                items: [
                    { page: 'payroll', label: 'Payroll', icon: ICONS.users },
                ]
            },
        ];

        // Add Settings for non-Accounts users
        if (!isAccountsOnly) {
            groups.push({
                title: 'System',
                items: [
                    { page: 'settings', label: 'Settings', icon: ICONS.settings },
                ]
            });
        }

        // Filter groups based on modules and role
        return groups.filter(group => {
            const hasRealEstate = hasModule('real_estate');
            const hasRental = hasModule('rental');

            if (isSalesFocusedUser) {
                if (group.title === 'Financials' || group.title === 'Construction' || group.title === 'People') {
                    return false;
                }
            }

            if (group.title === 'Selling') {
                const showSellingSection = hasRealEstate || canAccessProjectSellingNav;
                if (!showSellingSection) return false;
                group.items = group.items.filter((item) => {
                    if (item.page === 'projectSelling') return canAccessProjectSellingNav;
                    if (item.page === 'investmentManagement') {
                        return hasRealEstate && !isSalesFocusedUser && canWriteFinancial;
                    }
                    return true;
                });
                return group.items.length > 0;
            }
            if (group.title === 'Financials') {
                if (isSalesFocusedUser) return false;
                return true;
            }
            if (group.title === 'Construction') {
                group.items = group.items.filter(item => {
                    if (item.page === 'projectManagement' || item.page === 'pmConfig') return hasRealEstate;
                    return true; // Vendor Directory is widely available
                });
                return group.items.length > 0;
            }
            if (group.title === 'Rental') {
                return hasRental;
            }

            if (group.title === 'People') {
                if (isSalesFocusedUser) return false;
                if (!canReadPayroll && !canWriteFinancial) return false;
                return true;
            }

            return true; // Always show Overview, System (when added)
        });
    }, [
        isAccountsOnly,
        hasModule,
        isAdmin,
        isSalesFocusedUser,
        canAccessProjectSellingNav,
        canWriteFinancial,
        canReadPayroll,
    ]);

    const isCurrent = (itemPage: Page) => {
        if (currentPage === itemPage) return true;
        if (
            itemPage === 'rentalManagement' &&
            (currentPage === 'rentalManagement' ||
                currentPage === 'rentalInvoices' ||
                currentPage === 'rentalAgreements' ||
                currentPage === 'ownerPayouts' ||
                currentPage === 'rentalSettings')
        ) {
            return true;
        }
        if (itemPage === 'projectManagement' && (currentPage.startsWith('project') || currentPage === 'bills') && currentPage !== 'projectSelling' && currentPage !== 'projectInvoices') return true;
        // projectInvoices is now under Selling (Project selling), so it should activate projectSelling not projectManagement.
        if (itemPage === 'projectSelling' && (currentPage === 'projectSelling' || currentPage === 'projectInvoices')) return true;
        if (itemPage === 'accounting' && currentPage === 'accounting') return true;
        return false;
    };

    const handleLogout = async () => {
        if (confirm('Are you sure you want to logout?')) {
            try {
                if (isLocalOnlyMode() && companyCtx) {
                    // Local-only: save company DB, close it, then show company select/create screen
                    await companyCtx.logoutCompany();
                    dispatch({ type: 'LOGOUT' });
                    localStorage.removeItem('last_tenant_id');
                    localStorage.removeItem('last_identifier');
                } else {
                    await logout();
                    dispatch({ type: 'LOGOUT' });
                    // Keep last_tenant_id / last_identifier so API login can preselect the last organization and username.
                }
            } catch (error) {
                console.error('Logout error:', error);
                dispatch({ type: 'LOGOUT' });
            }
        }
    };

    // Mobile sidebar state and event listener
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleToggleSidebar = () => {
            setIsMobileMenuOpen(prev => !prev);
        };

        document.addEventListener('toggle-sidebar', handleToggleSidebar);
        return () => document.removeEventListener('toggle-sidebar', handleToggleSidebar);
    }, []);

    return (
        <>
            {/* Mobile Sidebar Drawer - Only visible on mobile */}
            {isMobileMenuOpen && (
                <>
                    {/* Backdrop overlay */}
                    <div
                        className="fixed inset-0 bg-black/50 z-40 md:hidden animate-fade-in"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />

                    {/* Mobile drawer */}
                    <aside className="fixed left-0 top-0 h-full w-64 bg-app-sidebar border-r border-app-sidebar-border z-50 md:hidden flex flex-col text-slate-300 animate-slide-in-left">

                        {/* Brand Header */}
                        <div className="h-14 flex items-center justify-between px-5 border-b border-app-sidebar-border/50 bg-app-sidebar/50 backdrop-blur-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-ds-on-primary font-bold text-sm">
                                    P
                                </div>
                                <div>
                                    <h1 className="text-sm font-bold tracking-wide">
                                        <span className="text-red-500">P</span>
                                        <span className="text-white">Books</span>
                                        <span className="text-primary">Pro</span>
                                    </h1>
                                    <div className="text-[10px] text-slate-500 font-mono">v{displayVersion}</div>
                                </div>
                            </div>
                            {/* Close button */}
                            <button
                                type="button"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="p-2 -mr-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                aria-label="Close menu"
                                title="Close menu"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>

                        {/* Navigation Menu */}
                        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {navGroups.map((group, idx) => {
                                const isCollapsed = collapsedGroups[group.title] || false;
                                return (
                                    <div key={idx} className="space-y-1">
                                        <NavGroupHeader
                                            title={group.title}
                                            expanded={!isCollapsed}
                                            onToggle={() => handleToggleGroup(group.title)}
                                        />

                                        <div className={`space-y-0.5 overflow-hidden transition-all duration-200 ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                                            {group.items.map((item) => {
                                                const active = isCurrent(item.page as Page);
                                                const primary = isPrimarySidebarModule(item.page as Page);
                                                return (
                                                    <button
                                                        key={item.page}
                                                        onClick={() => {
                                                            setCurrentPage(item.page as Page);
                                                            setIsMobileMenuOpen(false); // Close menu after navigation
                                                        }}
                                                        data-tour={TOUR_DATA_ATTR[item.page as string]}
                                                        className={`w-full flex items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-md text-sm font-medium transition-all duration-ds group touch-manipulation border-l-[3px] ${active
                                                                ? 'border-primary bg-nav-active text-white'
                                                                : primary
                                                                    ? 'border-emerald-400/70 bg-emerald-500/12 text-slate-100 font-semibold shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)] hover:bg-emerald-500/18 hover:text-white active:bg-emerald-500/22'
                                                                    : 'border-transparent text-app-muted hover:text-app-text hover:bg-white/5 active:bg-white/10'
                                                            }`}
                                                    >
                                                        <div className={`transition-colors duration-ds shrink-0 ${active ? 'text-primary' : primary ? 'text-emerald-300 group-hover:text-emerald-200' : 'text-app-muted group-hover:text-app-text'}`}>
                                                            {React.cloneElement(item.icon as any, { width: 18, height: 18 })}
                                                        </div>
                                                        <span className="truncate">{item.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </nav>

                        {/* Mobile Footer - Simplified */}
                        <div className="p-3 border-t border-app-sidebar-border bg-app-sidebar/50">
                            {/* License Status Button */}
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    onClick={() => {
                                        setIsLicenseModalOpen(true);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full mb-3 text-white p-2.5 rounded-lg shadow-lg relative overflow-hidden group ${licenseInfo.isExpired
                                        ? 'bg-gradient-to-r from-rose-500 to-red-600'
                                        : 'bg-gradient-to-r from-amber-500 to-orange-600'
                                        }`}
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    <div className="relative flex items-center justify-between">
                                        <div className="text-left">
                                            <div className="text-[10px] font-bold opacity-90">
                                                {licenseInfo.isExpired ? 'License Expired' : 'Renewal Due'}
                                            </div>
                                            <div className="text-sm font-bold leading-tight">
                                                {licenseInfo.isExpired ? 'Expired' : `${licenseInfo.daysRemaining} Days`}
                                            </div>
                                        </div>
                                        <div className="bg-white/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                                            Renew
                                        </div>
                                    </div>
                                </button>
                            )}

                            {/* Switch Company (local-only multi-company) */}
                            {isLocalOnlyMode() && companyCtx?.activeCompany && (
                                <button
                                    onClick={() => companyCtx.switchCompany()}
                                    className="w-full flex items-center gap-2 p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 border border-slate-700/50 transition-colors text-xs"
                                    title="Switch to another company"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                                    <span className="truncate">{companyCtx.activeCompany.company_name}</span>
                                    <span className="text-slate-500 ml-auto text-[10px]">Switch</span>
                                </button>
                            )}

                            {/* User Info with logout */}
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-inner flex-shrink-0">
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-white truncate leading-tight mb-0.5" title={userName}>
                                        {userName}
                                    </div>
                                    {organizationName && (
                                        <div className="text-xs font-medium text-indigo-300 truncate mb-0.5" title={organizationName}>
                                            {organizationName}
                                        </div>
                                    )}
                                    {effectiveRole && (
                                        <div className="text-[10px] text-slate-400 truncate capitalize">
                                            {effectiveRole}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center justify-center p-2 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-colors touch-manipulation"
                                    title="Logout"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                </button>
                            </div>

                            {/* Users logged in (below login area) */}
                            {showLoggedInUsersRow && (
                                <div
                                    className="mt-2 px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/40"
                                    title={isLocalOnlyMode() ? 'Active sessions on this device' : 'Users currently signed in'}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] text-slate-400 font-medium">Users logged in</span>
                                        <span className="text-sm font-semibold text-emerald-400 tabular-nums">{loggedInUsersCount}</span>
                                    </div>
                                    {isLocalOnlyMode() && (
                                        <div className="text-[10px] text-slate-500 mt-0.5">This device</div>
                                    )}
                                </div>
                            )}

                            {/* Chat when multiple users online (LAN/API) */}
                            {!isLocalOnlyMode() && onlineUsers !== null && onlineUsers > 1 && (
                                <button
                                    onClick={() => {
                                        void fetchOnlineUsersList();
                                        setIsChatModalOpen(true);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full mt-2 px-3 py-2.5 rounded-lg bg-primary hover:bg-ds-primary-hover active:bg-ds-primary-active text-ds-on-primary text-sm font-medium transition-colors duration-ds flex items-center justify-center gap-2 relative touch-manipulation ${unreadMessageCount > 0 ? 'animate-pulse' : ''
                                        }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                    Chat ({onlineUsers} online)
                                    {unreadMessageCount > 0 && (
                                        <>
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></span>
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold">{unreadMessageCount}</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </aside>
                </>
            )}

            {/* Premium Dark Sidebar — desktop: full width or icon rail (mainNavCollapsed) */}
            <aside
                className="hidden md:flex flex-col sidebar-desktop-width bg-app-sidebar border-r border-app-sidebar-border fixed left-0 top-0 h-full z-40 text-slate-300 overflow-x-hidden min-w-0"
                aria-label={mainNavCollapsed ? 'Main navigation (icons)' : 'Main navigation'}
            >
                {mainNavCollapsed ? (
                    <>
                        <div className="shrink-0 flex flex-col items-center gap-2 py-3 px-2 border-b border-app-sidebar-border/50 bg-app-sidebar/50 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-ds-on-primary font-bold text-sm" title="PBooks Pro">
                                P
                            </div>
                            <button
                                type="button"
                                onClick={toggleMainNav}
                                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title={mainNavToggleTitle}
                                aria-label={mainNavToggleTitle}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        </div>
                        <nav className="flex-1 px-1.5 py-3 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-h-0">
                            {navGroups.map((group, gIdx) => (
                                <div key={group.title} className="space-y-1">
                                    {gIdx > 0 && <div className="border-t border-slate-700/60 my-2 mx-0.5" aria-hidden />}
                                    {group.items.map((item) => {
                                        const active = isCurrent(item.page as Page);
                                        const primary = isPrimarySidebarModule(item.page as Page);
                                        return (
                                            <button
                                                key={item.page}
                                                type="button"
                                                onClick={() => setCurrentPage(item.page as Page)}
                                                title={item.label}
                                                aria-label={item.label}
                                                aria-current={active ? 'page' : undefined}
                                                data-tour={TOUR_DATA_ATTR[item.page as string]}
                                                className={`w-full flex items-center justify-center p-2.5 rounded-md transition-all duration-ds border-l-[3px] ${active
                                                    ? 'border-primary bg-nav-active text-primary shadow-none ring-0'
                                                    : primary
                                                        ? 'border-emerald-400/70 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/18 ring-1 ring-inset ring-emerald-400/25'
                                                        : 'border-transparent text-app-muted hover:text-app-text hover:bg-white/5'
                                                    }`}
                                            >
                                                <span className={active ? 'text-primary' : primary ? 'text-emerald-300' : 'text-app-muted'}>
                                                    {React.cloneElement(item.icon as any, { width: 20, height: 20 })}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </nav>
                        <div className="shrink-0 p-2 border-t border-slate-800 bg-slate-900/50 space-y-2">
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    type="button"
                                    onClick={() => setIsLicenseModalOpen(true)}
                                    title={licenseInfo.isExpired ? 'License expired — open' : `Renewal in ${licenseInfo.daysRemaining} days`}
                                    aria-label="License and subscription"
                                    className={`w-full flex items-center justify-center p-2 rounded-lg ${licenseInfo.isExpired ? 'bg-rose-600' : 'bg-amber-600'} text-white`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                </button>
                            )}
                            {isLocalOnlyMode() && companyCtx?.activeCompany && (
                                <button
                                    type="button"
                                    onClick={() => companyCtx.switchCompany()}
                                    className="w-full flex items-center justify-center p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/50"
                                    title={`Switch company (${companyCtx.activeCompany.company_name})`}
                                    aria-label="Switch company"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
                                </button>
                            )}
                            <div className="flex flex-col items-center gap-2 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold" title={userName}>
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="p-2 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                                    title="Logout"
                                    aria-label="Logout"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                </button>
                            </div>
                            {showLoggedInUsersRow && (
                                <div className="flex justify-center text-xs font-semibold text-emerald-400 tabular-nums" title="Users logged in">
                                    {loggedInUsersCount}
                                </div>
                            )}
                            {!isLocalOnlyMode() && onlineUsers !== null && onlineUsers > 1 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        void fetchOnlineUsersList();
                                        setIsChatModalOpen(true);
                                    }}
                                    className={`w-full flex items-center justify-center p-2 rounded-lg bg-primary hover:bg-ds-primary-hover text-ds-on-primary relative transition-colors duration-ds ${unreadMessageCount > 0 ? 'animate-pulse' : ''}`}
                                    title={`Chat (${onlineUsers} online)`}
                                    aria-label="Open chat"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                    {unreadMessageCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-red-500 rounded text-[9px] font-bold leading-none flex items-center justify-center">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
                                    )}
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="h-14 shrink-0 flex items-center justify-between gap-2 pl-4 pr-2 border-b border-app-sidebar-border/50 bg-app-sidebar/50 backdrop-blur-sm">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-ds-on-primary font-bold text-sm shrink-0">
                                    P
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-sm font-bold tracking-wide truncate">
                                        <span className="text-red-500">P</span>
                                        <span className="text-white">Books</span>
                                        <span className="text-primary">Pro</span>
                                    </h1>
                                    <div className="text-[10px] text-slate-500 font-mono">v{displayVersion}</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={toggleMainNav}
                                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                                title={mainNavToggleTitle}
                                aria-label={mainNavToggleTitle}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <polyline points="15 18 9 12 15 6" />
                                </svg>
                            </button>
                        </div>

                        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-h-0">
                            {navGroups.map((group, idx) => {
                                const isCollapsed = collapsedGroups[group.title] || false;

                                return (
                                    <div key={idx} className="space-y-1">
                                        <NavGroupHeader
                                            title={group.title}
                                            expanded={!isCollapsed}
                                            onToggle={() => handleToggleGroup(group.title)}
                                        />

                                        <div className={`space-y-0.5 overflow-hidden transition-all duration-200 ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                                            {group.items.map((item) => {
                                                const active = isCurrent(item.page as Page);
                                                const primary = isPrimarySidebarModule(item.page as Page);
                                                return (
                                                    <button
                                                        key={item.page}
                                                        type="button"
                                                        onClick={() => setCurrentPage(item.page as Page)}
                                                        data-tour={TOUR_DATA_ATTR[item.page as string]}
                                                        className={`w-full flex items-center gap-3 pl-2.5 pr-3 py-1.5 rounded-md text-xs font-medium transition-all duration-ds group border-l-[3px] ${active
                                                                ? 'border-primary bg-nav-active text-white'
                                                                : primary
                                                                    ? 'border-emerald-400/70 bg-emerald-500/12 text-slate-100 font-semibold shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)] hover:bg-emerald-500/18 hover:text-white'
                                                                    : 'border-transparent text-app-muted hover:text-app-text hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <div className={`transition-colors duration-ds shrink-0 ${active ? 'text-primary' : primary ? 'text-emerald-300 group-hover:text-emerald-200' : 'text-app-muted group-hover:text-app-text'}`}>
                                                            {React.cloneElement(item.icon as any, { width: 16, height: 16 })}
                                                        </div>
                                                        <span className="truncate">{item.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </nav>

                        <div className="p-3 border-t border-slate-800 bg-slate-900/50 shrink-0 overflow-x-hidden">
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    type="button"
                                    onClick={() => setIsLicenseModalOpen(true)}
                                    className={`w-full mb-3 text-white p-2.5 rounded-lg shadow-lg relative overflow-hidden group ${licenseInfo.isExpired
                                        ? 'bg-gradient-to-r from-rose-500 to-red-600'
                                        : 'bg-gradient-to-r from-amber-500 to-orange-600'
                                        }`}
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    <div className="relative flex items-center justify-between">
                                        <div className="text-left">
                                            <div className="text-[10px] font-bold opacity-90">
                                                {licenseInfo.isExpired ? 'License Expired' : 'Renewal Due'}
                                            </div>
                                            <div className="text-sm font-bold leading-tight">
                                                {licenseInfo.isExpired ? 'Expired' : `${licenseInfo.daysRemaining} Days`}
                                            </div>
                                        </div>
                                        <div className="bg-white/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                                            Renew
                                        </div>
                                    </div>
                                </button>
                            )}

                            <div className="space-y-2">
                                {isLocalOnlyMode() && companyCtx?.activeCompany && (
                                    <button
                                        type="button"
                                        onClick={() => companyCtx.switchCompany()}
                                        className="w-full flex items-center gap-2 p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 border border-slate-700/50 transition-colors text-xs min-w-0"
                                        title="Switch to another company"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
                                        <span className="truncate">{companyCtx.activeCompany.company_name}</span>
                                        <span className="text-slate-500 ml-auto text-[10px] shrink-0">Switch</span>
                                    </button>
                                )}

                                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-inner flex-shrink-0">
                                        {userName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-white truncate leading-tight mb-0.5" title={userName}>
                                            {userName}
                                        </div>
                                        {organizationName && (
                                            <div className="text-xs font-medium text-indigo-300 truncate mb-0.5" title={organizationName}>
                                                {organizationName}
                                            </div>
                                        )}
                                        {effectiveRole && (
                                            <div className="text-[10px] text-slate-400 truncate capitalize">
                                                {effectiveRole}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-colors shrink-0"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                        <span>Logout</span>
                                    </button>
                                </div>

                                {showLoggedInUsersRow && (
                                    <div
                                        className="px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/40"
                                        title={isLocalOnlyMode() ? 'Active sessions on this device' : 'Users currently signed in'}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] text-slate-400 font-medium">Users logged in</span>
                                            <span className="text-sm font-semibold text-emerald-400 tabular-nums">{loggedInUsersCount}</span>
                                        </div>
                                        {isLocalOnlyMode() && (
                                            <div className="text-[10px] text-slate-500 mt-0.5">This device</div>
                                        )}
                                    </div>
                                )}

                                {!isLocalOnlyMode() && onlineUsers !== null && onlineUsers > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                        void fetchOnlineUsersList();
                                        setIsChatModalOpen(true);
                                    }}
                                        className={`w-full px-3 py-2 rounded-lg bg-primary hover:bg-ds-primary-hover text-ds-on-primary text-xs font-medium transition-colors duration-ds flex items-center justify-center gap-2 relative ${unreadMessageCount > 0 ? 'animate-pulse' : ''
                                            }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        Chat
                                        {unreadMessageCount > 0 && (
                                            <>
                                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </aside>
            {/* License Management Modal */}
            {isLicenseModalOpen && (
                <Modal
                    isOpen={isLicenseModalOpen}
                    onClose={() => setIsLicenseModalOpen(false)}
                    title="License & Subscription"
                    size="lg"
                >
                    <LicenseManagement />
                </Modal>
            )}

            <ChatModal
                isOpen={isChatModalOpen}
                onClose={() => setIsChatModalOpen(false)}
                onlineUsers={onlineUsersList}
            />
        </>
    );
};

export default memo(Sidebar);
