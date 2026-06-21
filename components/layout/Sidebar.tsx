
import React, { useState, useEffect, useCallback, memo } from 'react';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
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
import SidebarNavIcon from './sidebar/SidebarNavIcon';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
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

    const {
        enterpriseRole,
        canReadProjectSelling,
        canWriteFinancial,
        canReadPayroll,
        canAccessFinancials,
        canReadProcurement,
        canAccessSettings,
    } = usePermissions();
    const isSalesFocusedUser = enterpriseRole === 'sales_user';
    // Use V2 enterprise role for menu guards — legacy effectiveRole bypasses RBAC V2 role assignments
    const isAdmin = enterpriseRole === 'super_admin' || enterpriseRole === 'company_admin';
    // Legacy role string kept only for display badge — NOT for any menu-visibility decisions
    void effectiveRole;
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

        // Add Settings only for users who have relevant management capabilities
        if (canAccessSettings) {
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
                if (!canAccessFinancials) return false;
                return true;
            }
            if (group.title === 'Construction') {
                group.items = group.items.filter(item => {
                    if (item.page === 'projectManagement' || item.page === 'pmConfig') return hasRealEstate && canWriteFinancial;
                    if (item.page === 'vendorDirectory') return canReadProcurement;
                    return true;
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
        isAdmin,
        canAccessFinancials,
        canReadProcurement,
        canAccessSettings,
        hasModule,
        isSalesFocusedUser,
        canAccessProjectSellingNav,
        canWriteFinancial,
        canReadPayroll,
        enterpriseRole,
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

    const renderNavItemButton = (
        item: { page: string; label: string; icon: React.ReactElement },
        active: boolean,
        onClick: () => void,
        collapsed = false
    ) => (
        <button
            key={item.page}
            type="button"
            onClick={onClick}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            data-tour={TOUR_DATA_ATTR[item.page]}
            className={`sidebar-nav-item${active ? ' sidebar-nav-item--active' : ''}${collapsed ? ' sidebar-nav-item--collapsed' : ''}`}
        >
            <SidebarNavIcon page={item.page} active={active} fallbackIcon={item.icon} />
            {!collapsed && (
                <>
                    <span className="sidebar-nav-item__label">{item.label}</span>
                    {active && (
                        <span className="sidebar-nav-active-indicator" aria-hidden>
                            <ChevronRight size={16} strokeWidth={2.5} />
                        </span>
                    )}
                </>
            )}
        </button>
    );

    const renderExpandedBrand = (onCollapse?: () => void, showClose?: boolean) => (
        <div className="sidebar-brand">
            <div className="flex items-center gap-3 min-w-0">
                <div className="sidebar-brand__logo">P</div>
                <div className="min-w-0">
                    <h1 className="text-sm font-bold tracking-wide truncate">
                        <span className="text-red-500">P</span>
                        <span className="text-white">Books</span>
                        <span className="text-primary">Pro</span>
                    </h1>
                    {organizationName && (
                        <div className="sidebar-brand__org" title={organizationName}>
                            {organizationName}
                        </div>
                    )}
                    <div className="sidebar-brand__version">v{displayVersion}</div>
                </div>
            </div>
            {showClose ? (
                <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="sidebar-collapse-btn"
                    aria-label="Close menu"
                    title="Close menu"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            ) : onCollapse ? (
                <button
                    type="button"
                    onClick={onCollapse}
                    className="sidebar-collapse-btn"
                    title={mainNavToggleTitle}
                    aria-label={mainNavToggleTitle}
                >
                    <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                </button>
            ) : null}
        </div>
    );

    const renderRenewalCard = (onAfterOpen?: () => void) => {
        if (!licenseInfo || (!licenseInfo.isExpired && licenseInfo.daysRemaining > 30)) return null;
        return (
            <button
                type="button"
                onClick={() => {
                    setIsLicenseModalOpen(true);
                    onAfterOpen?.();
                }}
                className={`sidebar-renewal-card${licenseInfo.isExpired ? ' sidebar-renewal-card--expired' : ''}`}
            >
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="sidebar-renewal-card__label">
                            {licenseInfo.isExpired ? 'License Expired' : 'Renewal Due'}
                        </div>
                        <div className="sidebar-renewal-card__days">
                            {licenseInfo.isExpired ? 'Expired' : `${licenseInfo.daysRemaining} Days`}
                        </div>
                    </div>
                    <div className="sidebar-renewal-card__cta">Renew</div>
                </div>
            </button>
        );
    };

    const renderUserCard = () => (
        <div className="sidebar-user-card">
            <button
                type="button"
                onClick={handleLogout}
                className="sidebar-logout-btn"
                title="Logout"
                aria-label="Logout"
            >
                <LogOut size={14} strokeWidth={2} />
            </button>
            <div className="flex items-start gap-3 min-w-0 pr-6">
                <div className="sidebar-user-card__avatar">
                    {userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="sidebar-user-card__name truncate" title={userName}>
                        {userName}
                    </div>
                    {effectiveRole && (
                        <div className="sidebar-user-card__role truncate" title={effectiveRole}>
                            {effectiveRole}
                        </div>
                    )}
                    <div className="sidebar-user-card__status">
                        <span className="sidebar-user-card__status-dot" aria-hidden />
                        Online
                    </div>
                </div>
            </div>
        </div>
    );

    const renderLoggedInRow = () => {
        if (!showLoggedInUsersRow) return null;
        return (
            <div className="sidebar-logged-in-row" title="Users currently signed in">
                <span className="flex items-center gap-2 font-medium">
                    <span className="sidebar-user-card__status-dot" aria-hidden />
                    Users logged in
                </span>
                <span className="font-semibold text-[#d8e1f0] tabular-nums">{loggedInUsersCount}</span>
            </div>
        );
    };

    const renderChatButton = (onAfterOpen?: () => void) => {
        if (onlineUsers === null || onlineUsers <= 1) return null;
        return (
            <button
                type="button"
                onClick={() => {
                    void fetchOnlineUsersList();
                    setIsChatModalOpen(true);
                    onAfterOpen?.();
                }}
                className={`sidebar-chat-btn${unreadMessageCount > 0 ? ' animate-pulse' : ''}`}
                title={`Chat (${onlineUsers} online)`}
                aria-label="Open chat"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400" aria-hidden>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Chat
                {unreadMessageCount > 0 && (
                    <>
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold">
                            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                        </span>
                    </>
                )}
            </button>
        );
    };

    const renderNavGroups = (onNavigate?: () => void, collapsed = false) => (
        <>
            {navGroups.map((group, groupIdx) => {
                const isGroupCollapsed = collapsedGroups[group.title] || false;
                return (
                    <React.Fragment key={group.title}>
                        {groupIdx > 0 && (
                            collapsed
                                ? <div className="border-t border-white/[0.06] my-2 mx-0.5" aria-hidden />
                                : <hr className="sidebar-section-divider" />
                        )}
                        <div className={collapsed ? '' : 'sidebar-nav-group'}>
                            {!collapsed && (
                                <NavGroupHeader
                                    title={group.title}
                                    expanded={!isGroupCollapsed}
                                    onToggle={() => handleToggleGroup(group.title)}
                                />
                            )}
                            <div
                                className={
                                    collapsed
                                        ? 'sidebar-nav-items sidebar-nav-items--visible'
                                        : `sidebar-nav-items ${isGroupCollapsed ? 'sidebar-nav-items--hidden' : 'sidebar-nav-items--visible'}`
                                }
                            >
                                {group.items.map((item) => {
                                    const active = isCurrent(item.page as Page);
                                    return renderNavItemButton(
                                        item,
                                        active,
                                        () => {
                                            setCurrentPage(item.page as Page);
                                            onNavigate?.();
                                        },
                                        collapsed
                                    );
                                })}
                            </div>
                        </div>
                    </React.Fragment>
                );
            })}
        </>
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
                    <aside className="fixed left-0 top-0 h-full w-[260px] sidebar-shell z-50 md:hidden flex flex-col animate-slide-in-left">

                        {renderExpandedBrand(undefined, true)}

                        <nav className="sidebar-nav-scroll scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {renderNavGroups(() => setIsMobileMenuOpen(false))}
                        </nav>

                        <div className="sidebar-footer">
                            {renderRenewalCard(() => setIsMobileMenuOpen(false))}
                            {renderUserCard()}
                            {renderLoggedInRow()}
                            {renderChatButton(() => setIsMobileMenuOpen(false))}
                        </div>
                    </aside>
                </>
            )}

            {/* Premium sidebar — desktop: full width or icon rail (mainNavCollapsed) */}
            <aside
                className="hidden md:flex flex-col sidebar-desktop-width sidebar-shell fixed left-0 top-0 h-full z-40 overflow-x-hidden min-w-0"
                aria-label={mainNavCollapsed ? 'Main navigation (icons)' : 'Main navigation'}
            >
                {mainNavCollapsed ? (
                    <>
                        <div className="shrink-0 flex flex-col items-center gap-2 py-3 px-2 border-b border-white/[0.08]">
                            <div className="sidebar-brand__logo" title="PBooks Pro">P</div>
                            <button
                                type="button"
                                onClick={toggleMainNav}
                                className="sidebar-collapse-btn"
                                title={mainNavToggleTitle}
                                aria-label={mainNavToggleTitle}
                            >
                                <ChevronRight size={18} strokeWidth={2} aria-hidden />
                            </button>
                        </div>
                        <nav className="sidebar-nav-scroll px-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {renderNavGroups(undefined, true)}
                        </nav>
                        <div className="sidebar-footer px-2 space-y-2">
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    type="button"
                                    onClick={() => setIsLicenseModalOpen(true)}
                                    title={licenseInfo.isExpired ? 'License expired — open' : `Renewal in ${licenseInfo.daysRemaining} days`}
                                    aria-label="License and subscription"
                                    className={`w-full flex items-center justify-center p-2.5 rounded-xl text-white ${licenseInfo.isExpired ? 'sidebar-renewal-card--expired' : ''}`}
                                    style={{ background: licenseInfo.isExpired ? undefined : 'linear-gradient(135deg, #ff9f1a, #ffb84d)' }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                </button>
                            )}
                            <div className="flex flex-col items-center gap-2 py-2">
                                <div className="sidebar-user-card__avatar w-9 h-9 text-sm" title={userName}>
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="sidebar-collapse-btn p-2"
                                    title="Logout"
                                    aria-label="Logout"
                                >
                                    <LogOut size={16} strokeWidth={2} />
                                </button>
                            </div>
                            {showLoggedInUsersRow && (
                                <div className="flex justify-center items-center gap-1.5 text-xs font-semibold text-[#d8e1f0] tabular-nums" title="Users logged in">
                                    <span className="sidebar-user-card__status-dot w-1.5 h-1.5" aria-hidden />
                                    {loggedInUsersCount}
                                </div>
                            )}
                            {renderChatButton()}
                        </div>
                    </>
                ) : (
                    <>
                        {renderExpandedBrand(toggleMainNav)}

                        <nav className="sidebar-nav-scroll scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {renderNavGroups()}
                        </nav>

                        <div className="sidebar-footer">
                            {renderRenewalCard()}
                            {renderUserCard()}
                            {renderLoggedInRow()}
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
