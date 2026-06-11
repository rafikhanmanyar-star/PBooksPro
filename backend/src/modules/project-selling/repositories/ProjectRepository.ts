import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ProjectRow } from '../../../services/projectsService.js';

const PROJECT_COLUMNS = `id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`;

export class ProjectRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ProjectRow | null> {
    const r = await client.query<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<ProjectRow[]> {
    const r = await client.query<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ProjectRow[]> {
    const r = await client.query<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
       FROM projects WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
