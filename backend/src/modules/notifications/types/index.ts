export type UserNotificationSeverity = 'info' | 'warning' | 'urgent';

export type UserNotificationRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  category: string;
  title: string;
  body: string;
  severity: UserNotificationSeverity;
  action_type: string | null;
  action_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: Date | null;
  dismissed_at: Date | null;
  created_at: Date;
};

export type UserNotificationApi = {
  id: string;
  category: string;
  title: string;
  body: string;
  severity: UserNotificationSeverity;
  createdAt: string;
  readAt?: string;
  actionType?: string;
  actionId?: string;
  entityType?: string;
  entityId?: string;
};

export function rowToUserNotificationApi(row: UserNotificationRow): UserNotificationApi {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    severity: row.severity,
    createdAt: row.created_at.toISOString(),
    ...(row.read_at ? { readAt: row.read_at.toISOString() } : {}),
    ...(row.action_type ? { actionType: row.action_type } : {}),
    ...(row.action_id ? { actionId: row.action_id } : {}),
    ...(row.entity_type ? { entityType: row.entity_type } : {}),
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
  };
}
