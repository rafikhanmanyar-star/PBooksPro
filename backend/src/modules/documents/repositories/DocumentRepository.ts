import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { DocumentMetadataRow } from '../types/index.js';

export type DocumentListFilters = {
  entityType?: string;
  entityId?: string;
};

export class DocumentRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async insertMetadata(
    client: pg.PoolClient,
    input: {
      id?: string;
      name: string;
      type: string;
      entity_type: string;
      entity_id: string;
      file_name: string;
      storage_key: string;
      mime_type: string | null;
      file_size: number;
      uploaded_by: string | null;
      inline_data: Buffer | null;
      uploaded_at?: Date;
      version?: number;
    }
  ): Promise<DocumentMetadataRow> {
    const id = input.id?.trim() || randomUUID();
    const uploadedAt = input.uploaded_at ?? new Date();
    const version = input.version ?? 1;
    const r = await client.query<DocumentMetadataRow>(
      `INSERT INTO document_metadata (
         id, tenant_id, name, type, entity_type, entity_id, file_name, storage_key,
         mime_type, file_size, uploaded_by, uploaded_at, inline_data, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $12, $12)
       RETURNING *`,
      [
        id,
        this.tenantId,
        input.name,
        input.type,
        input.entity_type,
        input.entity_id,
        input.file_name,
        input.storage_key,
        input.mime_type,
        input.file_size,
        input.uploaded_by,
        uploadedAt,
        input.inline_data,
        version,
      ]
    );
    return r.rows[0]!;
  }

  async metadataRowExists(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM document_metadata WHERE tenant_id = $1 AND id = $2`,
      [this.tenantId, id]
    );
    return r.rows.length > 0;
  }

  async getById(client: pg.PoolClient, id: string): Promise<DocumentMetadataRow | null> {
    const r = await client.query<DocumentMetadataRow>(
      `SELECT * FROM document_metadata
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(
    client: pg.PoolClient,
    id: string
  ): Promise<DocumentMetadataRow | null> {
    const r = await client.query<DocumentMetadataRow>(
      `SELECT * FROM document_metadata WHERE tenant_id = $1 AND id = $2`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async list(
    client: pg.PoolClient,
    filters?: DocumentListFilters
  ): Promise<DocumentMetadataRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT * FROM document_metadata
             WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.entityType) {
      params.push(filters.entityType);
      q += ` AND entity_type = $${params.length}`;
    }
    if (filters?.entityId) {
      params.push(filters.entityId);
      q += ` AND entity_id = $${params.length}`;
    }
    q += ' ORDER BY uploaded_at DESC, id ASC';
    const r = await client.query<DocumentMetadataRow>(q, params);
    return r.rows;
  }

  async updateMetadata(
    client: pg.PoolClient,
    id: string,
    input: {
      name: string;
      type: string;
      entity_type: string;
      entity_id: string;
      file_name: string;
      storage_key: string;
      mime_type: string | null;
      file_size: number;
      uploaded_by: string | null;
      inline_data: Buffer | null;
    }
  ): Promise<DocumentMetadataRow | null> {
    const r = await client.query<DocumentMetadataRow>(
      `UPDATE document_metadata SET
         name = $3, type = $4, entity_type = $5, entity_id = $6, file_name = $7,
         storage_key = $8, mime_type = $9, file_size = $10,
         uploaded_by = COALESCE($11, uploaded_by),
         inline_data = $12, version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [
        this.tenantId,
        id,
        input.name,
        input.type,
        input.entity_type,
        input.entity_id,
        input.file_name,
        input.storage_key,
        input.mime_type,
        input.file_size,
        input.uploaded_by,
        input.inline_data,
      ]
    );
    return r.rows[0] ?? null;
  }

  async restoreSoftDeleted(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE document_metadata
       SET deleted_at = NULL, deleted_by = NULL, version = 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [this.tenantId, id]
    );
  }

  async softDeleteById(
    client: pg.PoolClient,
    id: string,
    deletedBy: string | null
  ): Promise<number> {
    const r = await client.query(
      `UPDATE document_metadata
       SET deleted_at = NOW(), deleted_by = $3, version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id, deletedBy]
    );
    return r.rowCount ?? 0;
  }
}
