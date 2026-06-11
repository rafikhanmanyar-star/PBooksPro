import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { DocumentMetadataRow } from '../types/index.js';

export class DocumentRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async insertMetadata(
    client: pg.PoolClient,
    input: Omit<DocumentMetadataRow, 'tenant_id' | 'uploaded_at' | 'deleted_at' | 'deleted_by' | 'version' | 'created_at' | 'updated_at'>
  ): Promise<DocumentMetadataRow> {
    const id = input.id || randomUUID();
    const r = await client.query<DocumentMetadataRow>(
      `INSERT INTO document_metadata (
         id, tenant_id, entity_type, entity_id, file_name, storage_key,
         mime_type, file_size, uploaded_by, uploaded_at, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 1, NOW(), NOW())
       RETURNING *`,
      [
        id,
        this.tenantId,
        input.entity_type,
        input.entity_id,
        input.file_name,
        input.storage_key,
        input.mime_type,
        input.file_size,
        input.uploaded_by,
      ]
    );
    return r.rows[0];
  }

  async getById(client: pg.PoolClient, id: string): Promise<DocumentMetadataRow | null> {
    const r = await client.query<DocumentMetadataRow>(
      `SELECT * FROM document_metadata WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listByEntity(
    client: pg.PoolClient,
    entityType: string,
    entityId: string
  ): Promise<DocumentMetadataRow[]> {
    const r = await client.query<DocumentMetadataRow>(
      `SELECT * FROM document_metadata
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3 AND deleted_at IS NULL
       ORDER BY uploaded_at DESC`,
      [this.tenantId, entityType, entityId]
    );
    return r.rows;
  }
}
