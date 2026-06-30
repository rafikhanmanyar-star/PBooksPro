
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
import { connectRealtimeSocket } from '../../core/socket';
import { getInMemoryUnreadCount, subscribeInMemoryChat } from '../../services/chat/inMemoryChatStore';
import Modal from '../ui/Modal';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useViewport } from '../../context/ViewportContext';
import { isAdminRole } from '../../hooks/useRecordLock';
import { usePermissions } from '../../hooks/usePermissions';
import NavGroupHeader from './NavGroupHeader';
import SidebarNavItem from './SidebarNavItem';

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

    const renderNavGroups = (options: { collapsed?: boolean; onItemClick?: () => void }) =>
        navGroups.map((group, idx) => {
            const groupCollapsed = collapsedGroups[group.title] || false;

            if (options.collapsed) {
                return (
                    <div key={group.title}>
                        {idx > 0 && <div className="sidebar-section-divider" aria-hidden />}
                        <div className="space-y-0.5">
                            {group.items.map((item) => (
                                <SidebarNavItem
                                    key={item.page}
                                    label={item.label}
                                    icon={item.icon as React.ReactElement}
                                    active={isCurrent(item.page as Page)}
                                    primary={isPrimarySidebarModule(item.page as Page)}
                                    collapsed
                                    onClick={() => {
                                        setCurrentPage(item.page as Page);
                                        options.onItemClick?.();
                                    }}
                                    tourAttr={TOUR_DATA_ATTR[item.page as string]}
                                />
                            ))}
                        </div>
                    </div>
                );
            }

            return (
                <div key={group.title} className="mb-0.5">
                    <NavGroupHeader
                        title={group.title}
                        expanded={!groupCollapsed}
                        onToggle={() => handleToggleGroup(group.title)}
                    />
                    <div
                        className={`space-y-0.5 overflow-hidden transition-all duration-200 ${groupCollapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100'}`}
                    >
                        {group.items.map((item) => (
                            <SidebarNavItem
                                key={item.page}
                                label={item.label}
                                icon={item.icon as React.ReactElement}
                                active={isCurrent(item.page as Page)}
                                primary={isPrimarySidebarModule(item.page as Page)}
                                onClick={() => {
                                    setCurrentPage(item.page as Page);
                                    options.onItemClick?.();
                                }}
                                tourAttr={TOUR_DATA_ATTR[item.page as string]}
                            />
                        ))}
                    </div>
                </div>
            );
        });

    const renderLicenseAlert = (compact = false) => {
        if (!licenseInfo || (!licenseInfo.isExpired && licenseInfo.daysRemaining > 30)) return null;

        return (
            <button
                type="button"
                onClick={() => {
                    setIsLicenseModalOpen(true);
                    if (!compact) setIsMobileMenuOpen(false);
                }}
                title={licenseInfo.isExpired ? 'License expired — open' : `Renewal in ${licenseInfo.daysRemaining} days`}
                aria-label="License and subscription"
                className={`sidebar-license-alert ${licenseInfo.isExpired ? 'sidebar-license-alert--expired' : 'sidebar-license-alert--warning'} ${compact ? 'flex items-center justify-center p-2 mb-0' : ''}`}
            >
                {compact ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                ) : (
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wide opacity-90">
                                {licenseInfo.isExpired ? 'License Expired' : 'Renewal Due'}
                            </div>
                            <div className="text-sm font-bold leading-tight">
                                {licenseInfo.isExpired ? 'Expired' : `${licenseInfo.daysRemaining} Days`}
                            </div>
                        </div>
                        <span className="shrink-0 rounded bg-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                            Renew
                        </span>
                    </div>
                )}
            </button>
        );
    };

    const renderUserCard = (compact = false) => (
        <div className={`sidebar-user-card ${compact ? 'flex flex-col items-center gap-2 p-2' : ''}`}>
            {!compact && (
                <button
                    type="button"
                    onClick={handleLogout}
                    className="absolute top-2 right-2 flex items-center justify-center rounded-md border border-slate-600/60 p-1.5 text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white"
                    title="Logout"
                    aria-label="Logout"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                </button>
            )}
            <div className={`flex min-w-0 items-start gap-3 ${compact ? 'flex-col items-center' : 'pr-8'}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-sm font-bold text-white shadow-inner">
                    {userName.charAt(0).toUpperCase()}
                </div>
                {!compact && (
                    <div className="min-w-0 flex-1">
                        <div className="mb-0.5 break-words text-sm font-semibold leading-tight text-white" title={userName}>
                            {userName}
                        </div>
                        {organizationName && (
                            <div className="mb-0.5 line-clamp-2 break-words text-xs font-medium leading-snug text-indigo-300" title={organizationName}>
                                {organizationName}
                            </div>
                        )}
                        {effectiveRole && (
                            <div className="text-[10px] capitalize text-slate-400">{effectiveRole}</div>
                        )}
                    </div>
                )}
            </div>
            {compact && (
                <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-md border border-slate-600/60 p-2 text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white"
                    title="Logout"
                    aria-label="Logout"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                </button>
            )}
        </div>
    );

    const renderOnlineUsersRow = () =>
        showLoggedInUsersRow ? (
            <div className="sidebar-status-pill" title="Users currently signed in">
                <span className="text-xs font-medium text-slate-400">Users logged in</span>
                <span className="text-sm font-semibold tabular-nums text-emerald-400">{loggedInUsersCount}</span>
            </div>
        ) : null;

    const renderChatButton = (compact = false, onOpen?: () => void) => {
        if (onlineUsers === null || onlineUsers <= 1) return null;

        return (
            <button
                type="button"
                onClick={() => {
                    void fetchOnlineUsersList();
                    setIsChatModalOpen(true);
                    onOpen?.();
                }}
                className={`sidebar-chat-btn relative ${unreadMessageCount > 0 ? 'animate-pulse' : ''} ${compact ? 'p-2' : ''}`}
                title={`Chat (${onlineUsers} online)`}
                aria-label="Open chat"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width={compact ? 18 : 16} height={compact ? 18 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {!compact && (
                    <>
                        Chat
                        {onlineUsers > 1 && <span className="text-white/80">({onlineUsers})</span>}
                    </>
                )}
                {unreadMessageCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                )}
            </button>
        );
    };

    const renderBrandHeader = (collapsed = false) => (
        <div className={`sidebar-brand shrink-0 ${collapsed ? 'flex flex-col items-center gap-2 px-2 py-3' : 'flex h-14 items-center justify-between gap-2 pl-4 pr-2'}`}>
            {collapsed ? (
                <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-ds-on-primary" title="PBooks Pro">
                        P
                    </div>
                    <button
                        type="button"
                        onClick={toggleMainNav}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                        title={mainNavToggleTitle}
                        aria-label={mainNavToggleTitle}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </button>
                </>
            ) : (
                <>
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-ds-on-primary shadow-[0_0_12px_rgb(16_185_129_/_0.35)]">
                            P
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-sm font-bold tracking-wide">
                                <span className="text-red-500">P</span>
                                <span className="text-white">Books</span>
                                <span className="text-primary">Pro</span>
                            </h1>
                            <div className="font-mono text-[10px] text-slate-400">v{displayVersion}</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={toggleMainNav}
                        className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                        title={mainNavToggleTitle}
                        aria-label={mainNavToggleTitle}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                </>
            )}
        </div>
    );

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
                    <aside className="sidebar-shell fixed left-0 top-0 z-50 flex h-full w-[17.5rem] flex-col overflow-x-hidden text-slate-300 animate-slide-in-left md:hidden">
                        <div className="sidebar-brand flex h-14 shrink-0 items-center justify-between px-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-ds-on-primary shadow-[0_0_12px_rgb(16_185_129_/_0.35)]">
                                    P
                                </div>
                                <div>
                                    <h1 className="text-sm font-bold tracking-wide">
                                        <span className="text-red-500">P</span>
                                        <span className="text-white">Books</span>
                                        <span className="text-primary">Pro</span>
                                    </h1>
                                    <div className="font-mono text-[10px] text-slate-400">v{displayVersion}</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="-mr-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                                aria-label="Close menu"
                                title="Close menu"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <nav className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
                            {renderNavGroups({ onItemClick: () => setIsMobileMenuOpen(false) })}
                        </nav>

                        <div className="sidebar-footer shrink-0 space-y-2 overflow-x-hidden p-3">
                            {renderLicenseAlert()}
                            {renderUserCard()}
                            {renderOnlineUsersRow()}
                            {renderChatButton(false, () => setIsMobileMenuOpen(false))}
                        </div>
                    </aside>
                </>
            )}

            {/* Desktop sidebar — full width or icon rail */}
            <aside
                className="sidebar-shell sidebar-desktop-width fixed left-0 top-0 z-40 hidden h-full min-w-0 flex-col overflow-x-hidden text-slate-300 md:flex"
                aria-label={mainNavCollapsed ? 'Main navigation (icons)' : 'Main navigation'}
            >
                {mainNavCollapsed ? (
                    <>
                        {renderBrandHeader(true)}
                        <nav className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-3">
                            {renderNavGroups({ collapsed: true })}
                        </nav>
                        <div className="sidebar-footer shrink-0 space-y-2 p-2">
                            {renderLicenseAlert(true)}
                            {renderUserCard(true)}
                            {showLoggedInUsersRow && (
                                <div className="flex justify-center text-xs font-semibold tabular-nums text-emerald-400" title="Users logged in">
                                    {loggedInUsersCount}
                                </div>
                            )}
                            {renderChatButton(true)}
                        </div>
                    </>
                ) : (
                    <>
                        {renderBrandHeader(false)}
                        <nav className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
                            {renderNavGroups({})}
                        </nav>
                        <div className="sidebar-footer shrink-0 space-y-2 overflow-x-hidden p-3">
                            {renderLicenseAlert()}
                            {renderUserCard()}
                            {renderOnlineUsersRow()}
                            {renderChatButton()}
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
