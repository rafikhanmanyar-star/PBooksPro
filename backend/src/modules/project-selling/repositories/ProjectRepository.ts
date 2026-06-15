import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ProjectRow } from '../services/projectsService.js';

const PROJECT_COLUMNS = `id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`;

export type ProjectWriteFields = {
  name: string;
  location: string | null;
  project_type: string | null;
  description: string | null;
  color: string | null;
  status: string;
  pm_config: string | null;
  installment_config: string | null;
};

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

  async insertProject(
    client: pg.PoolClient,
    id: string,
    fields: ProjectWriteFields,
    userId: string | null
  ): Promise<ProjectRow> {
    const r = await client.query<ProjectRow>(
      `INSERT INTO projects (
         id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, 1, NULL, NOW(), NOW())
       RETURNING ${PROJECT_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.name,
        fields.location,
        fields.project_type,
        fields.description,
        fields.color,
        fields.status,
        fields.pm_config,
        fields.installment_config,
        userId,
      ]
    );
    return r.rows[0]!;
  }

  async updateActive(client: pg.PoolClient, id: string, fields: ProjectWriteFields): Promise<ProjectRow | null> {
    const r = await client.query<ProjectRow>(
      `UPDATE projects SET
         name = $3, location = $4, project_type = $5, description = $6, color = $7, status = $8,
         pm_config = $9::jsonb, installment_config = $10::jsonb,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PROJECT_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.name,
        fields.location,
        fields.project_type,
        fields.description,
        fields.color,
        fields.status,
        fields.pm_config,
        fields.installment_config,
      ]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<{ ok: boolean; row: ProjectRow | null }> {
    const r = await client.query<ProjectRow>(
      `UPDATE projects SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PROJECT_COLUMNS}`,
      [id, this.tenantId]
    );
    return { ok: (r.rowCount ?? 0) > 0, row: r.rows[0] ?? null };
  }
}
