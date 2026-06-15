import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ApprovalRequestStatus } from '../../../workflow/workflowTypes.js';

export type ApprovalRequestRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  entity_ref: string | null;
  requester_id: string | null;
  status: ApprovalRequestStatus;
  current_level: number;
  max_level: number;
  amount: string | null;
  department_id: string | null;
  project_id: string | null;
  previous_status: string | null;
  target_status: string | null;
  assigned_approver_id: string | null;
  comments: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  deleted_at: Date | null;
};

export type ApprovalRequestWrite = {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_ref?: string | null;
  requester_id?: string | null;
  status?: ApprovalRequestStatus;
  current_level?: number;
  max_level?: number;
  amount?: number | null;
  department_id?: string | null;
  project_id?: string | null;
  previous_status?: string | null;
  target_status?: string | null;
  assigned_approver_id?: string | null;
  comments?: string | null;
};

export class ApprovalRequestRepository extends TenantRepository {
  async insertRequest(client: import('pg').PoolClient, row: ApprovalRequestWrite): Promise<ApprovalRequestRow> {
    const r = await client.query<ApprovalRequestRow>(
      `INSERT INTO approval_requests (
        id, tenant_id, entity_type, entity_id, entity_ref, requester_id, status,
        current_level, max_level, amount, department_id, project_id,
        previous_status, target_status, assigned_approver_id, comments
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      RETURNING *`,
      [
        row.id,
        this.tenantId,
        row.entity_type,
        row.entity_id,
        row.entity_ref ?? null,
        row.requester_id ?? null,
        row.status ?? 'pending',
        row.current_level ?? 1,
        row.max_level ?? 1,
        row.amount ?? null,
        row.department_id ?? null,
        row.project_id ?? null,
        row.previous_status ?? null,
        row.target_status ?? null,
        row.assigned_approver_id ?? null,
        row.comments ?? null,
      ]
    );
    return r.rows[0];
  }

  async getById(client: import('pg').PoolClient, id: string): Promise<ApprovalRequestRow | null> {
    const r = await client.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: import('pg').PoolClient, id: string): Promise<ApprovalRequestRow | null> {
    const r = await client.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listPending(
    client: import('pg').PoolClient,
    filters?: { assignedApproverId?: string; entityType?: string }
  ): Promise<ApprovalRequestRow[]> {
    const clauses = ['tenant_id = $1', 'deleted_at IS NULL', "status = 'pending'"];
    const params: unknown[] = [this.tenantId];
    let idx = 2;
    if (filters?.assignedApproverId) {
      clauses.push(`assigned_approver_id = $${idx++}`);
      params.push(filters.assignedApproverId);
    }
    if (filters?.entityType) {
      clauses.push(`entity_type = $${idx++}`);
      params.push(filters.entityType);
    }
    const r = await client.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );
    return r.rows;
  }

  async listAll(
    client: import('pg').PoolClient,
    filters?: { status?: string; entityType?: string; limit?: number }
  ): Promise<ApprovalRequestRow[]> {
    const clauses = ['tenant_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    let idx = 2;
    if (filters?.status) {
      clauses.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.entityType) {
      clauses.push(`entity_type = $${idx++}`);
      params.push(filters.entityType);
    }
    const limit = filters?.limit ?? 200;
    const r = await client.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );
    return r.rows;
  }

  async updateRequest(
    client: import('pg').PoolClient,
    id: string,
    patch: Partial<{
      status: ApprovalRequestStatus;
      current_level: number;
      assigned_approver_id: string | null;
      comments: string | null;
      resolved_at: Date | null;
    }>
  ): Promise<ApprovalRequestRow | null> {
    const sets: string[] = ['updated_at = NOW()', 'version = version + 1'];
    const params: unknown[] = [this.tenantId, id];
    let idx = 3;
    if (patch.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(patch.status);
    }
    if (patch.current_level !== undefined) {
      sets.push(`current_level = $${idx++}`);
      params.push(patch.current_level);
    }
    if (patch.assigned_approver_id !== undefined) {
      sets.push(`assigned_approver_id = $${idx++}`);
      params.push(patch.assigned_approver_id);
    }
    if (patch.comments !== undefined) {
      sets.push(`comments = $${idx++}`);
      params.push(patch.comments);
    }
    if (patch.resolved_at !== undefined) {
      sets.push(`resolved_at = $${idx++}`);
      params.push(patch.resolved_at);
    }
    const r = await client.query<ApprovalRequestRow>(
      `UPDATE approval_requests SET ${sets.join(', ')}
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    return r.rows[0] ?? null;
  }

  async findActiveForEntity(
    client: import('pg').PoolClient,
    entityType: string,
    entityId: string
  ): Promise<ApprovalRequestRow | null> {
    const r = await client.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
         AND deleted_at IS NULL AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
      [this.tenantId, entityType, entityId]
    );
    return r.rows[0] ?? null;
  }
}
