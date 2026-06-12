import { apiClient } from './client';

export type UserNotificationItem = {
  id: string;
  category: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'urgent';
  createdAt: string;
  readAt?: string;
  actionType?: string;
  actionId?: string;
  entityType?: string;
  entityId?: string;
};

export async function fetchUserNotifications(): Promise<UserNotificationItem[]> {
  return apiClient.get<UserNotificationItem[]>('/notifications');
}

export async function dismissUserNotification(notificationId: string): Promise<void> {
  await apiClient.post(`/notifications/${encodeURIComponent(notificationId)}/dismiss`, {});
}

export async function markUserNotificationRead(notificationId: string): Promise<void> {
  await apiClient.post(`/notifications/${encodeURIComponent(notificationId)}/read`, {});
}
