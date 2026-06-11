import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PersonalTaskRow } from '../../../services/personalTasksService.js';

const TASK_COLS = `t.id, t.user_id, t.title, t.description, t.created_date, t.target_date, t.status, t.progress, t.priority, t.created_at, t.updated_at`;

export class PersonalTaskRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getForUser(client: pg.PoolClient, userId: string, id: string): Promise<PersonalTaskRow | null> {
    const r = await client.query<PersonalTaskRow>(
      `SELECT ${TASK_COLS}
       FROM personal_tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $2
       WHERE t.id = $1 AND t.user_id = $3`,
      [id, this.tenantId, userId]
    );
    return r.rows[0] ?? null;
  }

  async listForUser(client: pg.PoolClient, userId: string): Promise<PersonalTaskRow[]> {
    const r = await client.query<PersonalTaskRow>(
      `SELECT ${TASK_COLS}
       FROM personal_tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.user_id = $2
       ORDER BY t.target_date ASC, t.created_at DESC`,
      [this.tenantId, userId]
    );
    return r.rows;
  }

  async listCalendarMonth(
    client: pg.PoolClient,
    userId: string,
    start: string,
    end: string
  ): Promise<PersonalTaskRow[]> {
    const r = await client.query<PersonalTaskRow>(
      `SELECT ${TASK_COLS}
       FROM personal_tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.user_id = $2 AND t.target_date >= $3::date AND t.target_date <= $4::date
       ORDER BY t.target_date ASC, t.title ASC`,
      [this.tenantId, userId, start, end]
    );
    return r.rows;
  }

  async listUpcoming(client: pg.PoolClient, userId: string, days: number): Promise<PersonalTaskRow[]> {
    const r = await client.query<PersonalTaskRow>(
      `SELECT ${TASK_COLS}
       FROM personal_tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.user_id = $2
         AND t.status NOT IN ('completed', 'cancelled')
         AND t.target_date <= (CURRENT_DATE + $3::integer)`,
      [this.tenantId, userId, days]
    );
    return r.rows;
  }
}
