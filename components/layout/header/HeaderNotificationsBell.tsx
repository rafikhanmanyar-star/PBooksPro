import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  useContacts,
  useDispatchOnly,
  useInstallmentPlans,
  useProjects,
  useUnits,
  useUsers,
  useWhatsAppMode,
} from '../../../hooks/useSelectiveState';
import { useAuth } from '../../../context/AuthContext';
import { useWhatsApp } from '../../../context/WhatsAppContext';
import { sendOrOpenWhatsApp } from '../../../services/whatsappService';
import { normalizePhoneForMatch } from '../../../services/whatsappChatService';
import { apiClient } from '../../../services/api/client';
import { fetchUpcomingTasks } from '../../personalTransactions/personalTasksService';
import { scheduleIdleWork, cancelScheduledIdle } from '../../../utils/interactionScheduling';
import { isAdminRole } from '../../../hooks/useRecordLock';
import { usePermissions } from '../../../hooks/usePermissions';
import { useDismissUserNotification, useUserNotifications } from '../../../hooks/useUserNotifications';
import type { NotificationItem, TaskBellRow } from './headerNotificationTypes';
import {
  buildPlanNotificationItems,
  buildTaskNotificationItems,
  countPlanNotifications,
  formatNotificationTime,
} from './headerNotificationUtils';

interface HeaderNotificationsBellProps {
  currentUser: { id: string; username?: string; name?: string; role?: string } | null;
}

/** Lazy label context — contacts/projects/units only when panel is open. */
const HeaderNotificationsPanelData = memo(function HeaderNotificationsPanelData({
  onPlanItems,
}: {
  onPlanItems: (items: NotificationItem[]) => void;
}) {
  const installmentPlans = useInstallmentPlans();
  const contacts = useContacts();
  const projects = useProjects();
  const units = useUnits();
  const users = useUsers();
  const [orgUsers, setOrgUsers] = useState<
    { id: string; name: string; username: string; role: string }[]
  >([]);
  const { isAuthenticated, user } = useAuth();
  const { canReadUsers } = usePermissions();
  const usersForNotifications = orgUsers.length > 0 ? orgUsers : users;

  useEffect(() => {
    if (!isAuthenticated || !canReadUsers) {
      setOrgUsers([]);
      return;
    }
    const loadOrgUsers = async () => {
      try {
        const data = await apiClient.get<
          { id: string; name: string; username: string; role: string }[]
        >('/users');
        setOrgUsers(data || []);
      } catch {
        setOrgUsers([]);
      }
    };
    const idleId = scheduleIdleWork(() => {
      void loadOrgUsers();
    }, { timeout: 4000 });
    return () => cancelScheduledIdle(idleId);
  }, [isAuthenticated, canReadUsers]);

  const planLabel = useCallback(
    (planId: string) => {
      const plan = installmentPlans.find((p) => p.id === planId);
      if (!plan) return 'Installment plan';
      const lead = contacts.find((l) => l.id === plan.leadId);
      const project = projects.find((p) => p.id === plan.projectId);
      const unit = units.find((u) => u.id === plan.unitId);
      return `${lead?.name || 'Lead'} • ${project?.name || 'Project'} • ${unit?.name || 'Unit'}`;
    },
    [installmentPlans, contacts, projects, units]
  );

  const currentUser = user
    ? { id: user.id, username: user.username, name: user.name }
    : null;

  const items = useMemo(() => {
    if (!currentUser) return [];
    return buildPlanNotificationItems(
      installmentPlans,
      currentUser,
      usersForNotifications,
      planLabel
    );
  }, [installmentPlans, currentUser, usersForNotifications, planLabel]);

  useEffect(() => {
    onPlanItems(items);
  }, [items, onPlanItems]);

  return null;
});

const HeaderNotificationsBell: React.FC<HeaderNotificationsBellProps> = ({ currentUser }) => {
  const dispatch = useDispatchOnly();
  const [, startNavTransition] = useTransition();
  const { isAuthenticated, user } = useAuth();
  const { openChat } = useWhatsApp();
  const whatsAppMode = useWhatsAppMode();
  const contacts = useContacts();
  const installmentPlans = useInstallmentPlans();

  const isPersonalFinanceAdmin = isAdminRole(user?.role || currentUser?.role);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());
  const [taskBellRows, setTaskBellRows] = useState<TaskBellRow[]>([]);
  const [planItemsWithLabels, setPlanItemsWithLabels] = useState<NotificationItem[]>([]);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const { data: apiNotifications = [] } = useUserNotifications(isAuthenticated);
  const dismissApiNotification = useDismissUserNotification();

  const handlePlanItems = useCallback((items: NotificationItem[]) => {
    setPlanItemsWithLabels(items);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    try {
      const storageKey = `dismissed_notifications_${currentUser.id}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const dismissed = JSON.parse(stored) as string[];
        setDismissedNotifications(new Set(dismissed));
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  const dismissNotification = useCallback(
    (notificationId: string) => {
      if (!currentUser) return;

      if (notificationId.startsWith('notif_')) {
        void dismissApiNotification(notificationId);
        return;
      }

      setDismissedNotifications((prev) => {
        if (prev.has(notificationId)) return prev;
        const updated = new Set(prev);
        updated.add(notificationId);
        try {
          const storageKey = `dismissed_notifications_${currentUser.id}`;
          localStorage.setItem(storageKey, JSON.stringify(Array.from(updated)));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    [currentUser, dismissApiNotification]
  );

  const findContactByPhone = useCallback(
    (phoneNumber: string) => {
      if (!phoneNumber) return undefined;
      const normalized = normalizePhoneForMatch(phoneNumber);
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      const lastTen = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';
      if (!normalized && !lastTen) return undefined;
      return contacts.find((contact) => {
        const contactNumber = contact.contactNo || '';
        if (!contactNumber) return false;
        const contactNormalized = normalizePhoneForMatch(contactNumber);
        if (normalized && contactNormalized && normalized === contactNormalized) return true;
        const contactDigits = contactNumber.replace(/\D/g, '');
        if (lastTen && contactDigits.length >= 10) {
          return contactDigits.slice(-10) === lastTen;
        }
        return false;
      });
    },
    [contacts]
  );

  const taskItems = useMemo(() => buildTaskNotificationItems(taskBellRows), [taskBellRows]);

  const apiItems: NotificationItem[] = useMemo(
    () =>
      apiNotifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.body,
        time: n.createdAt,
        badge: {
          label: n.actionType === 'unposted' ? 'Quick Txn' : n.category,
          tone:
            n.severity === 'urgent'
              ? 'red'
              : n.severity === 'warning'
                ? 'orange'
                : 'blue',
        },
        action:
          n.actionType === 'unposted'
            ? { type: 'unposted' as const, transactionId: n.actionId }
            : { type: 'unposted' as const },
      })),
    [apiNotifications]
  );

  const planItemsForList = isNotificationsOpen ? planItemsWithLabels : [];

  const notifications = useMemo(() => {
    if (!currentUser) return [];
    const items: NotificationItem[] = [...apiItems, ...taskItems, ...planItemsForList];
    return items
      .filter((item) => !dismissedNotifications.has(item.id))
      .sort((a, b) => b.time.localeCompare(a.time));
  }, [currentUser, apiItems, taskItems, planItemsForList, dismissedNotifications]);

  const badgeCount = useMemo(() => {
    if (!currentUser) return 0;
    const dismissed = dismissedNotifications;
    const apiCount = apiItems.filter((item) => !dismissed.has(item.id)).length;
    const taskCount = taskItems.filter((item) => !dismissed.has(item.id)).length;
    const planCount = countPlanNotifications(installmentPlans, currentUser, dismissed);
    return apiCount + taskCount + planCount;
  }, [currentUser, apiItems, taskItems, installmentPlans, dismissedNotifications]);

  const handleNotificationClick = useCallback(
    (notification: NotificationItem) => {
      dismissNotification(notification.id);
      setIsNotificationsOpen(false);

      if (notification.action.type === 'personal_task') {
        window.dispatchEvent(new CustomEvent('pb:set-personal-tab', { detail: { tab: 'My Tasks' } }));
        window.dispatchEvent(
          new CustomEvent('pb:open-personal-task', { detail: { taskId: notification.action.taskId } })
        );
        startNavTransition(() => {
          dispatch({ type: 'SET_PAGE', payload: 'personalTransactions' });
        });
        return;
      }

      if (notification.action.type === 'unposted') {
        startNavTransition(() => {
          dispatch({ type: 'SET_INITIAL_TABS', payload: ['Unposted Transactions'] });
          dispatch({ type: 'SET_PAGE', payload: 'accounting' });
        });
        return;
      }

      if (notification.action.type === 'installment_plan') {
        const planId = notification.action.planId;
        startNavTransition(() => {
          dispatch({ type: 'SET_INITIAL_TABS', payload: ['Marketing'] });
          dispatch({ type: 'SET_PAGE', payload: 'projectManagement' });
        });
        window.setTimeout(() => {
          startNavTransition(() => {
            dispatch({ type: 'SET_EDITING_ENTITY', payload: { type: 'INSTALLMENT_PLAN', id: planId } });
          });
        }, 100);
        return;
      }

      if (notification.action.type === 'whatsapp') {
        const waAction = notification.action;
        const contact =
          contacts.find((item) => item.id === waAction.contactId) ||
          findContactByPhone(waAction.phoneNumber) ||
          null;
        const phone = waAction.phoneNumber || contact?.contactNo;
        const contactLike = contact || (phone ? { id: '', name: phone, contactNo: phone } : null);
        if (contactLike && phone) {
          setTimeout(() => {
            sendOrOpenWhatsApp(
              { contact: contactLike, message: '', phoneNumber: phone },
              () => whatsAppMode,
              openChat
            );
          }, 0);
        } else {
          setTimeout(() => openChat(contact, waAction.phoneNumber), 0);
        }
      }
    },
    [
      dispatch,
      dismissNotification,
      openChat,
      contacts,
      whatsAppMode,
      findContactByPhone,
      startNavTransition,
    ]
  );

  const handleClearAllNotifications = useCallback(() => {
    startNavTransition(() => {
      notifications.forEach((item) => dismissNotification(item.id));
    });
  }, [notifications, dismissNotification, startNavTransition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isNotificationsOpen &&
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || !isPersonalFinanceAdmin) {
      setTaskBellRows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await fetchUpcomingTasks(currentUser.id, 7);
        if (cancelled) return;
        setTaskBellRows(
          rows.map((r) => ({
            id: r.id,
            title: r.title,
            targetDate: r.targetDate,
            status: r.status,
            updatedAt: r.updatedAt,
            createdAt: r.createdAt,
          }))
        );
      } catch {
        if (!cancelled) setTaskBellRows([]);
      }
    };
    void load();
    const interval = window.setInterval(load, 5 * 60_000);
    const onTasksChanged = () => {
      void load();
    };
    window.addEventListener('pb:tasks-changed', onTasksChanged);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('pb:tasks-changed', onTasksChanged);
    };
  }, [isAuthenticated, currentUser?.id, isPersonalFinanceAdmin]);

  return (
    <div className="relative" ref={notificationsRef}>
      {isNotificationsOpen && <HeaderNotificationsPanelData onPlanItems={handlePlanItems} />}

      <button
        onClick={() => setIsNotificationsOpen((prev) => !prev)}
        className="p-2 rounded-full text-app-muted hover:bg-black/5 dark:hover:bg-white/10 hover:text-indigo-600 transition-colors relative flex min-w-[44px] min-h-[44px] touch-manipulation items-center justify-center"
        title={badgeCount > 0 ? `${badgeCount} notifications` : 'Notifications'}
        aria-label="Notifications"
        aria-expanded={isNotificationsOpen}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badgeCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {isNotificationsOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-app-modal border border-app-border rounded-xl shadow-xl overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-app-text">Notifications</h3>
              <span className="text-xs text-slate-500">({notifications.length})</span>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllNotifications}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-sm text-app-muted text-center">No new notifications</div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className="group relative hover:bg-app-table-hover border-b border-app-border last:border-b-0"
                >
                  <button
                    onClick={() => handleNotificationClick(item)}
                    className="w-full text-left px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-app-text">{item.title}</p>
                        <p className="text-xs text-app-muted mt-0.5">{item.message}</p>
                        {formatNotificationTime(item.time) && (
                          <p className="text-[11px] text-app-muted mt-1">
                            {formatNotificationTime(item.time)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          item.badge.tone === 'blue'
                            ? 'bg-blue-100 text-blue-700'
                            : item.badge.tone === 'green'
                              ? 'bg-green-100 text-green-700'
                              : item.badge.tone === 'orange'
                                ? 'bg-orange-100 text-orange-700'
                                : item.badge.tone === 'red'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.badge.label}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissNotification(item.id);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-app-table-hover text-app-muted hover:text-app-text"
                    title="Dismiss notification"
                    aria-label="Dismiss notification"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(HeaderNotificationsBell);
