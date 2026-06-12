import { apiClient } from './client';
import type { MobileNotificationItem } from '../../types/executiveMobile.types';

export async function fetchMobileNotifications(): Promise<MobileNotificationItem[]> {
  return apiClient.get<MobileNotificationItem[]>('/mobile/notifications');
}
