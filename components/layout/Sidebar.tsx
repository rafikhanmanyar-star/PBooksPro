
import React, { useState, useEffect, useCallback, memo } from 'react';
import { Page } from '../../types';
import { ICONS, APP_LOGO } from '../../constants';
import LicenseManagement from '../license/LicenseManagement';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import packageJson from '../../package.json';
import ChatModal from '../chat/ChatModal';
import { getWebSocketClient } from '../../services/websocketClient';
import { ChatMessagesRepository } from '../../services/database/repositories';
import { getDatabaseService } from '../../services/database/databaseService';
import Modal from '../ui/Modal';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
    const { state, dispatch } = useAppContext();
    const { logout, tenant, user } = useAuth();
    const { currentUser } = state;
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
    const userName = user?.name || currentUser?.name || 'User';
    const userRole = user?.role || currentUser?.role || '';
    const organizationName = tenant?.companyName || tenant?.name || '';
    const currentUserId = user?.id || currentUser?.id || '';
    
    const chatRepo = new ChatMessagesRepository();
    const wsClient = getWebSocketClient();

    // Fetch license status
    useEffect(() => {
        const fetchLicenseStatus = async () => {
            // Check for token before making API call to prevent 401 errors
            if (!apiClient.getToken()) {
                return;
            }
            try {
                const response = await apiClient.get<{
                    licenseStatus: string;
                    daysRemaining: number;
                    isExpired: boolean;
                }>('/tenants/license-status');
                setLicenseInfo(response);
            } catch (error) {
                console.error('Error fetching license status:', error);
                // Silently fail - don't show error to user
            }
        };

        // Only fetch if user is authenticated
        if (user || currentUser) {
            fetchLicenseStatus();
            
            // Refresh license status every 5 minutes
            const interval = setInterval(fetchLicenseStatus, 300000);
            return () => clearInterval(interval);
        }
    }, [user, currentUser]);

    // Fetch online users count and list (users with active sessions) for the organization
    useEffect(() => {
        const fetchOnlineUsers = async () => {
            // Check for token before making API call to prevent 401 errors
            if (!apiClient.getToken()) {
                return;
            }
            try {
                const [countResponse, listResponse] = await Promise.all([
                    apiClient.get<{ onlineUsers: number }>('/tenants/online-users-count'),
                    apiClient.get<any[]>('/tenants/online-users')
                ]);
                setOnlineUsers(countResponse.onlineUsers);
                setOnlineUsersList(listResponse || []);
            } catch (error) {
                console.error('Error fetching online users:', error);
                // Silently fail - don't show error to user
            }
        };

        // Only fetch if user is authenticated
        if (user || currentUser) {
            fetchOnlineUsers();
            
            // Refresh online users count every 30 seconds to keep it updated
            const interval = setInterval(fetchOnlineUsers, 30000);
            return () => clearInterval(interval);
        }
    }, [user, currentUser]);

    // Check for unread messages
    const checkUnreadMessages = useCallback(() => {
        if (currentUserId) {
            try {
                // Check if database is ready before querying
                const dbService = getDatabaseService();
                if (!dbService.isReady()) {
                    // Database not ready yet, skip check (will be retried by interval)
                    return;
                }
                
                const count = chatRepo.getUnreadCount(currentUserId);
                setUnreadMessageCount(count);
            } catch (error) {
                console.error('Error checking unread messages:', error);
            }
        }
    }, [currentUserId]);

    // Listen for incoming chat messages via WebSocket
    useEffect(() => {
        if (!currentUserId) return;

        // Connect to WebSocket with token and tenantId
        const token = apiClient.getToken();
        const tenantId = apiClient.getTenantId();
        if (token && tenantId) {
            wsClient.connect(token, tenantId);
        }

        // Check initial unread count
        checkUnreadMessages();

        // Listen for new chat messages
        const handleChatMessage = (data: any) => {
            // Only process messages for current user
            if (data.recipientId === currentUserId) {
                checkUnreadMessages();
            }
        };

        wsClient.on('chat:message', handleChatMessage);

        // Periodically check for unread messages (in case messages arrive when WebSocket is disconnected)
        const interval = setInterval(checkUnreadMessages, 5000);

        return () => {
            wsClient.off('chat:message', handleChatMessage);
            clearInterval(interval);
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

    // Determine allowed pages based on role
    const isAccountsOnly = currentUser?.role === 'Accounts';
    const isAdmin = userRole === 'Admin' || currentUser?.role === 'Admin';

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
                    { page: 'budgets', label: 'Budget Planner', icon: ICONS.barChart },
                    { page: 'loans', label: 'Loan Manager', icon: ICONS.loan },
                ]
            },
            {
                title: 'Operations',
                items: [
                    { page: 'projectManagement', label: 'Projects', icon: ICONS.archive },
                    { page: 'rentalManagement', label: 'Rentals', icon: ICONS.building },
                    { page: 'vendorDirectory', label: 'Vendors', icon: ICONS.briefcase },
                    { page: 'inventory', label: 'My Shop', icon: ICONS.package },
                    ...(isAdmin ? [{ page: 'investmentManagement', label: 'Inv. Cycle', icon: ICONS.dollarSign }] : []),
                    { page: 'pmConfig', label: 'PM Cycle', icon: ICONS.filter },
                ]
            },
            {
                title: 'Tasks',
                items: [
                    { page: 'tasks', label: 'My Tasks', icon: ICONS.checkSquare },
                    { page: 'tasksCalendar', label: 'Calendar', icon: ICONS.calendar },
                    ...(isAdmin ? [{ page: 'teamRanking', label: 'Team Ranking', icon: ICONS.trophy }] : []),
                ]
            },
            {
                title: 'People',
                items: [
                    { page: 'contacts', label: 'Contacts', icon: ICONS.addressBook },
                    { page: 'payroll', label: 'Payroll', icon: ICONS.users },
                ]
            },
            {
                title: 'B2B',
                items: [
                    { page: 'bizPlanet', label: 'Biz Planet', icon: ICONS.globe },
                ]
            }
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
        
        return groups;
    }, [isAdmin, isAccountsOnly]);

    const isCurrent = (itemPage: Page) => {
        if (currentPage === itemPage) return true;
        if (itemPage === 'rentalManagement' && (currentPage.startsWith('rental') || currentPage === 'ownerPayouts')) return true;
        if (itemPage === 'projectManagement' && (currentPage.startsWith('project') || currentPage === 'bills')) return true;
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
                    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 z-50 md:hidden flex flex-col text-slate-300 animate-slide-in-left">
                        
                        {/* Brand Header */}
                        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm">
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
                            {/* Close button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="p-2 -mr-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
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
                                                    onClick={() => {
                                                        setCurrentPage(item.page as Page);
                                                        setIsMobileMenuOpen(false); // Close menu after navigation
                                                    }}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group touch-manipulation
                                            ${active
                                                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30'
                                                            : 'text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-700'
                                                        }`}
                                                >
                                                    <div className={`transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                                        {React.cloneElement(item.icon as any, { width: 18, height: 18 })}
                                                    </div>
                                                    <span className="truncate">{item.label}</span>
                                                    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/50"></div>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>

                        {/* Mobile Footer - Simplified */}
                        <div className="p-3 border-t border-slate-800 bg-slate-900/50">
                            {/* License Status Button */}
                            {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                                <button
                                    onClick={() => {
                                        setIsLicenseModalOpen(true);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full mb-3 text-white p-2.5 rounded-lg shadow-lg relative overflow-hidden group ${
                                        licenseInfo.isExpired 
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
                                    {userRole && (
                                        <div className="text-[10px] text-slate-400 truncate capitalize">
                                            {userRole}
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

                            {/* Online Users & Chat - Mobile */}
                            {onlineUsers !== null && onlineUsers > 1 && (
                                <button
                                    onClick={() => {
                                        setIsChatModalOpen(true);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full mt-2 px-3 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 relative touch-manipulation ${
                                        unreadMessageCount > 0 ? 'animate-pulse' : ''
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

            {/* Premium Dark Sidebar - DESKTOP ONLY (UNCHANGED) */}
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

                    {/* License Status Button */}
                    {licenseInfo && (licenseInfo.isExpired || licenseInfo.daysRemaining <= 30) && (
                        <button
                            onClick={() => setIsLicenseModalOpen(true)}
                            className={`w-full mb-3 text-white p-2.5 rounded-lg shadow-lg relative overflow-hidden group ${
                                licenseInfo.isExpired 
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
                                    {licenseInfo.isExpired ? 'Renew' : 'Renew'}
                                </div>
                            </div>
                        </button>
                    )}

                    <div className="space-y-2">
                        {/* User Info with inline logout */}
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
                                {userRole && (
                                    <div className="text-[10px] text-slate-400 truncate capitalize">
                                        {userRole}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                <span>Logout</span>
                            </button>
                        </div>

                        {/* Online Users Info */}
                        {onlineUsers !== null && onlineUsers > 1 && (
                            <div className="space-y-2">
                                <div className="px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                                    <div className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <circle cx="12" cy="12" r="6"></circle>
                                            <circle cx="12" cy="12" r="2"></circle>
                                        </svg>
                                        <span className="text-[10px] text-slate-400 font-medium">
                                            Online Users: <span className="text-green-400 font-semibold">{onlineUsers}</span>
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsChatModalOpen(true)}
                                    className={`w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors flex items-center justify-center gap-2 relative ${
                                        unreadMessageCount > 0 ? 'animate-pulse' : ''
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
                            </div>
                        )}
                    </div>
                </div>
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
