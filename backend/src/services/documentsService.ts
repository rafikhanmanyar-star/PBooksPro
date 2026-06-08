import type pg from 'pg';
import { randomUUID } from 'crypto';

export type DocumentRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  entity_id: string;
  entity_type: string;
  file_data: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  uploaded_at: Date;
  uploaded_by: string | null;
};

export function rowToDocumentApi(row: DocumentRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    type: row.type,
    entityId: row.entity_id,
    entityType: row.entity_type,
    fileData: row.file_data,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    uploadedAt: row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : row.uploaded_at,
    uploadedBy: row.uploaded_by ?? row.user_id ?? undefined,
    userId: row.user_id ?? undefined,
    version: row.version,
  };
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  const fileSizeRaw = body.fileSize ?? body.file_size;
  const fileSize = Number(fileSizeRaw);
  return {
    name: String(body.name ?? '').trim(),
    type: String(body.type ?? '').trim(),
    entity_id: String(body.entityId ?? body.entity_id ?? '').trim(),
    entity_type: String(body.entityType ?? body.entity_type ?? '').trim(),
    file_data: String(body.fileData ?? body.file_data ?? ''),
    file_name: String(body.fileName ?? body.file_name ?? body.name ?? '').trim(),
    file_size: Number.isFinite(fileSize) ? fileSize : 0,
    mime_type: String(body.mimeType ?? body.mime_type ?? 'application/octet-stream').trim(),
    uploaded_by: (body.uploadedBy ?? body.uploaded_by) as string | null | undefined,
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

const SELECT_COLS = `id, tenant_id, name, type, entity_id, entity_type, file_data, file_name, file_size, mime_type, user_id, version, deleted_at, uploaded_at, uploaded_by`;

export async function listDocuments(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { entityType?: string; entityId?: string }
): Promise<DocumentRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT ${SELECT_COLS}
           FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (filters?.entityType) {
    params.push(filters.entityType);
    q += ` AND entity_type = $${params.length}`;
  }
  if (filters?.entityId) {
    params.push(filters.entityId);
    q += ` AND entity_id = $${params.length}`;
  }
  q += ' ORDER BY uploaded_at DESC, id ASC';
  const r = await client.query<DocumentRow>(q, params);
  return r.rows;
}

export async function getDocumentById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<DocumentRow | null> {
  const r = await client.query<DocumentRow>(
    `SELECT ${SELECT_COLS}
     FROM documents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

async function getDocumentByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<DocumentRow | null> {
  const r = await client.query<DocumentRow>(
    `SELECT ${SELECT_COLS}
     FROM documents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

async function insertDocument(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  p: ReturnType<typeof pickBody>,
  actorUserId: string | null
): Promise<DocumentRow> {
  const r = await client.query<DocumentRow>(
    `INSERT INTO documents (id, tenant_id, name, type, entity_id, entity_type, file_data, file_name, file_size, mime_type, user_id, version, deleted_at, uploaded_at, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, NULL, NOW(), $12)
     RETURNING ${SELECT_COLS}`,
    [
      id,
      tenantId,
      p.name,
      p.type,
      p.entity_id,
      p.entity_type,
      p.file_data,
      p.file_name,
      p.file_size,
      p.mime_type,
      p.user_id ?? actorUserId,
      p.uploaded_by ?? actorUserId,
    ]
  );
  return r.rows[0]!;
}

async function updateDocumentRow(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  p: ReturnType<typeof pickBody>
): Promise<DocumentRow> {
  const r = await client.query<DocumentRow>(
    `UPDATE documents SET
       name = $3, type = $4, entity_id = $5, entity_type = $6, file_data = $7,
       file_name = $8, file_size = $9, mime_type = $10,
       user_id = COALESCE($11, user_id), uploaded_by = COALESCE($12, uploaded_by),
       version = version + 1
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING ${SELECT_COLS}`,
    [
      id,
      tenantId,
      p.name,
      p.type,
      p.entity_id,
      p.entity_type,
      p.file_data,
      p.file_name,
      p.file_size,
      p.mime_type,
      p.user_id ?? null,
      p.uploaded_by ?? null,
    ]
  );
  if (!r.rows[0]) throw new Error('Document not found.');
  return r.rows[0];
}

export async function upsertDocument(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: DocumentRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');
  if (!p.type) throw new Error('type is required.');
  if (!p.entity_id) throw new Error('entityId is required.');
  if (!p.entity_type) throw new Error('entityType is required.');
  if (!p.file_data) throw new Error('fileData is required.');
  if (!p.file_name) throw new Error('fileName is required.');

  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `doc_${randomUUID().replace(/-/g, '')}`;

  const existing = await getDocumentByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await insertDocument(client, tenantId, id, p, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }

  if (existing.deleted_at) {
    await client.query(
      `UPDATE documents SET deleted_at = NULL, version = 1 WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
  }

  if (p.version != null && p.version !== existing.version) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const row = await updateDocumentRow(client, tenantId, id, p);
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteDocument(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const existing = await getDocumentById(client, tenantId, id);
  if (!existing) return { ok: false, conflict: false };
  if (expectedVersion != null && existing.version !== expectedVersion) {
    return { ok: false, conflict: true };
  }
  await client.query(
    `UPDATE documents SET deleted_at = NOW(), version = version + 1
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: true, conflict: false };
}
