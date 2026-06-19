
import React, { useState, useEffect, useCallback, memo } from 'react';
import { Page } from '../../types';
import { ICONS } from '../../constants';
import LicenseManagement from '../license/LicenseManagement';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import { useLicense } from '../../context/LicenseContext';
import { apiClient } from '../../services/api/client';
import { useUpdate } from '../../context/UpdateContext';
import packageJson from '../../package.json';
import ChatModal from '../chat/ChatModal';
import { getRealtimeSocket } from '../../core/socket';
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

/** Reference layout: nav sections grouped into rounded cards */
const SIDEBAR_NAV_CARD_BUCKETS: readonly string[][] = [
    ['Overview'],
    ['Financials'],
    ['Selling', 'Construction'],
    ['Rental'],
    ['People'],
    ['System'],
];

function bucketSidebarNavGroups<T extends { title: string }>(groups: T[]): T[][] {
    const byTitle = new Map(groups.map((g) => [g.title, g]));
    const used = new Set<string>();
    const buckets: T[][] = [];

    for (const bucket of SIDEBAR_NAV_CARD_BUCKETS) {
        const matched = bucket
            .map((title) => byTitle.get(title))
            .filter((g): g is T => g != null);
        if (matched.length > 0) {
            buckets.push(matched);
            matched.forEach((g) => used.add(g.title));
        }
    }

    for (const group of groups) {
        if (!used.has(group.title)) {
            buckets.push([group]);
        }
    }

    return buckets;
}

const SIDEBAR_NAV_CARD_CLASS = 'rounded-xl bg-[#1F2937] p-2 space-y-1';
const SIDEBAR_NAV_ITEM_BASE =
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 group touch-manipulation';

function sidebarNavItemClass(active: boolean): string {
    return `${SIDEBAR_NAV_ITEM_BASE} ${
        active
            ? 'bg-indigo-500 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
    }`;
}

function sidebarNavIconClass(active: boolean): string {
    return `shrink-0 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`;
}

const SIDEBAR_CHAT_BTN_CLASS =
    'w-full px-3 py-2.5 rounded-xl border border-emerald-500/35 bg-transparent hover:bg-white/[0.04] text-sm font-medium text-white flex items-center justify-center gap-2 relative touch-manipulation transition-colors';

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

    // Fetch license status
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

        if (user || currentUser) {
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
        if (user || currentUser) {
            void fetchOnlineUsersCount();
            const interval = setInterval(() => {
                void fetchOnlineUsersCount();
            }, 60000);
            return () => clearInterval(interval);
        }
    }, [user, currentUser, fetchOnlineUsersCount]);

    useEffect(() => {
        if (isChatModalOpen) {
            void fetchOnlineUsersList();
        }
    }, [isChatModalOpen, fetchOnlineUsersList]);

    // Check for unread messages
    const checkUnreadMessages = useCallback(() => {
        if (!currentUserId) return;
        try {
            setUnreadMessageCount(getInMemoryUnreadCount(currentUserId));
        } catch (error) {
            console.error('Error checking unread messages:', error);
        }
    }, [currentUserId]);

    useEffect(() => {
        return subscribeInMemoryChat(() => {
            if (currentUserId) {
                setUnreadMessageCount(getInMemoryUnreadCount(currentUserId));
            }
        });
    }, [currentUserId]);

    // Listen for incoming chat messages via Socket.IO (same connection as AppContext entity sync)
    useEffect(() => {
        if (!currentUserId) return;

        const token = apiClient.getToken();
        if (!token) return;

        checkUnreadMessages();

        const socket = getRealtimeSocket();
        if (!socket) return;

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

    const showLoggedInUsersRow = onlineUsers !== null;
    const loggedInUsersCount = onlineUsers ?? 0;

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
                    { page: 'vendorDirectory', label: 'Procurement', icon: ICONS.briefcase },
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
                await logout();
                dispatch({ type: 'LOGOUT' });
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
                    <aside className="fixed left-0 top-0 h-full w-64 bg-[#111827] border-r border-slate-800 z-50 md:hidden flex flex-col text-slate-300 animate-slide-in-left">

                        {/* Brand Header */}
                        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800/80">
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
                        <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {bucketSidebarNavGroups(navGroups).map((cardGroups, cardIdx) => (
                                <div key={cardIdx} className={SIDEBAR_NAV_CARD_CLASS}>
                                    {cardGroups.map((group, groupIdx) => {
                                        const isCollapsed = collapsedGroups[group.title] || false;
                                        return (
                                            <div
                                                key={group.title}
                                                className={groupIdx > 0 ? 'pt-2 mt-2 border-t border-slate-700/50' : ''}
                                            >
                                                <NavGroupHeader
                                                    title={group.title}
                                                    expanded={!isCollapsed}
                                                    onToggle={() => handleToggleGroup(group.title)}
                                                />

                                                <div className={`space-y-0.5 overflow-hidden transition-all duration-200 ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                                                    {group.items.map((item) => {
                                                        const active = isCurrent(item.page as Page);
                                                        return (
                                                            <button
                                                                key={item.page}
                                                                onClick={() => {
                                                                    setCurrentPage(item.page as Page);
                                                                    setIsMobileMenuOpen(false);
                                                                }}
                                                                data-tour={TOUR_DATA_ATTR[item.page as string]}
                                                                className={sidebarNavItemClass(active)}
                                                            >
                                                                <div className={sidebarNavIconClass(active)}>
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
                                </div>
                            ))}
                        </nav>

                        {/* Mobile Footer - Simplified */}
                        <div className="p-3 border-t border-slate-800/80 shrink-0">
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    onClick={() => {
                                        setIsLicenseModalOpen(true);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full mb-3 text-white p-3 rounded-xl relative overflow-hidden group ${licenseInfo.isExpired ? 'bg-rose-500' : 'bg-[#F59E0B]'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="text-left">
                                            <div className="text-[10px] font-bold uppercase tracking-wide opacity-90">
                                                {licenseInfo.isExpired ? 'License Expired' : 'Renewal Due'}
                                            </div>
                                            <div className="text-lg font-bold leading-tight">
                                                {licenseInfo.isExpired ? 'Expired' : `${licenseInfo.daysRemaining} Days`}
                                            </div>
                                        </div>
                                        <div className="bg-white/20 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide">
                                            Renew
                                        </div>
                                    </div>
                                </button>
                            )}

                            <div className="relative py-2 min-w-0">
                                <button
                                    onClick={handleLogout}
                                    className="absolute top-2 right-0 flex items-center justify-center p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 transition-colors touch-manipulation"
                                    title="Logout"
                                    aria-label="Logout"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                </button>
                                <div className="flex items-center gap-3 pr-8 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                        {userName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-white leading-tight truncate" title={userName}>
                                            {userName}
                                        </div>
                                        {organizationName && (
                                            <div className="text-xs text-slate-400 leading-snug truncate" title={organizationName}>
                                                {organizationName}
                                            </div>
                                        )}
                                        {effectiveRole && (
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">
                                                {effectiveRole}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {showLoggedInUsersRow && (
                                <div className="mt-1 px-1 py-2" title="Users currently signed in">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                                            Users logged in
                                        </span>
                                        <span className="text-sm font-semibold text-slate-300 tabular-nums">{loggedInUsersCount}</span>
                                    </div>
                                </div>
                            )}

                            {onlineUsers !== null && onlineUsers > 1 && (
                                <button
                                    onClick={() => {
                                        void fetchOnlineUsersList();
                                        setIsChatModalOpen(true);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`mt-2 ${SIDEBAR_CHAT_BTN_CLASS} ${unreadMessageCount > 0 ? 'animate-pulse' : ''}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                    Chat
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
                className="hidden md:flex flex-col sidebar-desktop-width bg-[#111827] border-r border-slate-800 fixed left-0 top-0 h-full z-40 text-slate-300 overflow-x-hidden min-w-0"
                aria-label={mainNavCollapsed ? 'Main navigation (icons)' : 'Main navigation'}
            >
                {mainNavCollapsed ? (
                    <>
                        <div className="shrink-0 flex flex-col items-center gap-2 py-3 px-2 border-b border-slate-800/80">
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
                                        return (
                                            <button
                                                key={item.page}
                                                type="button"
                                                onClick={() => setCurrentPage(item.page as Page)}
                                                title={item.label}
                                                aria-label={item.label}
                                                aria-current={active ? 'page' : undefined}
                                                data-tour={TOUR_DATA_ATTR[item.page as string]}
                                                className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-colors duration-200 ${
                                                    active
                                                        ? 'bg-indigo-500 text-white'
                                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                                                }`}
                                            >
                                                <span className={active ? 'text-white' : 'text-slate-400'}>
                                                    {React.cloneElement(item.icon as any, { width: 20, height: 20 })}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </nav>
                        <div className="shrink-0 p-2 border-t border-slate-800/80 space-y-2">
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    type="button"
                                    onClick={() => setIsLicenseModalOpen(true)}
                                    title={licenseInfo.isExpired ? 'License expired — open' : `Renewal in ${licenseInfo.daysRemaining} days`}
                                    aria-label="License and subscription"
                                    className={`w-full flex items-center justify-center p-2 rounded-xl ${licenseInfo.isExpired ? 'bg-rose-500' : 'bg-[#F59E0B]'} text-white`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                </button>
                            )}
                            <div className="flex flex-col items-center gap-2 py-2">
                                <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold" title={userName}>
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="p-2 rounded-md text-slate-500 hover:text-white hover:bg-slate-800"
                                    title="Logout"
                                    aria-label="Logout"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                </button>
                            </div>
                            {showLoggedInUsersRow && (
                                <div className="flex justify-center items-center gap-1.5 text-xs font-semibold text-slate-300 tabular-nums" title="Users logged in">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
                                    {loggedInUsersCount}
                                </div>
                            )}
                            {onlineUsers !== null && onlineUsers > 1 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        void fetchOnlineUsersList();
                                        setIsChatModalOpen(true);
                                    }}
                                    className={`w-full flex items-center justify-center p-2 rounded-xl border border-emerald-500/35 bg-transparent hover:bg-white/[0.04] text-emerald-400 relative transition-colors ${unreadMessageCount > 0 ? 'animate-pulse' : ''}`}
                                    title={`Chat (${onlineUsers} online)`}
                                    aria-label="Open chat"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                    {unreadMessageCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-red-500 rounded text-[9px] font-bold leading-none flex items-center justify-center text-white">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
                                    )}
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="h-14 shrink-0 flex items-center justify-between gap-2 pl-4 pr-2 border-b border-slate-800/80">
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

                        <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-h-0">
                            {bucketSidebarNavGroups(navGroups).map((cardGroups, cardIdx) => (
                                <div key={cardIdx} className={SIDEBAR_NAV_CARD_CLASS}>
                                    {cardGroups.map((group, groupIdx) => {
                                        const isCollapsed = collapsedGroups[group.title] || false;

                                        return (
                                            <div
                                                key={group.title}
                                                className={groupIdx > 0 ? 'pt-2 mt-2 border-t border-slate-700/50' : ''}
                                            >
                                                <NavGroupHeader
                                                    title={group.title}
                                                    expanded={!isCollapsed}
                                                    onToggle={() => handleToggleGroup(group.title)}
                                                />

                                                <div className={`space-y-0.5 overflow-hidden transition-all duration-200 ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                                                    {group.items.map((item) => {
                                                        const active = isCurrent(item.page as Page);
                                                        return (
                                                            <button
                                                                key={item.page}
                                                                type="button"
                                                                onClick={() => setCurrentPage(item.page as Page)}
                                                                data-tour={TOUR_DATA_ATTR[item.page as string]}
                                                                className={sidebarNavItemClass(active)}
                                                            >
                                                                <div className={sidebarNavIconClass(active)}>
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
                                </div>
                            ))}
                        </nav>

                        <div className="p-3 border-t border-slate-800/80 shrink-0 overflow-x-hidden">
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    type="button"
                                    onClick={() => setIsLicenseModalOpen(true)}
                                    className={`w-full mb-3 text-white p-3 rounded-xl relative overflow-hidden group ${licenseInfo.isExpired ? 'bg-rose-500' : 'bg-[#F59E0B]'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="text-left">
                                            <div className="text-[10px] font-bold uppercase tracking-wide opacity-90">
                                                {licenseInfo.isExpired ? 'License Expired' : 'Renewal Due'}
                                            </div>
                                            <div className="text-lg font-bold leading-tight">
                                                {licenseInfo.isExpired ? 'Expired' : `${licenseInfo.daysRemaining} Days`}
                                            </div>
                                        </div>
                                        <div className="bg-white/20 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide">
                                            Renew
                                        </div>
                                    </div>
                                </button>
                            )}

                            <div className="space-y-2">
                                <div className="relative py-2 min-w-0">
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="absolute top-2 right-0 flex items-center justify-center p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                                        title="Logout"
                                        aria-label="Logout"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                    </button>
                                    <div className="flex items-center gap-3 pr-8 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                            {userName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-white leading-tight truncate" title={userName}>
                                                {userName}
                                            </div>
                                            {organizationName && (
                                                <div className="text-xs text-slate-400 leading-snug truncate" title={organizationName}>
                                                    {organizationName}
                                                </div>
                                            )}
                                            {effectiveRole && (
                                                <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">
                                                    {effectiveRole}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {showLoggedInUsersRow && (
                                    <div className="px-1 py-2" title="Users currently signed in">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                                                Users logged in
                                            </span>
                                            <span className="text-sm font-semibold text-slate-300 tabular-nums">{loggedInUsersCount}</span>
                                        </div>
                                    </div>
                                )}

                                {onlineUsers !== null && onlineUsers > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                        void fetchOnlineUsersList();
                                        setIsChatModalOpen(true);
                                    }}
                                        className={`${SIDEBAR_CHAT_BTN_CLASS} ${unreadMessageCount > 0 ? 'animate-pulse' : ''}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
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
