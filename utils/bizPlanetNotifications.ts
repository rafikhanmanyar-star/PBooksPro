export type BizPlanetNotificationTarget = 'supplier' | 'buyer';

export type BizPlanetNotificationFocus = {
  type: 'registration' | 'po' | 'invoice' | 'registration_request' | 'invoice_awaiting';
  id?: string;
};

export type BizPlanetNotification = {
  id: string;
  title: string;
  message: string;
  time: string;
  target: BizPlanetNotificationTarget;
  focus: BizPlanetNotificationFocus;
};

export type BizPlanetNotificationAction = {
  target: BizPlanetNotificationTarget;
  focus: BizPlanetNotificationFocus;
};

const STORAGE_KEY = 'bizPlanet_notifications_v1';
const PENDING_ACTION_KEY = 'bizPlanet_pending_action_v1';
export const BIZ_PLANET_NOTIFICATIONS_EVENT = 'bizPlanet:notifications-updated';
export const BIZ_PLANET_NOTIFICATION_ACTION_EVENT = 'bizPlanet:notification-click';

type StoredNotifications = {
  supplier: BizPlanetNotification[];
  buyer: BizPlanetNotification[];
};

const getEmptyStore = (): StoredNotifications => ({
  supplier: [],
  buyer: []
});

const readStoredNotifications = (): StoredNotifications => {
  if (typeof window === 'undefined') return getEmptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getEmptyStore();
    const parsed = JSON.parse(raw) as Partial<StoredNotifications> | null;
    return {
      supplier: parsed?.supplier || [],
      buyer: parsed?.buyer || []
    };
  } catch {
    return getEmptyStore();
  }
};

const writeStoredNotifications = (stored: StoredNotifications) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore storage failures
  }
};

export const updateBizPlanetNotifications = (
  target: BizPlanetNotificationTarget,
  notifications: BizPlanetNotification[]
) => {
  if (typeof window === 'undefined') return;
  const stored = readStoredNotifications();
  stored[target] = notifications;
  writeStoredNotifications(stored);
  const merged = [...stored.supplier, ...stored.buyer];
  window.dispatchEvent(new CustomEvent(BIZ_PLANET_NOTIFICATIONS_EVENT, { detail: merged }));
};

export const getBizPlanetNotifications = (): BizPlanetNotification[] => {
  const stored = readStoredNotifications();
  return [...stored.supplier, ...stored.buyer];
};

export const setPendingBizPlanetAction = (action: BizPlanetNotificationAction) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
  } catch {
    // ignore storage failures
  }
};

export const consumePendingBizPlanetAction = (): BizPlanetNotificationAction | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(PENDING_ACTION_KEY);
    return JSON.parse(raw) as BizPlanetNotificationAction;
  } catch {
    return null;
  }
};

export const dispatchBizPlanetNotificationAction = (action: BizPlanetNotificationAction) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BIZ_PLANET_NOTIFICATION_ACTION_EVENT, { detail: action }));
};
