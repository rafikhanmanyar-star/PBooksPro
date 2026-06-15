import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PersonalTaskRow } from '../services/personalTasksService.js';

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

  async insertTask(
    client: pg.PoolClient,
    id: string,
    userId: string,
    title: string,
    description: string | null,
    createdDate: string,
    targetDate: string,
    status: string,
    progress: number,
    priority: string
  ): Promise<PersonalTaskRow> {
    const r = await client.query<PersonalTaskRow>(
      `INSERT INTO personal_tasks (
         id, user_id, title, description, created_date, target_date, status, progress, priority
       ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9)
       RETURNING id, user_id, title, description, created_date, target_date, status, progress, priority, created_at, updated_at`,
      [id, userId, title, description, createdDate, targetDate, status, progress, priority]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    userId: string,
    title: string,
    description: string | null,
    targetDate: string,
    status: string,
    progress: number,
    priority: string
  ): Promise<PersonalTaskRow | null> {
    const r = await client.query<PersonalTaskRow>(
      `UPDATE personal_tasks SET
         title = $1, description = $2, target_date = $3::date, status = $4, progress = $5, priority = $6, updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING id, user_id, title, description, created_date, target_date, status, progress, priority, created_at, updated_at`,
      [title, description, targetDate, status, progress, priority, id, userId]
    );
    return r.rows[0] ?? null;
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

  async userBelongsToTenant(client: pg.PoolClient, userId: string): Promise<boolean> {
    const r = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, this.tenantId]
    );
    return Number(r.rows[0]?.c ?? 0) > 0;
  }

  async deleteForUser(client: pg.PoolClient, id: string, userId: string): Promise<boolean> {
    const r = await client.query(
      `DELETE FROM personal_tasks WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
