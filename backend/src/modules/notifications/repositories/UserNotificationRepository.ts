import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { UserNotificationRow, UserNotificationSeverity } from '../types/index.js';

export type CreateUserNotificationInput = {
  userId: string;
  category: string;
  title: string;
  body: string;
  severity?: UserNotificationSeverity;
  actionType?: string;
  actionId?: string;
  entityType?: string;
  entityId?: string;
};

export class UserNotificationRepository extends TenantRepository {
  async create(input: CreateUserNotificationInput): Promise<UserNotificationRow> {
    const id = `notif_${randomUUID().replace(/-/g, '')}`;
    const r = await this.query<UserNotificationRow>(
      `INSERT INTO user_notifications (
         id, tenant_id, user_id, category, title, body, severity,
         action_type, action_id, entity_type, entity_id
       ) VALUES ($2, $1, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        this.tenantId,
        id,
        input.userId,
        input.category,
        input.title,
        input.body,
        input.severity ?? 'info',
        input.actionType ?? null,
        input.actionId ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
      ]
    );
    return r.rows[0]!;
  }

  async listForUser(userId: string, limit = 50): Promise<UserNotificationRow[]> {
    const capped = Math.min(Math.max(limit, 1), 100);
    const r = await this.query<UserNotificationRow>(
      `SELECT * FROM user_notifications
       WHERE tenant_id = $1 AND user_id = $2 AND dismissed_at IS NULL
       ORDER BY created_at DESC
       LIMIT $3`,
      [this.tenantId, userId, capped]
    );
    return r.rows;
  }

  async dismiss(userId: string, notificationId: string): Promise<boolean> {
    const r = await this.query(
      `UPDATE user_notifications SET dismissed_at = NOW()
       WHERE tenant_id = $1 AND user_id = $2 AND id = $3 AND dismissed_at IS NULL`,
      [this.tenantId, userId, notificationId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const r = await this.query(
      `UPDATE user_notifications SET read_at = COALESCE(read_at, NOW())
       WHERE tenant_id = $1 AND user_id = $2 AND id = $3 AND dismissed_at IS NULL`,
      [this.tenantId, userId, notificationId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
