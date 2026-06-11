import type pg from 'pg';
import type { LegacyDocumentRow } from '../types/legacyDocumentRow.js';
import { DocumentStorageService } from './DocumentStorageService.js';

export type DocumentBackfillStats = {
  tenantId: string;
  scanned: number;
  migrated: number;
  skipped: number;
  failed: number;
  bytesMoved: number;
  errors: Array<{ documentId: string; message: string }>;
};

export type DocumentBackfillOptions = {
  dryRun?: boolean;
  limit?: number;
  onProgress?: (message: string) => void;
};

function decodeLegacyFileData(fileData: string): Buffer {
  const trimmed = fileData.trim();
  if (!trimmed) return Buffer.alloc(0);
  if (trimmed.startsWith('data:')) {
    const comma = trimmed.indexOf(',');
    if (comma === -1) throw new Error('Invalid data URL in file_data');
    return Buffer.from(trimmed.slice(comma + 1), 'base64');
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length > 0) return decoded;
  } catch {
    /* fall through */
  }
  return Buffer.from(trimmed, 'utf8');
}

export async function listLegacyDocumentsPendingMigration(
  client: pg.PoolClient,
  tenantId: string,
  limit?: number
): Promise<LegacyDocumentRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT d.*
           FROM documents d
           WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM document_metadata m
               WHERE m.tenant_id = d.tenant_id AND m.id = d.id
             )
           ORDER BY d.uploaded_at ASC, d.id ASC`;
  if (limit != null && limit > 0) {
    params.push(limit);
    q += ` LIMIT $${params.length}`;
  }
  const r = await client.query<LegacyDocumentRow>(q, params);
  return r.rows;
}

export async function listTenantsWithLegacyDocuments(
  client: pg.PoolClient
): Promise<string[]> {
  const r = await client.query<{ tenant_id: string }>(
    `SELECT DISTINCT d.tenant_id
     FROM documents d
     WHERE d.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM document_metadata m
         WHERE m.tenant_id = d.tenant_id AND m.id = d.id
       )
     ORDER BY d.tenant_id`
  );
  return r.rows.map((row) => row.tenant_id);
}

async function softDeleteLegacyDocumentRow(
  client: pg.PoolClient,
  tenantId: string,
  documentId: string
): Promise<void> {
  await client.query(`SELECT set_config('pbooks.documents_backfill', '1', true)`);
  try {
    await client.query(
      `UPDATE documents
       SET deleted_at = NOW(), version = version + 1
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, documentId]
    );
  } finally {
    await client.query(`SELECT set_config('pbooks.documents_backfill', '0', true)`);
  }
}

/**
 * Phase 2 — copy legacy documents.file_data into document_metadata (+ R2 or inline_data),
 * then soft-delete the legacy row to prevent dual-read duplicates.
 */
export async function backfillLegacyDocumentsForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options: DocumentBackfillOptions = {}
): Promise<DocumentBackfillStats> {
  const stats: DocumentBackfillStats = {
    tenantId,
    scanned: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    bytesMoved: 0,
    errors: [],
  };

  const rows = await listLegacyDocumentsPendingMigration(client, tenantId, options.limit);
  stats.scanned = rows.length;
  const storage = new DocumentStorageService(tenantId);

  for (const row of rows) {
    try {
      if (await storage.repo.metadataRowExists(client, row.id)) {
        stats.skipped += 1;
        options.onProgress?.(`skip ${row.id} (metadata exists)`);
        continue;
      }

      const fileBuffer = decodeLegacyFileData(row.file_data);
      if (fileBuffer.length === 0) {
        stats.skipped += 1;
        options.onProgress?.(`skip ${row.id} (empty file_data)`);
        continue;
      }

      if (options.dryRun) {
        stats.migrated += 1;
        stats.bytesMoved += fileBuffer.length;
        options.onProgress?.(`dry-run migrate ${row.id} (${fileBuffer.length} bytes)`);
        continue;
      }

      const { storageKey, inlineData } = await storage.persistBytes(client, {
        documentId: row.id,
        entityType: row.entity_type,
        fileName: row.file_name,
        body: fileBuffer,
      });

      await storage.repo.insertMetadata(client, {
        id: row.id,
        name: row.name,
        type: row.type,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        file_name: row.file_name,
        storage_key: storageKey,
        mime_type: row.mime_type,
        file_size: row.file_size > 0 ? row.file_size : fileBuffer.length,
        uploaded_by: row.uploaded_by ?? row.user_id,
        inline_data: inlineData,
        uploaded_at: row.uploaded_at,
        version: row.version,
      });

      await softDeleteLegacyDocumentRow(client, tenantId, row.id);

      stats.migrated += 1;
      stats.bytesMoved += fileBuffer.length;
      options.onProgress?.(`migrated ${row.id} → ${storageKey}`);
    } catch (e) {
      stats.failed += 1;
      const message = e instanceof Error ? e.message : String(e);
      stats.errors.push({ documentId: row.id, message });
      options.onProgress?.(`failed ${row.id}: ${message}`);
    }
  }

  return stats;
}

export async function backfillLegacyDocumentsAllTenants(
  client: pg.PoolClient,
  options: DocumentBackfillOptions = {}
): Promise<DocumentBackfillStats[]> {
  const tenantIds = await listTenantsWithLegacyDocuments(client);
  const results: DocumentBackfillStats[] = [];
  for (const tenantId of tenantIds) {
    options.onProgress?.(`--- tenant ${tenantId} ---`);
    results.push(await backfillLegacyDocumentsForTenant(client, tenantId, options));
  }
  return results;
}

/** @internal exported for tests */
export { decodeLegacyFileData };
