import React, { useState, memo, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import SearchModal from './SearchModal';
import HelpModal from './HelpModal';
import { WhatsAppChatService } from '../../services/whatsappChatService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import ConnectionStatusIndicator from '../ui/ConnectionStatusIndicator';
import SyncStatusIndicator from '../ui/SyncStatusIndicator';
import { apiClient } from '../../services/api/client';
import {
  BizPlanetNotification,
  BIZ_PLANET_NOTIFICATIONS_EVENT,
  dispatchBizPlanetNotificationAction,
  getBizPlanetNotifications,
  setPendingBizPlanetAction
} from '../../utils/bizPlanetNotifications';

interface HeaderProps {
  title: string;
  isNavigating?: boolean;
}

const Header: React.FC<HeaderProps> = ({ title, isNavigating = false }) => {
  const { dispatch, state } = useAppContext();
  const { isAuthenticated } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile menu logic if needed
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [whatsappUnreadCount, setWhatsappUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string; username: string; role: string }[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());
  const [bizPlanetNotifications, setBizPlanetNotifications] = useState<BizPlanetNotification[]>([]);
  const { openChat } = useWhatsApp();
  const notificationsRef = useRef<HTMLDivElement>(null);
  const usersForNotifications = orgUsers.length > 0 ? orgUsers : state.users;

  type NotificationBadgeTone = 'blue' | 'green' | 'red' | 'orange' | 'slate';

  type NotificationItem = {
    id: string;
    title: string;
    message: string;
    time: string;
    badge: {
      label: string;
      tone: NotificationBadgeTone;
    };
    action: { type: 'installment_plan'; planId: string } | { type: 'bizPlanet'; target: BizPlanetNotification['target']; focus: BizPlanetNotification['focus'] };
  };

  // Load dismissed notifications from localStorage on mount
  useEffect(() => {
    if (!state.currentUser) return;
    
    try {
      const storageKey = `dismissed_notifications_${state.currentUser.id}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const dismissed = JSON.parse(stored) as string[];
        setDismissedNotifications(new Set(dismissed));
        console.log('[NOTIFICATIONS] Loaded dismissed notifications:', dismissed.length);
      }
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to load dismissed notifications:', error);
    }
  }, [state.currentUser]);

  const dismissNotification = useCallback((notificationId: string) => {
    if (!state.currentUser) {
      console.warn('[NOTIFICATIONS] Cannot dismiss notification: no current user');
      return;
    }
    
    console.log('[NOTIFICATIONS] Dismissing notification:', notificationId);
    
    setDismissedNotifications(prev => {
      // Check if already dismissed
      if (prev.has(notificationId)) {
        console.log('[NOTIFICATIONS] Notification already dismissed:', notificationId);
        return prev;
      }
      
      const updated = new Set(prev);
      updated.add(notificationId);
      
      // Save to localStorage immediately to persist dismissal
      try {
        const storageKey = `dismissed_notifications_${state.currentUser.id}`;
        const dismissedArray = Array.from(updated);
        localStorage.setItem(storageKey, JSON.stringify(dismissedArray));
        console.log('[NOTIFICATIONS] Saved dismissed notification to localStorage:', notificationId, 'Total dismissed:', dismissedArray.length);
      } catch (error) {
        console.error('[NOTIFICATIONS] Failed to save dismissed notifications:', error);
      }
      
      return updated;
    });
  }, [state.currentUser]);

  const notifications = useMemo(() => {
    if (!state.currentUser) return [];
    const currentUserId = state.currentUser.id;

    const planLabel = (planId: string) => {
      const plan = state.installmentPlans.find(p => p.id === planId);
      if (!plan) return 'Installment plan';
      const lead = state.contacts.find(l => l.id === plan.leadId);
      const project = state.projects.find(p => p.id === plan.projectId);
      const unit = state.units.find(u => u.id === plan.unitId);
      return `${lead?.name || 'Lead'} • ${project?.name || 'Project'} • ${unit?.name || 'Unit'}`;
    };

    const userName = (userId?: string) => {
      if (!userId) return undefined;
      const user = usersForNotifications.find(u => u.id === userId);
      return user?.name || user?.username;
    };

    const isMatchingCurrentUser = (value?: string) => {
      if (!value || !state.currentUser) return false;
      const candidates = [
        state.currentUser.id,
        state.currentUser.username,
        state.currentUser.name
      ].filter(Boolean).map(item => item.toString().toLowerCase());
      const normalizedValue = value.toString().toLowerCase();
      const matches = candidates.includes(normalizedValue);
      return matches;
    };

    const items: NotificationItem[] = (state.installmentPlans || []).flatMap(plan => {
      const time = plan.updatedAt || plan.createdAt || '';
      const normalizedStatus = (plan.status || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
      const isPendingApproval = normalizedStatus === 'pending approval';
      const isApprovedStatus = normalizedStatus === 'approved';
      const isRejectedStatus = normalizedStatus === 'rejected';
      const base = {
        time
      };

      const results: NotificationItem[] = [];

      const getStatusTone = (status: string): NotificationBadgeTone => {
        if (status === 'Pending Approval') return 'blue';
        if (status === 'Approved') return 'green';
        if (status === 'Rejected') return 'red';
        return 'slate';
      };

      // 1. You are the approver and someone requested your approval
      const isApprover = isPendingApproval && (plan.approvalRequestedToId === currentUserId || isMatchingCurrentUser(plan.approvalRequestedToId));
      if (isApprover) {
        console.log('[NOTIFICATION DEBUG] Found approval notification:', {
          planId: plan.id,
          approvalRequestedToId: plan.approvalRequestedToId,
          currentUserId,
          directMatch: plan.approvalRequestedToId === currentUserId,
          fuzzyMatch: isMatchingCurrentUser(plan.approvalRequestedToId)
        });
        const requester = userName(plan.approvalRequestedById || plan.userId);
        results.push({
          ...base,
          id: `approval:${plan.id}`,
          title: 'Plan approval requested',
          message: requester ? `${planLabel(plan.id)} • Requested by ${requester}` : planLabel(plan.id),
          badge: {
            label: 'Pending Approval',
            tone: getStatusTone('Pending Approval')
          },
          action: { type: 'installment_plan', planId: plan.id }
        });
      }

      // 2. You are the creator/requester and someone approved/rejected your plan
      if ((isApprovedStatus || isRejectedStatus) && (
        plan.approvalRequestedById === currentUserId ||
        plan.userId === currentUserId ||
        isMatchingCurrentUser(plan.approvalRequestedById) ||
        isMatchingCurrentUser(plan.userId)
      )) {
        const reviewer = userName(plan.approvalReviewedById);
        results.push({
          ...base,
          id: `decision:${plan.id}:${plan.status}`,
          title: `Plan ${plan.status.toLowerCase()}`,
          message: reviewer ? `${planLabel(plan.id)} • Reviewed by ${reviewer}` : planLabel(plan.id),
          badge: {
            label: plan.status,
            tone: getStatusTone(plan.status)
          },
          action: { type: 'installment_plan', planId: plan.id }
        });
      }

      return results;
    });

    const bizPlanetItems: NotificationItem[] = (bizPlanetNotifications || []).map(item => ({
      id: item.id,
      title: item.title,
      message: item.message,
      time: item.time,
      badge: {
        label: item.target === 'supplier' ? 'Supplier Portal' : 'Buyer Dashboard',
        tone: 'slate'
      },
      action: {
        type: 'bizPlanet',
        target: item.target,
        focus: item.focus
      }
    }));

    // Filter out dismissed notifications - ensure they never reappear
    const activeNotifications = [...items, ...bizPlanetItems].filter(item => {
      const isDismissed = dismissedNotifications.has(item.id);
      if (isDismissed) {
        console.log('[NOTIFICATIONS] Filtering out dismissed notification:', item.id);
      }
      return !isDismissed;
    });

    console.log('[NOTIFICATION DEBUG] Notifications:', {
      total: items.length + bizPlanetItems.length,
      dismissed: dismissedNotifications.size,
      active: activeNotifications.length,
      currentUserId,
      currentUsername: state.currentUser.username,
      currentName: state.currentUser.name
    });

    return activeNotifications.sort((a, b) => b.time.localeCompare(a.time));
  }, [state.currentUser, state.installmentPlans, state.contacts, state.projects, state.units, usersForNotifications, dismissedNotifications, bizPlanetNotifications]);

  const handleNotificationClick = useCallback((notification: NotificationItem) => {
    console.log('[NOTIFICATION CLICK] Opening notification:', notification.id);

    // Dismiss the notification immediately - this will remove it from the bell icon
    dismissNotification(notification.id);

    // Close notification dropdown
    setIsNotificationsOpen(false);

    if (notification.action.type === 'installment_plan') {
      const planId = notification.action.planId;
      // Navigate to marketing page
      dispatch({ type: 'SET_PAGE', payload: 'marketing' });

      // Set editing entity after a small delay to ensure page is loaded
      setTimeout(() => {
        console.log('[NOTIFICATION CLICK] Setting editing entity for plan:', planId);
        dispatch({ type: 'SET_EDITING_ENTITY', payload: { type: 'INSTALLMENT_PLAN', id: planId } });
      }, 100);
      return;
    }

    const action = { target: notification.action.target, focus: notification.action.focus };
    if (state.currentPage !== 'bizPlanet') {
      setPendingBizPlanetAction(action);
    }
    dispatch({ type: 'SET_PAGE', payload: 'bizPlanet' });
    setTimeout(() => {
      dispatchBizPlanetNotificationAction(action);
    }, 150);
  }, [dispatch, dismissNotification, state.currentPage]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isNotificationsOpen) return;
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loadNotifications = () => setBizPlanetNotifications(getBizPlanetNotifications());
    loadNotifications();
    const handleNotificationsUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as BizPlanetNotification[] | undefined;
      if (Array.isArray(detail)) {
        setBizPlanetNotifications(detail);
      } else {
        loadNotifications();
      }
    };
    window.addEventListener(BIZ_PLANET_NOTIFICATIONS_EVENT, handleNotificationsUpdate);
    return () => window.removeEventListener(BIZ_PLANET_NOTIFICATIONS_EVENT, handleNotificationsUpdate);
  }, []);

  useEffect(() => {
    const loadOrgUsers = async () => {
      try {
        const data = await apiClient.get<{ id: string; name: string; username: string; role: string }[]>('/users');
        setOrgUsers(data || []);
      } catch (error) {
        console.error('Failed to load organization users', error);
        setOrgUsers([]);
      }
    };
    loadOrgUsers();
  }, []);

  // Load WhatsApp unread count - only when authenticated
  useEffect(() => {
    // Skip if not authenticated to prevent 401 errors
    if (!isAuthenticated) {
      setWhatsappUnreadCount(0);
      return;
    }

    const loadUnreadCount = async () => {
      try {
        const count = await WhatsAppChatService.getUnreadCount();
        setWhatsappUnreadCount(count);
      } catch (error) {
        // Silently fail if WhatsApp is not configured
        setWhatsappUnreadCount(0);
      }
    };

    loadUnreadCount();
    // Refresh every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleWhatsAppNotificationClick = useCallback(() => {
    // Open chat window - if there are unread messages, we could show a list
    // For now, just open the chat window (user can select contact)
    openChat();
  }, [openChat]);

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

            {/* Connection Status & Sync Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200">
              <ConnectionStatusIndicator showLabel={true} />
              <SyncStatusIndicator showDetails={false} />
            </div>

            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setIsNotificationsOpen(prev => !prev)}
                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors relative flex min-w-[44px] min-h-[44px] touch-manipulation items-center justify-center"
                title={notifications.length > 0 ? `${notifications.length} notifications` : 'Notifications'}
                aria-label="Notifications"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1 1-3.46 0"></path></svg>
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                    {notifications.length > 99 ? '99+' : notifications.length}
                  </span>
                )}
              </button>
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-40">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
                      <span className="text-xs text-slate-500">({notifications.length})</span>
                    </div>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => {
                          notifications.forEach(item => dismissNotification(item.id));
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500 text-center">No new notifications</div>
                    ) : (
                      notifications.map(item => (
                        <div
                          key={item.id}
                          className="group relative hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <button
                            onClick={() => handleNotificationClick(item)}
                            className="w-full text-left px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{item.message}</p>
                              </div>
                              <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                item.badge.tone === 'blue'
                                  ? 'bg-blue-100 text-blue-700'
                                  : item.badge.tone === 'green'
                                    ? 'bg-green-100 text-green-700'
                                    : item.badge.tone === 'orange'
                                      ? 'bg-orange-100 text-orange-700'
                                      : item.badge.tone === 'red'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-slate-100 text-slate-700'
                              }`}>
                                {item.badge.label}
                              </span>
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(item.id);
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                            title="Dismiss notification"
                            aria-label="Dismiss notification"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleWhatsAppNotificationClick}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors relative group min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
              title={whatsappUnreadCount > 0 ? `${whatsappUnreadCount} unread WhatsApp messages` : 'WhatsApp Messages'}
              aria-label="WhatsApp Messages"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"></path></svg>
              {whatsappUnreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1.5 bg-green-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                  {whatsappUnreadCount > 99 ? '99+' : whatsappUnreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
              title="Help & Support"
              aria-label="Help & Support"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

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
