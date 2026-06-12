import type pg from 'pg';
import { resolveEnterpriseRole } from '../../../auth/permissions.js';
import { emitUserNotification } from '../../../core/realtime.js';
import { UserNotificationRepository } from '../repositories/UserNotificationRepository.js';
import { rowToUserNotificationApi, type UserNotificationApi } from '../types/index.js';

const FINANCE_REVIEW_ROLES = new Set(['accountant', 'company_admin', 'super_admin']);

export async function listUserNotifications(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  limit = 50
): Promise<UserNotificationApi[]> {
  const repo = new UserNotificationRepository(tenantId, client);
  const rows = await repo.listForUser(userId, limit);
  return rows.map(rowToUserNotificationApi);
}

export async function dismissUserNotification(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  notificationId: string
): Promise<boolean> {
  const repo = new UserNotificationRepository(tenantId, client);
  return repo.dismiss(userId, notificationId);
}

export async function markUserNotificationRead(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  notificationId: string
): Promise<boolean> {
  const repo = new UserNotificationRepository(tenantId, client);
  return repo.markRead(userId, notificationId);
}

export async function listFinanceReviewRecipientIds(
  client: pg.PoolClient,
  tenantId: string,
  excludeUserId?: string
): Promise<string[]> {
  const r = await client.query<{ id: string; role: string }>(
    `SELECT id, role FROM users
     WHERE tenant_id = $1 AND is_active = TRUE`,
    [tenantId]
  );
  return r.rows
    .filter((row) => {
      if (excludeUserId && row.id === excludeUserId) return false;
      return FINANCE_REVIEW_ROLES.has(resolveEnterpriseRole(row.role));
    })
    .map((row) => row.id);
}

export async function createUserNotification(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    userId: string;
    category: string;
    title: string;
    body: string;
    severity?: 'info' | 'warning' | 'urgent';
    actionType?: string;
    actionId?: string;
    entityType?: string;
    entityId?: string;
  }
): Promise<UserNotificationApi> {
  const repo = new UserNotificationRepository(tenantId, client);
  const row = await repo.create({
    userId: input.userId,
    category: input.category,
    title: input.title,
    body: input.body,
    severity: input.severity,
    actionType: input.actionType,
    actionId: input.actionId,
    entityType: input.entityType,
    entityId: input.entityId,
  });
  const api = rowToUserNotificationApi(row);
  emitUserNotification(tenantId, input.userId, api.id);
  return api;
}

export async function createUserNotifications(
  client: pg.PoolClient,
  tenantId: string,
  userIds: string[],
  input: Omit<Parameters<typeof createUserNotification>[2], 'userId'>
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const userId of unique) {
    await createUserNotification(client, tenantId, { ...input, userId });
  }
}
